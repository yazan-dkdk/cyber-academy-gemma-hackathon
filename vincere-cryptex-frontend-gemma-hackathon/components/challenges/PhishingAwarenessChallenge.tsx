"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { GlowCard } from "@/components/ui/GlowCard";
import { InputField } from "@/components/ui/InputField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import {
  ArrowBackIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  DocumentTextIcon,
  EmailIcon,
  LockIcon,
  ShieldKeyIcon,
  ShieldLockIcon,
} from "@/components/ui/icons";
import { isStudentUser } from "@/lib/auth-roles";
import { buildBackendApiUrl } from "@/lib/backend-api";
import { cn } from "@/lib/cn";

const correctTrainingFlag = "CYBER_SAFE_PHISHING_101";
const challengeSlug = "phishing-awareness";
const challengeApiPath = `/api/student/challenges/${challengeSlug}`;
const lessonHref = "/courses/network-defense-foundations/lessons/ndf-firewall-rules";
const nextRecommendedHref = "/courses/network-defense-foundations/lessons/ndf-injection-testing";
const aiTutorEndpoint = buildBackendApiUrl("/ai-tutor", "/ask");
const localSafeHint =
  "Look at the sender, urgency, link destination, and attachment behavior. Do not click links or download files.";
const challengeRewardXp = 100;

type ChallengeStatus =
  | "not-started"
  | "in-progress"
  | "solved"
  | "already-solved"
  | "failed-attempt"
  | "session-expired"
  | "error";

type SubmissionFeedback =
  | "idle"
  | "success"
  | "retry"
  | "already-solved"
  | "session-expired"
  | "error";

type AiHintState = {
  status: "idle" | "loading" | "success" | "fallback";
  answer: string | null;
  blocked: boolean;
};

type ChallengeSubmissionResponse = {
  correct: boolean;
  alreadySolved: boolean;
  pointsAwarded: number;
  attemptsCount: number;
  solvedAt: string | null;
  message: string;
};

type ChallengeSnapshot = {
  alreadySolved: boolean | null;
  pointsAwarded: number | null;
  attemptsCount: number | null;
  solvedAt: string | null;
  message: string | null;
};

type AiTutorHintResponse = {
  answer: string;
  blocked: boolean;
};

const warningSigns = [
  {
    id: "sender-domain",
    label: "Suspicious sender domain",
    detail: "The sender uses a lookalike academy support domain with extra words.",
  },
  {
    id: "urgent-pressure",
    label: "Urgent pressure language",
    detail: "The email threatens account suspension in minutes to force a rushed decision.",
  },
  {
    id: "fake-login-url",
    label: "Fake login URL",
    detail: "The destination is not the normal Vincere Cryptex login path.",
  },
  {
    id: "unexpected-attachment",
    label: "Unexpected attachment",
    detail: "A compressed reset file is not expected for routine account verification.",
  },
  {
    id: "poor-grammar",
    label: "Poor grammar",
    detail: "Awkward wording and typos reduce confidence that this is an official notice.",
  },
  {
    id: "credential-request",
    label: "Requests for credentials",
    detail: "The message asks the learner to confirm a password from an email link.",
  },
];

const emailClues = [
  "From domain does not match the platform brand",
  "Threatens account suspension in 15 minutes",
  "Login URL points to an unrelated reset host",
  "Asks for password confirmation",
  "Unexpected compressed attachment",
  "Awkward grammar in the message body",
];

const challengeStatusContent: Record<
  ChallengeStatus,
  {
    label: string;
    detail: string;
    toneClass: string;
    progressLabel: string;
  }
> = {
  "not-started": {
    label: "Not Started",
    detail: "Review the email artifact, then mark signals before submitting.",
    toneClass: "border-white/12 bg-white/[0.03] text-foreground/72",
    progressLabel: "Ready",
  },
  "in-progress": {
    label: "In Progress",
    detail: "Signals are being triaged. Submit when the flag is ready.",
    toneClass: "border-secondary/28 bg-secondary/10 text-secondary",
    progressLabel: "Active",
  },
  solved: {
    label: "Solved",
    detail: "Challenge complete. Backend progress has been recorded.",
    toneClass: "border-primary/34 bg-primary/10 text-primary",
    progressLabel: "Solved",
  },
  "already-solved": {
    label: "Already Solved",
    detail: "Backend confirmed this challenge was solved before. No extra points awarded.",
    toneClass: "border-primary/34 bg-primary/10 text-primary",
    progressLabel: "Solved",
  },
  "failed-attempt": {
    label: "Failed Attempt",
    detail: "The backend rejected the last flag. Re-check the evidence and try again.",
    toneClass: "border-tertiary/34 bg-tertiary/10 text-tertiary",
    progressLabel: "Retry",
  },
  "session-expired": {
    label: "Session Expired",
    detail: "Your session expired. Sign in again before submitting this challenge.",
    toneClass: "border-tertiary/34 bg-tertiary/10 text-tertiary",
    progressLabel: "Sign In",
  },
  error: {
    label: "Submission Error",
    detail: "The backend could not verify this attempt. Try again in a moment.",
    toneClass: "border-tertiary/34 bg-tertiary/10 text-tertiary",
    progressLabel: "Retry",
  },
};

const challengeMilestones = [
  { label: "Intro", threshold: 12 },
  { label: "Signals", threshold: 60 },
  { label: "Flag", threshold: 86 },
  { label: "Solved", threshold: 100 },
];

class ChallengeApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ChallengeApiError";
    this.status = status;
    this.data = data;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (Array.isArray(value)) {
    const messages = value.map(readMessage).filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join(" ") : null;
  }

  return null;
}

function extractApiMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const topLevelMessage = readMessage(payload.message);

  if (topLevelMessage) {
    return topLevelMessage;
  }

  if (!isRecord(payload.error)) {
    return null;
  }

  return readMessage(payload.error.message);
}

async function parseChallengePayload(response: Response) {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? { message: text } : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }

  return null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFirstBoolean(records: Record<string, unknown>[], keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = readBoolean(record[key]);

      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

function readFirstNumber(records: Record<string, unknown>[], keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = readNumber(record[key]);

      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

function readFirstString(records: Record<string, unknown>[], keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = readString(record[key]);

      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

function normalizeChallengeSubmission(payload: unknown): ChallengeSubmissionResponse | null {
  if (!isRecord(payload)) {
    return null;
  }

  const correct = readBoolean(payload.correct);
  const alreadySolved = readBoolean(payload.alreadySolved);
  const pointsAwarded = readNumber(payload.pointsAwarded);
  const attemptsCount = readNumber(payload.attemptsCount);

  if (
    correct === null ||
    alreadySolved === null ||
    pointsAwarded === null ||
    attemptsCount === null
  ) {
    return null;
  }

  return {
    correct,
    alreadySolved,
    pointsAwarded,
    attemptsCount,
    solvedAt: readString(payload.solvedAt),
    message:
      readMessage(payload.message) ??
      (alreadySolved
        ? "Challenge already solved. No extra points awarded."
        : correct
          ? "Correct flag. Challenge solved."
          : "Invalid flag. Try again."),
  };
}

function normalizeChallengeSnapshot(payload: unknown): ChallengeSnapshot | null {
  if (!isRecord(payload)) {
    return null;
  }

  const records = [
    payload,
    payload.challenge,
    payload.progress,
    payload.submission,
    payload.userProgress,
    payload.challengeProgress,
  ].filter(isRecord);

  const snapshot: ChallengeSnapshot = {
    alreadySolved: readFirstBoolean(records, ["alreadySolved", "solved", "isSolved", "completed"]),
    pointsAwarded: readFirstNumber(records, ["pointsAwarded", "earnedPoints", "scoreAwarded"]),
    attemptsCount: readFirstNumber(records, ["attemptsCount", "attemptCount", "attempts"]),
    solvedAt: readFirstString(records, ["solvedAt", "completedAt"]),
    message: readFirstString(records, ["message", "statusMessage"]),
  };

  if (
    snapshot.alreadySolved === null &&
    snapshot.pointsAwarded === null &&
    snapshot.attemptsCount === null &&
    snapshot.solvedAt === null &&
    snapshot.message === null
  ) {
    return null;
  }

  return snapshot;
}

async function fetchChallengeSnapshot() {
  const response = await fetch(challengeApiPath, {
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await parseChallengePayload(response);

  if (response.status === 401) {
    throw new ChallengeApiError(
      "Your session expired. Please sign in again before submitting this challenge.",
      response.status,
      payload,
    );
  }

  if (!response.ok) {
    throw new ChallengeApiError(
      extractApiMessage(payload) ?? "Challenge state could not be loaded.",
      response.status,
      payload,
    );
  }

  return normalizeChallengeSnapshot(payload);
}

async function submitChallengeFlag(flag: string) {
  const response = await fetch(`${challengeApiPath}/submit`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ flag }),
  });
  const payload = await parseChallengePayload(response);

  if (response.status === 401) {
    throw new ChallengeApiError(
      "Your session expired. Please sign in again before submitting this challenge.",
      response.status,
      payload,
    );
  }

  const submission = normalizeChallengeSubmission(payload);

  if (!response.ok && submission) {
    return submission;
  }

  if (!response.ok) {
    throw new ChallengeApiError(
      extractApiMessage(payload) ?? "Challenge submission failed.",
      response.status,
      payload,
    );
  }

  if (!submission) {
    throw new ChallengeApiError("Challenge submission returned an invalid response.", response.status, payload);
  }

  return submission;
}

function formatPoints(points: number) {
  return points > 0 ? `+${points}` : `${points}`;
}

function formatSolvedAt(solvedAt: string | null) {
  if (!solvedAt) {
    return null;
  }

  const solvedAtDate = new Date(solvedAt);

  if (Number.isNaN(solvedAtDate.getTime())) {
    return solvedAt;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(solvedAtDate);
}

function ChallengeAccessLoading() {
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <GlowCard tone="cyan" className="w-full max-w-xl px-8 py-10 text-center">
        <p className="font-label text-[0.72rem] uppercase text-primary/72">Practice Challenges</p>
        <h1 className="mt-4 font-display text-4xl font-bold text-white">
          Checking access...
        </h1>
      </GlowCard>
    </section>
  );
}

function ChallengePreview() {
  return (
    <section className="relative flex flex-1 overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.025)_1px,transparent_1px)] bg-[size:34px_34px] opacity-45" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[linear-gradient(180deg,rgba(0,240,255,0.11),transparent_74%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 lg:gap-7">
        <GlowCard
          tone="pink"
          className="dashboard-card-3d dashboard-border-sweep dashboard-challenge-card dashboard-premium-card px-6 py-7 sm:px-8 lg:px-10"
        >
          <div className="relative z-10 flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="border border-tertiary/28 bg-tertiary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-tertiary">
                Public Preview
              </span>
              <span className="border border-primary/24 bg-primary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-primary">
                Sign in to solve
              </span>
            </div>

            <div>
              <h1 className="font-display text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                Phishing Awareness Challenge
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-foreground/72 sm:text-lg">
                Preview a beginner defensive-analysis challenge. The flag input, checklist
                workflow, local progress, and AI Tutor hint actions are available only after
                student authentication.
              </p>
            </div>

            <div className="grid gap-4 border-t border-white/8 pt-6 md:grid-cols-3">
              <MetricCard label="Category" value="Defensive Analysis" tone="cyan" />
              <MetricCard label="Difficulty" value="Beginner" tone="secondary" />
              <MetricCard label="Access" value="Student Sign-In" tone="tertiary" />
            </div>

            <div className="border border-white/10 bg-white/[0.025] px-4 py-4 text-sm leading-7 text-foreground/68">
              Frontend gating is a UX support layer only. Backend RBAC remains authoritative for
              challenge access and submissions.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                data-tone="pink"
                className="primary-button dashboard-cta-pulse px-5 py-3 text-[0.72rem]"
              >
                <span className="primary-button__sweep" />
                <span className="relative z-10 inline-flex items-center justify-center gap-2">
                  Sign In
                  <ArrowRightIcon className="h-4 w-4" />
                </span>
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-12 items-center justify-center border border-secondary/24 bg-secondary/10 px-4 py-3 font-label text-[0.68rem] uppercase text-secondary transition-all duration-300 hover:border-secondary/44 hover:bg-secondary/16"
              >
                Create Account
              </Link>
            </div>
          </div>
        </GlowCard>
      </div>
    </section>
  );
}

function InteractivePhishingAwarenessChallenge() {
  const [selectedSigns, setSelectedSigns] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<SubmissionFeedback>("idle");
  const [attemptCount, setAttemptCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChallengeLoading, setIsChallengeLoading] = useState(true);
  const [submissionResult, setSubmissionResult] = useState<ChallengeSubmissionResponse | null>(
    null,
  );
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [hintState, setHintState] = useState<AiHintState>({
    status: "idle",
    answer: null,
    blocked: false,
  });

  const isAlreadySolved = feedback === "already-solved";
  const isSolved = feedback === "success" || isAlreadySolved;
  const isSubmitLocked = isSolved || feedback === "session-expired";
  const selectedCount = selectedSigns.length;
  const hasStarted =
    selectedCount > 0 ||
    answer.trim().length > 0 ||
    attemptCount > 0 ||
    hintState.status !== "idle";
  const challengeStatus: ChallengeStatus =
    feedback === "session-expired"
      ? "session-expired"
      : feedback === "error"
        ? "error"
        : isAlreadySolved
          ? "already-solved"
          : isSolved
            ? "solved"
            : feedback === "retry"
              ? "failed-attempt"
              : hasStarted
                ? "in-progress"
                : "not-started";
  const statusContent = challengeStatusContent[challengeStatus];
  const rawAwardedPoints = submissionResult?.pointsAwarded ?? (isSolved ? challengeRewardXp : 0);
  const displayedAwardedPoints = isAlreadySolved ? 0 : rawAwardedPoints;
  const solvedAtLabel = formatSolvedAt(submissionResult?.solvedAt ?? null);
  const solvedAtValue = solvedAtLabel ?? "Not reported";
  const rewardMetricValue = isSolved
    ? `${formatPoints(displayedAwardedPoints)} XP`
    : `${challengeRewardXp} XP`;
  const scoreValue = isSolved
    ? isAlreadySolved
      ? "No extra XP awarded"
      : `${formatPoints(displayedAwardedPoints)} XP awarded`
    : `${challengeRewardXp} XP available`;
  const attemptCounterDetail = isChallengeLoading
    ? "Syncing challenge state..."
    : feedback === "session-expired"
      ? "Sign in again to keep solving"
      : attemptCount === 0
        ? "No submissions yet"
        : isAlreadySolved
          ? "Challenge was already solved"
          : isSolved
            ? "Solved submission accepted"
            : "Last invalid attempt is ready for review";
  const solveStateValue =
    feedback === "session-expired"
      ? "Expired"
      : isAlreadySolved
        ? "Already"
        : isSolved
          ? "Solved"
          : "Open";
  const progress = useMemo(() => {
    if (isSolved) {
      return 100;
    }

    if (!hasStarted) {
      return 0;
    }

    const checklistProgress = Math.min(selectedCount, 3) * 20;
    const answerProgress = answer.trim().length > 0 ? 18 : 0;

    return Math.min(checklistProgress + answerProgress + 12, 86);
  }, [answer, hasStarted, isSolved, selectedCount]);
  const canSubmit = !isSubmitLocked && !isSubmitting && answer.trim().length > 0;
  const safeHintButtonLabel =
    hintState.status === "loading" ? "Generating safe hint..." : "Give me a safe challenge hint";

  useEffect(() => {
    let isMounted = true;

    async function loadChallengeState() {
      try {
        const snapshot = await fetchChallengeSnapshot();

        if (!isMounted || !snapshot) {
          return;
        }

        if (snapshot.attemptsCount !== null) {
          setAttemptCount(snapshot.attemptsCount);
        }

        if (snapshot.alreadySolved || snapshot.solvedAt) {
          const attempts = snapshot.attemptsCount ?? 0;

          setSubmissionResult({
            correct: true,
            alreadySolved: true,
            pointsAwarded: snapshot.pointsAwarded ?? 0,
            attemptsCount: attempts,
            solvedAt: snapshot.solvedAt,
            message: snapshot.message ?? "Challenge already solved. No extra points awarded.",
          });
          setSubmissionMessage(snapshot.message ?? "Challenge already solved. No extra points awarded.");
          setFeedback("already-solved");
          setAttemptCount(attempts);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ChallengeApiError && error.status === 401) {
          setFeedback("session-expired");
          setSubmissionMessage(error.message);
        }
      } finally {
        if (isMounted) {
          setIsChallengeLoading(false);
        }
      }
    }

    void loadChallengeState();

    return () => {
      isMounted = false;
    };
  }, []);

  function toggleWarningSign(optionId: string) {
    if (isSubmitLocked) {
      return;
    }

    setSelectedSigns((currentSigns) =>
      currentSigns.includes(optionId)
        ? currentSigns.filter((currentId) => currentId !== optionId)
        : [...currentSigns, optionId],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const flag = answer.trim();

    if (isSubmitLocked || isSubmitting || !flag) {
      return;
    }

    setIsSubmitting(true);
    setFeedback("idle");
    setSubmissionMessage(null);

    try {
      const result = await submitChallengeFlag(flag);

      setSubmissionResult(result);
      setSubmissionMessage(result.message);
      setAttemptCount(result.attemptsCount);

      if (result.alreadySolved) {
        setFeedback("already-solved");
      } else if (result.correct) {
        setFeedback("success");
      } else {
        setFeedback("retry");
      }
    } catch (error) {
      if (error instanceof ChallengeApiError && error.status === 401) {
        setFeedback("session-expired");
        setSubmissionMessage(error.message);
      } else {
        setFeedback("error");
        setSubmissionMessage(
          error instanceof Error ? error.message : "Challenge submission failed.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function normalizeHintResponse(payload: unknown): AiTutorHintResponse {
    if (!payload || typeof payload !== "object") {
      throw new Error("AI Tutor returned an invalid response.");
    }

    const response = payload as Partial<Record<keyof AiTutorHintResponse, unknown>>;

    if (typeof response.answer !== "string" || !response.answer.trim()) {
      throw new Error("AI Tutor returned an empty hint.");
    }

    return {
      answer: hideTrainingFlag(response.answer.trim()),
      blocked: response.blocked === true,
    };
  }

  function hideTrainingFlag(hintAnswer: string) {
    return hintAnswer
      .replace(new RegExp(correctTrainingFlag, "gi"), "[training flag hidden]")
      .replace(/\b[A-Z0-9_-]*FLAG\{[^}\r\n]{1,200}\}/gi, "[training flag hidden]")
      .replace(/\b(?:flag|answer|solution)\s*[:=]\s*["'`]?[^"'`\s\r\n]{3,200}/gi, (match) => {
        const [label] = match.split(/[:=]/);

        return `${label.trim()}: [hidden]`;
      });
  }

  async function askForSafeHint() {
    if (hintState.status === "loading") {
      return;
    }

    setHintState({
      status: "loading",
      answer: null,
      blocked: false,
    });

    try {
      const response = await fetch(aiTutorEndpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseTitle: "Network Defense Foundations",
          lessonTitle: "Phishing Awareness Challenge",
          lessonContent:
            [
              "This is an authorized cybersecurity learning simulation. The learner is analyzing a suspicious email artifact to identify warning signs.",
              "Challenge category: Defensive Analysis. Difficulty: Beginner.",
              `Current learner status: ${statusContent.label}. Warning signs selected: ${selectedCount} of ${warningSigns.length}. Flag attempts: ${attemptCount}.`,
              "The suspicious artifact includes a lookalike sender domain, urgent pressure, a fake login URL, a credential request, and an unexpected compressed attachment.",
              "Safety boundary: provide educational defensive guidance only. Do not reveal or infer the final flag, final answer, exploit payloads, phishing instructions, credential-harvesting steps, bypasses, hidden answers, or real-world offensive procedures.",
            ].join("\n"),
          userQuestion: "Give me a safe challenge hint",
          mode: "hint",
        }),
      });

      if (!response.ok) {
        throw new Error(`AI Tutor request failed (${response.status}).`);
      }

      const hintResponse = normalizeHintResponse(await response.json());

      setHintState({
        status: "success",
        answer: hintResponse.answer,
        blocked: hintResponse.blocked,
      });
    } catch {
      setHintState({
        status: "fallback",
        answer: localSafeHint,
        blocked: false,
      });
    }
  }

  return (
    <section className="relative flex flex-1 overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.025)_1px,transparent_1px)] bg-[size:34px_34px] opacity-45" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[linear-gradient(180deg,rgba(0,240,255,0.11),transparent_74%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 lg:gap-7">
        <GlowCard
          tone="cyan"
          className="dashboard-card-3d dashboard-border-sweep dashboard-premium-card px-6 py-7 sm:px-8 lg:px-10"
        >
          <div className="relative z-10 flex flex-col gap-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="border border-primary/28 bg-primary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-primary">
                    Practice Challenges
                  </span>
                  <span
                    className={cn(
                      "border px-3 py-1 font-label text-[0.68rem] uppercase",
                      statusContent.toneClass,
                    )}
                  >
                    {statusContent.label}
                  </span>
                </div>
                <h1 className="mt-5 font-display text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                  Phishing Awareness Challenge
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-foreground/72 sm:text-lg">
                  Analyze the email artifact, mark the warning signs, and submit the safe training
                  flag when your defensive assessment is ready.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
                  <div className={cn("border px-4 py-4", statusContent.toneClass)}>
                    <p className="font-label text-[0.62rem] uppercase opacity-72">Challenge State</p>
                    <p className="mt-2 text-sm leading-6 text-foreground/74">{statusContent.detail}</p>
                  </div>
                  <div className="border border-white/8 bg-white/[0.025] px-4 py-4">
                    <p className="font-label text-[0.62rem] uppercase text-foreground/42">
                      Attempt Counter
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">{attemptCount}</p>
                    <p className="mt-1 text-xs leading-5 text-foreground/52">
                      {attemptCounterDetail}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-[25rem]">
                <button
                  type="button"
                  disabled={hintState.status === "loading"}
                  className="inline-flex min-h-12 items-center justify-center gap-2 border border-secondary/24 bg-secondary/10 px-4 py-3 font-label text-[0.68rem] uppercase text-secondary transition-all duration-300 hover:border-secondary/44 hover:bg-secondary/16 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
                  onClick={() => void askForSafeHint()}
                >
                  {safeHintButtonLabel}
                  <ShieldKeyIcon className="h-4 w-4" />
                </button>
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-12 items-center justify-center gap-2 border border-primary/24 bg-primary/10 px-4 py-3 font-label text-[0.68rem] uppercase text-primary transition-all duration-300 hover:border-primary/44 hover:bg-primary/16"
                >
                  <ArrowBackIcon className="h-4 w-4" />
                  Dashboard
                </Link>
                <Link
                  href={lessonHref}
                  className="inline-flex min-h-12 items-center justify-center gap-2 border border-secondary/24 bg-secondary/10 px-4 py-3 font-label text-[0.68rem] uppercase text-secondary transition-all duration-300 hover:border-secondary/44 hover:bg-secondary/16"
                >
                  Lesson
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="grid gap-4 border-t border-white/8 pt-6 md:grid-cols-4">
              <MetricCard label="Category" value="Defensive Analysis" tone="cyan" />
              <MetricCard label="Difficulty" value="Beginner" tone="secondary" />
              <MetricCard label="Reward" value={rewardMetricValue} tone="primary" />
              <MetricCard label="Status" value={statusContent.progressLabel} tone="tertiary" />
            </div>

            <div
              role="progressbar"
              aria-label="Challenge progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-label text-[0.66rem] uppercase text-primary">
                  Challenge Progress
                </span>
                <span className="font-label text-[0.66rem] uppercase text-white">{progress}%</span>
              </div>
              <div className="dashboard-progress-track dashboard-progress-beam h-2.5 overflow-hidden bg-surface-container-highest shadow-[inset_0_0_16px_rgba(0,0,0,0.42)]">
                <div
                  className="dashboard-progress-bar dashboard-progress-animated h-full bg-gradient-to-r from-primary via-secondary to-tertiary shadow-[0_0_18px_rgba(0,240,255,0.52)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {challengeMilestones.map((milestone) => {
                  const isReached = progress >= milestone.threshold;

                  return (
                    <div key={milestone.label} className="min-w-0">
                      <span
                        className={cn(
                          "block h-1.5 transition-all duration-500",
                          isReached
                            ? "bg-primary shadow-[0_0_14px_rgba(0,240,255,0.5)]"
                            : "bg-white/10",
                        )}
                      />
                      <span
                        className={cn(
                          "mt-2 block truncate font-label text-[0.56rem] uppercase",
                          isReached ? "text-primary" : "text-foreground/36",
                        )}
                      >
                        {milestone.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </GlowCard>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <GlowCard
              tone="pink"
              className="dashboard-card-3d dashboard-border-sweep dashboard-glow-sweep dashboard-challenge-card dashboard-premium-card px-6 py-7 sm:px-8"
            >
              <div className="relative z-10 space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-label text-[0.68rem] uppercase text-tertiary/78">
                      Main Challenge
                    </p>
                    <h2 className="mt-3 font-display text-3xl font-semibold text-white">
                      Phishing Awareness Challenge
                    </h2>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 border border-tertiary/28 bg-tertiary/10 px-3 py-1 font-label text-[0.64rem] uppercase text-tertiary">
                    <BoltIcon className="h-3.5 w-3.5" />
                    Beginner
                  </span>
                  <span className={cn("inline-flex w-fit items-center gap-2 border px-3 py-1 font-label text-[0.64rem] uppercase", statusContent.toneClass)}>
                    <ShieldLockIcon className="h-3.5 w-3.5" />
                    {statusContent.label}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="border border-white/8 bg-white/[0.025] p-4">
                    <p className="font-label text-[0.62rem] uppercase text-foreground/42">
                      Category
                    </p>
                    <p className="mt-2 text-base font-semibold text-white">Defensive Analysis</p>
                  </div>
                  <div className="border border-white/8 bg-white/[0.025] p-4">
                    <p className="font-label text-[0.62rem] uppercase text-foreground/42">Score</p>
                    <p className="mt-2 text-base font-semibold text-primary">
                      {scoreValue}
                    </p>
                  </div>
                </div>

                <div className="border border-primary/18 bg-[#050811]/86 shadow-[0_0_34px_rgba(0,240,255,0.08)]">
                  <div className="flex flex-col gap-4 border-b border-white/8 bg-white/[0.025] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-primary/24 bg-primary/10 text-primary">
                        <EmailIcon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-label text-[0.62rem] uppercase text-foreground/42">
                          Suspicious Email
                        </p>
                        <p className="mt-1 text-sm font-semibold text-white">
                          URGENT: your academy login expire soon
                        </p>
                      </div>
                    </div>
                    <span className="w-fit border border-tertiary/24 bg-tertiary/10 px-3 py-1 font-label text-[0.62rem] uppercase text-tertiary">
                      Do Not Interact
                    </span>
                  </div>

                  <div className="grid gap-3 border-b border-white/8 px-4 py-5 text-sm md:grid-cols-[8rem_minmax(0,1fr)]">
                    <span className="font-label uppercase tracking-[0.16em] text-foreground/38">
                      From
                    </span>
                    <span className="break-words text-tertiary">
                      Vincere Support &lt;security-alert@vincere-cryptex-support.co&gt;
                    </span>
                    <span className="font-label uppercase tracking-[0.16em] text-foreground/38">
                      Reply-To
                    </span>
                    <span className="break-words text-foreground/70">
                      verify-desk@account-reset-help.example
                    </span>
                    <span className="font-label uppercase tracking-[0.16em] text-foreground/38">
                      Login Link
                    </span>
                    <span className="break-words text-primary">
                      https://vincere-cryptex.verify-login.example.com/session
                    </span>
                    <span className="font-label uppercase tracking-[0.16em] text-foreground/38">
                      Attachment
                    </span>
                    <span className="inline-flex w-fit items-center gap-2 text-foreground/72">
                      <DocumentTextIcon className="h-4 w-4 text-tertiary" />
                      account_access_reset.zip
                    </span>
                  </div>

                  <div className="space-y-4 px-4 py-5 text-sm leading-7 text-foreground/70">
                    <p>Hello Student,</p>
                    <p>
                      Your Vincere Cryptex academy access will be suspend in 15 minutes. To avoid
                      lost your progress, open the attached reset package and confirm your username
                      and password at the secure login link.
                    </p>
                    <p>
                      This verification is mandatory and no second reminder will sending. Act now to
                      keep full dashboard access.
                    </p>
                    <p className="text-foreground/52">Security Verification Desk</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {emailClues.map((clue) => (
                    <div
                      key={clue}
                      className="min-h-20 border border-tertiary/18 bg-tertiary/8 px-4 py-3 text-sm leading-6 text-foreground/70"
                    >
                      {clue}
                    </div>
                  ))}
                </div>

                <div className="border border-primary/20 bg-primary/10 px-4 py-4">
                  <p className="font-label text-[0.66rem] uppercase text-primary">Student Task</p>
                  <p className="mt-2 text-sm leading-7 text-foreground/72">
                    {isAlreadySolved
                      ? "Challenge already solved. Review the findings or continue to the next recommended lesson."
                      : isSolved
                      ? "Challenge solved. Review the findings or continue to the next recommended lesson."
                      : "Identify at least 3 warning signs and submit the safe training flag."}
                  </p>
                </div>

                {isSolved ? (
                  <div className="relative overflow-hidden border border-primary/30 bg-primary/10 px-5 py-5 shadow-[0_0_34px_rgba(0,240,255,0.14)]">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
                    <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-label text-[0.66rem] uppercase text-primary">
                          {isAlreadySolved ? "Already Solved State" : "Success State"}
                        </p>
                        <h3 className="mt-2 font-display text-2xl font-semibold text-white">
                          {isAlreadySolved ? "Challenge already solved" : "Phishing triage complete"}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-foreground/70">
                          {isAlreadySolved
                            ? "Backend confirmed a previous solve. No extra points were awarded."
                            : `Backend accepted the flag and awarded ${displayedAwardedPoints} XP.`}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-foreground/52">
                          Solved at: {solvedAtValue}
                        </p>
                      </div>
                      <div className="flex h-24 w-24 shrink-0 animate-pulse items-center justify-center border border-primary/34 bg-[#050811]/72 text-center shadow-[0_0_28px_rgba(0,240,255,0.18)]">
                        <span>
                          <span className="block font-display text-3xl font-bold text-primary">
                            {formatPoints(displayedAwardedPoints)}
                          </span>
                          <span className="font-label text-[0.58rem] uppercase text-foreground/52">
                            XP
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </GlowCard>
          </div>

          <aside className="flex min-w-0 flex-col gap-6">
            <GlowCard
              tone="cyan"
              className="dashboard-card-3d dashboard-border-sweep dashboard-premium-card px-6 py-7 sm:px-7"
            >
              <form className="relative z-10 space-y-6" onSubmit={handleSubmit}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-label text-[0.68rem] uppercase text-primary/78">
                      Flag Submission
                    </p>
                    <h2 className="mt-3 font-display text-2xl font-semibold text-white">
                      Mark suspicious signals
                    </h2>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="border border-primary/24 bg-primary/10 px-3 py-1 font-label text-[0.62rem] uppercase text-primary">
                      {selectedCount}/6 signals
                    </span>
                    <span className={cn("border px-3 py-1 font-label text-[0.58rem] uppercase", statusContent.toneClass)}>
                      {statusContent.label}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniStatus
                    label="Attempts"
                    value={isChallengeLoading ? "Syncing" : `${attemptCount}`}
                    tone={feedback === "retry" || feedback === "error" ? "pink" : "cyan"}
                  />
                  <MiniStatus
                    label="Required"
                    value={selectedCount >= 3 ? "Met" : "3 signals"}
                    tone={selectedCount >= 3 ? "cyan" : "neutral"}
                  />
                  <MiniStatus
                    label="Solve State"
                    value={solveStateValue}
                    tone={isSolved ? "cyan" : feedback === "session-expired" ? "pink" : "neutral"}
                  />
                </div>

                <div className="grid gap-3">
                  {warningSigns.map((option) => {
                    const isSelected = selectedSigns.includes(option.id);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={isSubmitLocked}
                        className={cn(
                          "group flex min-h-24 gap-4 border px-4 py-4 text-left transition-all duration-300 disabled:cursor-default",
                          isSelected
                            ? "border-primary/42 bg-primary/10 text-white shadow-[0_0_22px_rgba(0,240,255,0.12)]"
                            : "border-white/8 bg-white/[0.02] text-foreground/72 hover:border-primary/24 hover:bg-primary/[0.045]",
                          isSolved && !isSelected && "opacity-56 hover:border-white/8 hover:bg-white/[0.02]",
                        )}
                        onClick={() => toggleWarningSign(option.id)}
                        aria-pressed={isSelected}
                      >
                        <span
                          className={cn(
                            "mt-1 flex h-6 w-6 shrink-0 items-center justify-center border transition-all duration-300",
                            isSelected
                              ? "border-primary/42 bg-primary/16 text-primary"
                              : "border-white/12 text-transparent group-hover:border-primary/30",
                          )}
                          aria-hidden="true"
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-white">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-foreground/58">
                            {option.detail}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <InputField
                  tone="cyan"
                  label="Safe training flag"
                  value={answer}
                  onChange={(event) => {
                    setAnswer(event.target.value);
                    if (feedback === "retry" || feedback === "error") {
                      setFeedback("idle");
                      setSubmissionResult(null);
                      setSubmissionMessage(null);
                    }
                  }}
                  placeholder="Enter flag"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isSubmitLocked || isSubmitting}
                  aria-invalid={feedback === "retry" || feedback === "error"}
                />

                <div aria-live="polite">
                  {isSubmitting ? (
                    <div className="flex items-center gap-3 border border-secondary/28 bg-secondary/10 px-4 py-4 text-sm leading-6 text-secondary">
                      <span
                        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-secondary/28 border-t-secondary"
                        aria-hidden="true"
                      />
                      Verifying flag submission...
                    </div>
                  ) : null}

                  {feedback === "success" || feedback === "already-solved" ? (
                    <div className="space-y-4 border border-primary/28 bg-primary/10 px-4 py-4 text-sm leading-6 text-foreground/72">
                      <div>
                        <p className="font-label text-[0.66rem] uppercase text-primary">
                          {isAlreadySolved
                            ? "Already solved. No extra points."
                            : "Success. Challenge solved."}
                        </p>
                        <p className="mt-2">
                          {submissionMessage ??
                            (isAlreadySolved
                              ? "Backend confirmed this challenge was already solved."
                              : "Backend accepted the submitted flag.")}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-foreground/54">
                          Points awarded: {formatPoints(displayedAwardedPoints)} XP
                          {` | Solved at: ${solvedAtValue}`}
                          {` | Attempts: ${attemptCount}`}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Link
                          href={nextRecommendedHref}
                          className="inline-flex min-h-11 items-center justify-center gap-2 border border-primary/24 bg-primary/10 px-4 py-3 font-label text-[0.62rem] uppercase text-primary transition-all duration-300 hover:border-primary/44 hover:bg-primary/16"
                        >
                          Next Lesson
                          <ArrowRightIcon className="h-4 w-4" />
                        </Link>
                        <Link
                          href="/dashboard"
                          className="inline-flex min-h-11 items-center justify-center gap-2 border border-secondary/24 bg-secondary/10 px-4 py-3 font-label text-[0.62rem] uppercase text-secondary transition-all duration-300 hover:border-secondary/44 hover:bg-secondary/16"
                        >
                          Dashboard
                          <ArrowRightIcon className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ) : null}

                  {feedback === "retry" ? (
                    <div className="border border-tertiary/28 bg-tertiary/10 px-4 py-4 text-sm leading-6 text-foreground/72">
                      {submissionMessage ?? "Invalid flag."} Attempt {attemptCount} recorded by
                      the backend. Review the sender, link destination, attachment, and credential
                      request before trying again.
                    </div>
                  ) : null}

                  {feedback === "session-expired" ? (
                    <div className="space-y-4 border border-tertiary/28 bg-tertiary/10 px-4 py-4 text-sm leading-6 text-foreground/72">
                      <p>
                        {submissionMessage ??
                          "Your session expired. Please sign in again before submitting this challenge."}
                      </p>
                      <Link
                        href="/login"
                        className="inline-flex min-h-11 items-center justify-center gap-2 border border-tertiary/30 bg-tertiary/10 px-4 py-3 font-label text-[0.62rem] uppercase text-tertiary transition-all duration-300 hover:border-tertiary/50 hover:bg-tertiary/16"
                      >
                        Sign In Again
                        <ArrowRightIcon className="h-4 w-4" />
                      </Link>
                    </div>
                  ) : null}

                  {feedback === "error" ? (
                    <div className="border border-tertiary/28 bg-tertiary/10 px-4 py-4 text-sm leading-6 text-foreground/72">
                      {submissionMessage ?? "Challenge submission failed. Please try again."}
                    </div>
                  ) : null}
                </div>

                <PrimaryButton
                  tone={feedback === "retry" || feedback === "error" ? "pink" : "cyan"}
                  type="submit"
                  loading={isSubmitting}
                  disabled={!canSubmit}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {isSolved
                      ? "Challenge Solved"
                      : feedback === "session-expired"
                        ? "Sign In Required"
                        : isSubmitting
                          ? "Submitting..."
                          : "Submit Flag"}
                    <ShieldLockIcon className="h-4 w-4" />
                  </span>
                </PrimaryButton>
              </form>
            </GlowCard>

            <GlowCard
              tone="purple"
              className={cn(
                "dashboard-card-3d dashboard-border-sweep dashboard-glow-sweep dashboard-premium-card px-6 py-7 sm:px-7",
                hintState.status === "loading" &&
                  "animate-pulse border-secondary/42 shadow-[0_0_44px_rgba(168,85,247,0.22)]",
              )}
            >
              <div className="relative z-10 space-y-5" aria-live="polite" aria-busy={hintState.status === "loading"}>
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-secondary/28 bg-secondary/10 text-secondary">
                    <ShieldKeyIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-label text-[0.68rem] uppercase text-secondary/78">
                      Safe AI Tutor Hint
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-white">
                      Give me a safe challenge hint
                    </h2>
                  </div>
                </div>

                {hintState.status === "loading" ? (
                  <div className="flex items-center gap-3 border border-secondary/28 bg-secondary/10 px-4 py-4 text-sm leading-7 text-secondary">
                    <span
                      className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-secondary/28 border-t-secondary"
                      aria-hidden="true"
                    />
                    Generating safe hint...
                  </div>
                ) : hintState.answer ? (
                  <div
                    className={cn(
                      "border px-4 py-4 text-sm leading-7 text-foreground/72",
                      hintState.blocked
                        ? "border-tertiary/28 bg-tertiary/10"
                        : hintState.status === "fallback"
                          ? "border-secondary/22 bg-secondary/10"
                          : "border-primary/22 bg-primary/10",
                    )}
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "border px-2 py-1 font-label text-[0.56rem] uppercase",
                          hintState.blocked
                            ? "border-tertiary/34 bg-tertiary/10 text-tertiary"
                            : "border-primary/24 bg-primary/10 text-primary",
                        )}
                      >
                        {hintState.status === "success" ? "AI Tutor Hint" : "Local Safe Hint"}
                      </span>
                      {hintState.blocked ? (
                        <span className="border border-tertiary/34 bg-tertiary/10 px-2 py-1 font-label text-[0.56rem] uppercase text-tertiary">
                          Blocked safely
                        </span>
                      ) : null}
                    </div>
                    {hintState.answer}
                  </div>
                ) : (
                  <div className="border border-white/8 bg-white/[0.025] px-4 py-4 text-sm leading-7 text-foreground/62">
                    Ask for direction without revealing the flag, final answer, payloads, or
                    hidden solution details.
                  </div>
                )}

                <button
                  type="button"
                  disabled={hintState.status === "loading"}
                  className="inline-flex w-full min-h-12 items-center justify-center gap-2 border border-secondary/24 bg-secondary/10 px-4 py-3 font-label text-[0.68rem] uppercase text-secondary transition-all duration-300 hover:border-secondary/44 hover:bg-secondary/16 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void askForSafeHint()}
                >
                  {safeHintButtonLabel}
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              </div>
            </GlowCard>

            <GlowCard tone="neutral" corners={false} className="dashboard-card-3d px-6 py-6">
              <div className="relative z-10 flex items-start gap-4">
                <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center border border-white/12 bg-white/[0.03] text-foreground/58">
                  <LockIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-label text-[0.66rem] uppercase text-foreground/42">
                    Training Safety
                  </p>
                  <p className="mt-2 text-sm leading-7 text-foreground/66">
                    Report suspicious messages through approved channels and avoid interacting with
                    links, attachments, or credential prompts from email.
                  </p>
                </div>
              </div>
            </GlowCard>
          </aside>
        </div>
      </div>
    </section>
  );
}

export function PhishingAwarenessChallenge() {
  const { status, user } = useAuthSession();
  const isStudent = status === "authenticated" && isStudentUser(user);

  if (status === "loading") {
    return <ChallengeAccessLoading />;
  }

  return isStudent ? <InteractivePhishingAwarenessChallenge /> : <ChallengePreview />;
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "cyan" | "primary" | "secondary" | "tertiary";
}) {
  const toneClass = {
    cyan: "text-primary",
    primary: "text-primary",
    secondary: "text-secondary",
    tertiary: "text-tertiary",
  }[tone];

  return (
    <div className="border border-white/8 bg-white/[0.025] px-4 py-4 transition-all duration-300 hover:border-primary/24 hover:bg-primary/[0.045]">
      <p className="font-label text-[0.62rem] uppercase text-foreground/42">{label}</p>
      <p className={cn("mt-2 text-base font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

function MiniStatus({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "cyan" | "pink" | "neutral";
}) {
  const toneClass = {
    cyan: "border-primary/24 bg-primary/10 text-primary",
    pink: "border-tertiary/24 bg-tertiary/10 text-tertiary",
    neutral: "border-white/8 bg-white/[0.025] text-foreground/70",
  }[tone];

  return (
    <div className={cn("border px-3 py-3", toneClass)}>
      <p className="font-label text-[0.56rem] uppercase opacity-68">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
