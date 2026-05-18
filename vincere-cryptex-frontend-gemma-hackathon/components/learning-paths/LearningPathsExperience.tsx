"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useMemo, type ReactNode } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  buildCourseProgress,
  getSafeEnrollmentLessonHref,
  useStudentCourses,
} from "@/components/courses/course-state";
import { GlowCard, type AccentTone } from "@/components/ui/GlowCard";
import {
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  LockIcon,
  ShieldKeyIcon,
  ShieldLockIcon,
} from "@/components/ui/icons";
import { getStudentDisplayName, isStudentUser } from "@/lib/auth-roles";
import { cn } from "@/lib/cn";
import { mockCourses } from "@/lib/courses/mock-data";
import { toCourseSummary } from "@/lib/courses/mock-api";
import { getCourseRouteId, normalizeCourseRouteId } from "@/lib/courses/routing";
import type { CourseSummary } from "@/lib/courses/types";

type PathTone = "blue" | "red" | "purple" | "neutral";
type StudentPathStatus = "Active" | "Start" | "Planned / Coming Soon" | "Coming Soon";
type RoadmapStatus = "Completed" | "Current" | "Next" | "Locked" | "Preview";

type PathCardData = {
  title: string;
  description: string;
  status: StudentPathStatus;
  modules: number;
  progress?: number;
  tone: PathTone;
  tags: string[];
  cta?: string;
  href?: string;
  note?: string;
  previewModules?: Array<{
    label: string;
    status: "Planned";
  }>;
};

type RoadmapPreview = {
  title: string;
  tone: PathTone;
  steps: string[];
};

type StudentRoadmapStep = {
  label: string;
  status: RoadmapStatus;
};

type SkillMetric = {
  label: string;
  value: number;
  tone: AccentTone;
  planned?: boolean;
};

const guestPathCards: PathCardData[] = [
  {
    title: "Blue Team Foundations",
    description:
      "Defensive monitoring, phishing analysis, incident response, secure configuration, and SOC investigation.",
    status: "Active",
    modules: 5,
    tone: "blue",
    tags: ["Network Defense", "Phishing Analysis", "Incident Response", "SOC"],
    cta: "Preview Blue Team Path",
    href: "#guest-blue-team",
  },
  {
    title: "Red Team Foundations",
    description:
      "Recon concepts, lab-safe exploitation theory, CTF methodology, controlled vulnerability discovery, and reporting.",
    status: "Planned / Coming Soon",
    modules: 5,
    tone: "red",
    tags: [
      "Recon",
      "Web Exploitation Concepts",
      "CTF Methodology",
      "Vulnerability Discovery",
      "Reporting",
    ],
    cta: "Preview Red Team Path",
    href: "#guest-red-team",
    note:
      "Red Team content is taught only through authorized labs and CTF-style simulations. The platform does not support real-world abuse, credential theft, malware, or unauthorized targeting.",
  },
  {
    title: "Web Security Fundamentals",
    description:
      "OWASP foundations, secure coding awareness, web risk patterns, and controlled defensive testing concepts.",
    status: "Coming Soon",
    modules: 6,
    tone: "purple",
    tags: ["OWASP", "Secure Coding", "Web Risk", "Lab Concepts"],
    cta: "Preview Path",
    href: "#guest-paths",
  },
  {
    title: "SOC Analyst Track",
    description:
      "Alert triage, log review, SIEM workflow habits, investigation notes, and incident report structure.",
    status: "Coming Soon",
    modules: 7,
    tone: "neutral",
    tags: ["Alert Triage", "Logs", "SIEM", "Reporting"],
    cta: "Preview Path",
    href: "#guest-paths",
  },
];

const studentPathTemplates: PathCardData[] = [
  {
    title: "Blue Team Foundations",
    description:
      "Defensive monitoring, phishing analysis, incident response, secure configuration, and SOC investigation.",
    status: "Start",
    modules: 5,
    progress: 0,
    tone: "blue",
    tags: ["Network Defense", "Phishing Analysis", "Incident Response", "SOC"],
    cta: "Start Path",
    href: "/courses/network-defense-foundations",
  },
  {
    title: "Red Team Foundations",
    description:
      "Recon concepts, lab-safe exploitation theory, CTF methodology, controlled vulnerability discovery, and reporting.",
    status: "Planned / Coming Soon",
    modules: 5,
    progress: 0,
    tone: "red",
    tags: [
      "Recon",
      "Web Exploitation Concepts",
      "CTF Methodology",
      "Vulnerability Discovery",
      "Reporting",
    ],
    note: "Red Team modules are designed for authorized labs and CTF-style learning only.",
    previewModules: [
      { label: "Recon Basics", status: "Planned" },
      { label: "Web Vulnerability Concepts", status: "Planned" },
      { label: "CTF Exploitation Flow", status: "Planned" },
      { label: "Reporting Findings", status: "Planned" },
    ],
  },
  {
    title: "Web Security Fundamentals",
    description: "OWASP basics, XSS and SQL injection awareness, secure coding, and lab-safe web analysis.",
    status: "Coming Soon",
    modules: 6,
    progress: 0,
    tone: "purple",
    tags: ["OWASP", "Secure Coding", "Web Risk", "Lab Concepts"],
  },
  {
    title: "SOC Analyst Track",
    description: "Alert triage, log analysis, SIEM workflows, incident reports, and investigation rhythm.",
    status: "Coming Soon",
    modules: 7,
    progress: 0,
    tone: "neutral",
    tags: ["Alert Triage", "Logs", "SIEM", "Reporting"],
  },
];

const guestRoadmaps: RoadmapPreview[] = [
  {
    title: "Blue Team Path",
    tone: "blue",
    steps: [
      "Account Security",
      "Network Defense",
      "Phishing Awareness",
      "Incident Response",
      "SOC Investigation",
    ],
  },
  {
    title: "Red Team Path",
    tone: "red",
    steps: [
      "Recon Basics",
      "Web Vulnerability Concepts",
      "CTF Exploitation Flow",
      "Reporting Findings",
      "Lab Practice",
    ],
  },
];

const studentRoadmap: StudentRoadmapStep[] = [
  { label: "Account Security", status: "Completed" },
  { label: "Network Defense", status: "Current" },
  { label: "Phishing Awareness", status: "Next" },
  { label: "Incident Response", status: "Locked" },
  { label: "SOC Investigation", status: "Locked" },
];

function isRedTeamCourse(course: CourseSummary) {
  const searchable = `${course.id} ${course.title} ${course.category}`.toLowerCase();
  return searchable.includes("web") || searchable.includes("attack") || searchable.includes("red");
}

function getCourseProgress(course: CourseSummary) {
  return buildCourseProgress(course.id, course.lessonIds, course);
}

function getCourseLaunchHref(course: CourseSummary | null) {
  if (!course) {
    return "/courses";
  }

  const progress = getCourseProgress(course);
  const routeCourseId = getCourseRouteId(course);
  const targetLessonId = progress.nextLessonId ?? progress.currentLessonId;
  const safeLessonHref =
    progress.isEnrolled && targetLessonId
      ? getSafeEnrollmentLessonHref(routeCourseId, null, targetLessonId, course.lessonIds, course)
      : null;

  return safeLessonHref ?? `/courses/${routeCourseId}`;
}

function averageProgress(courses: CourseSummary[]) {
  if (!courses.length) {
    return 0;
  }

  return Math.round(
    courses.reduce((total, course) => total + getCourseProgress(course).progressPercent, 0) /
      courses.length,
  );
}

function buildStudentPathCards(courses: CourseSummary[]): PathCardData[] {
  const redCourses = courses.filter(isRedTeamCourse);
  const blueCourses = courses.filter((course) => !isRedTeamCourse(course));

  return studentPathTemplates.map((path) => {
    const pathCourses =
      path.tone === "red" ? redCourses : path.tone === "blue" ? blueCourses : [];
    const activeCourse =
      pathCourses.find((course) => getCourseProgress(course).isEnrolled) ?? pathCourses[0] ?? null;
    const progress = averageProgress(pathCourses);
    const isActive = pathCourses.some((course) => getCourseProgress(course).isEnrolled);

    if (path.tone !== "red" && path.tone !== "blue") {
      return {
        ...path,
        progress: 0,
      };
    }

    return {
      ...path,
      status: isActive ? ("Active" as const) : ("Start" as const),
      progress,
      cta: isActive ? "Continue Path" : "Start Path",
      href: getCourseLaunchHref(activeCourse),
    };
  });
}

function buildStudentRoadmap(courses: CourseSummary[]): StudentRoadmapStep[] {
  const blueCourses = courses.filter((course) => !isRedTeamCourse(course));
  const activeCourse =
    blueCourses.find((course) => getCourseProgress(course).isEnrolled) ?? blueCourses[0] ?? null;
  const publicCourse = activeCourse
    ? mockCourses.find(
        (course) => normalizeCourseRouteId(course.slug ?? course.id) === normalizeCourseRouteId(activeCourse.id),
      ) ?? null
    : mockCourses.find((course) => course.id === "network-defense-foundations") ?? mockCourses[0] ?? null;
  const lessonReferences = publicCourse ? publicCourse.sections.flatMap((section) => section.lessons).slice(0, 5) : [];
  const progress = activeCourse ? getCourseProgress(activeCourse) : null;

  if (!lessonReferences.length) {
    return studentRoadmap.map((step, index) => ({
      ...step,
      status: index === 0 ? ("Next" as const) : ("Locked" as const),
    }));
  }

  return lessonReferences.map((lesson, index) => {
    const lessonState = progress?.lessonStates.find((state) => state.lessonId === lesson.id);

    if (lessonState?.isCompleted) {
      return { label: lesson.title, status: "Completed" as const };
    }

    if (progress?.isEnrolled && (progress.currentLessonId ?? progress.nextLessonId) === lesson.id) {
      return { label: lesson.title, status: "Current" as const };
    }

    return {
      label: lesson.title,
      status: index === 0 && !progress?.isEnrolled ? "Next" as const : "Locked" as const,
    };
  });
}

function buildSkillMetrics(courses: CourseSummary[]): SkillMetric[] {
  const definitions = [
    { label: "Network Defense", tone: "cyan" as const, matches: ["network", "defense"] },
    { label: "Phishing Analysis", tone: "purple" as const, matches: ["phishing"] },
    { label: "Incident Response", tone: "pink" as const, matches: ["incident", "response"] },
    { label: "Secure Configuration", tone: "cyan" as const, matches: ["configuration", "hardening"] },
    { label: "Recon", tone: "pink" as const, matches: ["recon"], planned: true },
    { label: "Web Exploitation Concepts", tone: "purple" as const, matches: ["web", "attack"] },
    { label: "CTF Methodology", tone: "pink" as const, matches: ["ctf"], planned: true },
    { label: "Reporting", tone: "neutral" as const, matches: ["report"], planned: true },
  ];

  return definitions.map((definition) => {
    const matchingCourses = courses.filter((course) => {
      const searchable = `${course.id} ${course.title} ${course.category}`.toLowerCase();
      return definition.matches.some((match) => searchable.includes(match));
    });

    return {
      label: definition.label,
      value: averageProgress(matchingCourses),
      tone: definition.tone,
      planned: definition.planned && !matchingCourses.length,
    };
  });
}

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const revealVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 22,
    filter: "blur(12px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.62,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

function toAccentTone(tone: PathTone): AccentTone {
  if (tone === "blue") {
    return "cyan";
  }

  if (tone === "red") {
    return "pink";
  }

  if (tone === "purple") {
    return "purple";
  }

  return "neutral";
}

function pathStatusClass(status: StudentPathStatus, tone: PathTone) {
  if (status === "Active") {
    return "border-primary/30 bg-primary/10 text-primary";
  }

  if (tone === "red") {
    return "border-tertiary/34 bg-tertiary/10 text-tertiary";
  }

  if (tone === "purple") {
    return "border-secondary/30 bg-secondary/10 text-secondary";
  }

  return "border-white/12 bg-white/[0.035] text-foreground/58";
}

function MotionBlock({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      id={id}
      className={className}
      variants={reduceMotion ? undefined : revealVariants}
      initial={reduceMotion ? false : undefined}
    >
      {children}
    </motion.div>
  );
}

function Stage({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      className="learning-paths-stage dashboard-stage dashboard-3d-space relative flex flex-1 overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12"
      variants={reduceMotion ? undefined : containerVariants}
      initial={reduceMotion ? false : "hidden"}
      animate={reduceMotion ? undefined : "visible"}
    >
      <div className="learning-paths-grid" aria-hidden="true" />
      <div className="learning-paths-scanline" aria-hidden="true" />
      <div className="learning-paths-particle-field" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="dashboard-bg-orb dashboard-bg-orb--cyan" aria-hidden="true" />
      <div className="dashboard-bg-orb dashboard-bg-orb--purple" aria-hidden="true" />
      <div className="dashboard-bg-orb dashboard-bg-orb--blue" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-7 lg:gap-8">
        {children}
      </div>
    </motion.section>
  );
}

function StatTile({
  label,
  tone = "cyan",
  value,
}: {
  label: string;
  tone?: AccentTone;
  value: string;
}) {
  return (
    <div
      data-tone={tone}
      className="learning-paths-stat border border-white/8 bg-white/[0.025] px-4 py-4"
    >
      <p className="font-label text-[0.62rem] uppercase text-foreground/42">{label}</p>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  tone = "cyan",
}: {
  eyebrow?: string;
  title: string;
  tone?: AccentTone;
}) {
  return (
    <div className="space-y-2">
      {eyebrow ? (
        <p className="font-label text-[0.68rem] uppercase text-foreground/44">{eyebrow}</p>
      ) : null}
      <div className="flex items-center gap-4">
        <span data-tone={tone} className="learning-paths-title-bar" aria-hidden="true" />
        <h2 className="font-display text-2xl font-semibold uppercase text-white sm:text-3xl">
          {title}
        </h2>
      </div>
    </div>
  );
}

function CtaLink({
  children,
  className,
  href,
  tone = "cyan",
}: {
  children: ReactNode;
  className?: string;
  href: string;
  tone?: AccentTone;
}) {
  return (
    <Link
      href={href}
      data-tone={tone}
      className={cn("primary-button dashboard-cta-pulse learning-paths-cta px-5 py-3 text-[0.72rem]", className)}
    >
      <span className="primary-button__sweep" />
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
        <ArrowRightIcon className="learning-paths-cta-arrow h-4 w-4" />
      </span>
    </Link>
  );
}

function PathCard({
  mode,
  path,
}: {
  mode: "guest" | "student";
  path: PathCardData;
}) {
  const accentTone = toAccentTone(path.tone);
  const showProgress = mode === "student";
  const progress = path.progress ?? 0;
  const safeHref = path.href ?? "#student-paths";

  return (
    <motion.article
      id={
        path.title.startsWith("Blue")
          ? mode === "guest"
            ? "guest-blue-team"
            : "student-blue-team"
          : path.title.startsWith("Red")
            ? mode === "guest"
              ? "guest-red-team"
              : "student-red-team"
            : undefined
      }
      variants={revealVariants}
      data-path-tone={path.tone}
      className="learning-paths-card-wrap"
    >
      <GlowCard
        tone={accentTone}
        className={cn(
          "learning-paths-card dashboard-card-3d dashboard-border-sweep dashboard-premium-card flex h-full flex-col px-6 py-6 sm:px-7",
          path.tone === "red" && "learning-paths-card--red",
          path.tone === "blue" && "learning-paths-card--blue",
        )}
      >
        <div className="relative z-10 flex h-full flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className={cn("border px-3 py-1 font-label text-[0.64rem] uppercase", pathStatusClass(path.status, path.tone))}>
              {path.status}
            </span>
            <span className="border border-white/10 bg-white/[0.03] px-3 py-1 font-label text-[0.64rem] uppercase text-foreground/56">
              {path.modules} modules
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="learning-paths-orbit-icon" aria-hidden="true">
                {path.tone === "red" ? <BoltIcon className="h-5 w-5" /> : <ShieldLockIcon className="h-5 w-5" />}
              </span>
              <h3 className="font-display text-2xl font-semibold text-white">{path.title}</h3>
            </div>
            <p className="text-sm leading-7 text-foreground/66">{path.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {path.tags.map((tag) => (
              <span key={tag} className="learning-paths-tag border px-3 py-1.5 text-[0.78rem]">
                {tag}
              </span>
            ))}
          </div>

          {path.note ? (
            <div className="learning-paths-safety-note border px-4 py-3 text-sm leading-6">
              <p className="font-label text-[0.62rem] uppercase">
                {path.tone === "red" ? "Authorized Learning" : "Access Note"}
              </p>
              <p className="mt-2">{path.note}</p>
            </div>
          ) : null}

          {path.previewModules?.length ? (
            <div className="learning-paths-module-preview border px-4 py-4">
              <p className="font-label text-[0.62rem] uppercase text-tertiary/78">
                Preview Modules
              </p>
              <ol className="mt-3 grid gap-2">
                {path.previewModules.map((module) => (
                  <li
                    key={module.label}
                    className="flex items-center justify-between gap-3 border border-white/8 bg-white/[0.025] px-3 py-2"
                  >
                    <span className="text-sm text-white">{module.label}</span>
                    <span className="font-label text-[0.58rem] uppercase text-tertiary">
                      {module.status}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="mt-auto grid grid-cols-2 gap-3">
            <StatTile label="Modules" value={`${path.modules}`} tone={accentTone} />
            <StatTile
              label={showProgress ? "Progress" : "Access"}
              value={showProgress ? `${progress}%` : "Preview"}
              tone={path.tone === "red" ? "pink" : accentTone}
            />
          </div>

          {showProgress ? (
            <ProgressBar
              label={`${path.title} progress`}
              tone={accentTone}
              value={progress}
            />
          ) : null}

          {path.cta ? (
            <CtaLink href={safeHref} tone={accentTone}>
              {path.cta}
            </CtaLink>
          ) : (
            <span className="learning-paths-locked-cta inline-flex min-h-12 items-center justify-center gap-2 border px-4 py-3 font-label text-[0.68rem] uppercase">
              <LockIcon className="h-4 w-4" />
              Planned
            </span>
          )}
        </div>
      </GlowCard>
    </motion.article>
  );
}

function ProgressBar({
  label,
  tone,
  value,
}: {
  label: string;
  tone: AccentTone;
  value: number;
}) {
  const normalizedValue = Math.max(0, Math.min(100, value));
  const barTone =
    tone === "pink"
      ? "from-tertiary to-secondary"
      : tone === "purple"
        ? "from-secondary to-primary"
        : tone === "neutral"
          ? "from-outline to-foreground/70"
          : "from-primary to-secondary";

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalizedValue}
      className="space-y-2"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="font-label text-[0.62rem] uppercase text-foreground/44">Progress</span>
        <span className="font-label text-[0.62rem] uppercase text-foreground/58">{normalizedValue}%</span>
      </div>
      <div data-tone={tone} className="dashboard-progress-track dashboard-progress-beam h-2.5 overflow-hidden bg-surface-container-highest">
        <div
          className={cn("dashboard-progress-animated dashboard-progress-segment h-full bg-gradient-to-r", barTone)}
          style={{ width: `${normalizedValue}%` }}
        />
      </div>
    </div>
  );
}

function RoadmapIcon({ status }: { status: RoadmapStatus }) {
  if (status === "Completed") {
    return <CheckIcon className="h-4 w-4" />;
  }

  if (status === "Locked" || status === "Preview") {
    return <LockIcon className="h-4 w-4" />;
  }

  return <span className="h-3 w-3 bg-current shadow-[0_0_18px_currentColor]" aria-hidden="true" />;
}

function Roadmap({
  mode = "student",
  steps,
  title,
  tone = "blue",
}: {
  mode?: "guest" | "student";
  steps: Array<string | StudentRoadmapStep>;
  title: string;
  tone?: PathTone;
}) {
  return (
    <GlowCard
      tone={toAccentTone(tone)}
      className="dashboard-card-3d dashboard-border-sweep dashboard-premium-card px-6 py-7 sm:px-8"
    >
      <div className="relative z-10">
        <SectionTitle
          eyebrow={mode === "guest" ? "Preview Roadmap" : "Blue Team Foundations"}
          title={title}
          tone={toAccentTone(tone)}
        />
        <ol className="mt-8 flex min-w-0 snap-x gap-0 overflow-x-auto pb-2">
          {steps.map((step, index) => {
            const label = typeof step === "string" ? step : step.label;
            const status = typeof step === "string" ? "Preview" : step.status;
            const isCompleted = status === "Completed";
            const isCurrent = status === "Current";
            const isLocked = status === "Locked" || status === "Preview";

            return (
              <li
                key={label}
                className="dashboard-roadmap-item learning-paths-roadmap-item relative flex min-w-36 flex-1 snap-start flex-col items-center px-3 text-center"
              >
                {index < steps.length - 1 ? (
                  <span
                    className={cn(
                      "dashboard-roadmap-line absolute left-1/2 top-5 h-px w-full",
                      isCompleted ? "dashboard-roadmap-complete-line" : "learning-paths-roadmap-line--dormant",
                    )}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border",
                    isCompleted && "dashboard-roadmap-completed border-primary/52 bg-primary/12 text-primary",
                    isCurrent && "dashboard-roadmap-current dashboard-pulse-node border-primary bg-surface-lowest text-primary",
                    status === "Next" && "border-secondary/48 bg-secondary/10 text-secondary",
                    isLocked && "border-white/12 bg-white/[0.025] text-foreground/38",
                  )}
                  title={`${label}: ${status}`}
                >
                  <RoadmapIcon status={status} />
                </span>
                <p className="mt-3 text-sm font-semibold text-white">{label}</p>
                <p
                  className={cn(
                    "mt-1 font-label text-[0.6rem] uppercase",
                    isCompleted || isCurrent ? "text-primary" : status === "Next" ? "text-secondary" : "text-foreground/42",
                  )}
                >
                  {status}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </GlowCard>
  );
}

function SkillMatrix({ skills }: { skills: SkillMetric[] }) {
  return (
    <GlowCard
      tone="purple"
      className="dashboard-card-3d dashboard-border-sweep dashboard-premium-card px-6 py-7 sm:px-7"
    >
      <div className="relative z-10">
        <SectionTitle eyebrow="Skill Matrix" title="Growth Signals" tone="purple" />
        <div className="mt-7 grid gap-5">
          {skills.map((skill) => (
            <div
              key={skill.label}
              data-tone={skill.tone}
              className={cn("dashboard-skill-row", skill.planned && "opacity-72")}
            >
              <div className="flex items-end justify-between gap-4">
                <span className="text-sm font-semibold text-white">{skill.label}</span>
                <span className="font-label text-[0.66rem] uppercase text-primary">
                  {skill.planned ? "Planned" : `${skill.value}%`}
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={skill.value}
                  tone={skill.tone}
                  label={`${skill.label} skill progress`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </GlowCard>
  );
}

function LearningPathsLoadingView() {
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <GlowCard tone="cyan" className="w-full max-w-xl px-8 py-10 text-center">
        <p className="font-label text-[0.72rem] uppercase text-primary/72">Learning Paths</p>
        <h1 className="mt-4 font-display text-4xl font-bold text-white">Checking access...</h1>
      </GlowCard>
    </section>
  );
}

function GuestLearningPathsView() {
  return (
    <Stage>
      <MotionBlock>
        <GlowCard
          tone="cyan"
          className="dashboard-card-3d dashboard-border-sweep dashboard-premium-card learning-paths-hero px-6 py-7 sm:px-8 lg:px-10"
        >
          <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.44fr)] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="border border-primary/28 bg-primary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-primary">
                  Public Preview
                </span>
                <span className="border border-secondary/24 bg-secondary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-secondary">
                  Red Team + Blue Team
                </span>
              </div>
              <h1 className="mt-5 font-display text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                Choose Your Cybersecurity Path
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-foreground/72 sm:text-lg">
                Explore structured Red Team and Blue Team training paths designed for safe,
                authorized cybersecurity learning.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <CtaLink href="/register">Create Account</CtaLink>
                <Link
                  href="/login"
                  className="learning-paths-secondary-cta inline-flex min-h-12 items-center justify-center border border-secondary/24 bg-secondary/10 px-5 py-3 font-label text-[0.72rem] uppercase text-secondary"
                >
                  Sign In to Start
                </Link>
              </div>
            </div>

            <div className="learning-paths-hero-console border border-primary/18 bg-[#050811]/82 p-5">
              <p className="font-label text-[0.66rem] uppercase text-primary/78">Preview Access</p>
              <div className="mt-5 grid gap-3">
                <StatTile label="Paths" value="4 previews" tone="cyan" />
                <StatTile label="Progress" value="Hidden for guests" tone="purple" />
                <StatTile label="Challenges" value="Preview only" tone="pink" />
              </div>
            </div>
          </div>
        </GlowCard>
      </MotionBlock>

      <MotionBlock className="space-y-6" id="guest-paths">
        <SectionTitle eyebrow="Platform Directions" title="Path Previews" tone="purple" />
        <div className="grid gap-6 lg:grid-cols-2">
          {guestPathCards.map((path) => (
            <PathCard key={path.title} mode="guest" path={path} />
          ))}
        </div>
      </MotionBlock>

      <MotionBlock className="grid gap-6 xl:grid-cols-2">
        {guestRoadmaps.map((roadmap) => (
          <Roadmap
            key={roadmap.title}
            mode="guest"
            steps={roadmap.steps}
            title={roadmap.title}
            tone={roadmap.tone}
          />
        ))}
      </MotionBlock>

      <MotionBlock>
        <GlowCard tone="neutral" corners={false} className="dashboard-card-3d px-6 py-6">
          <div className="relative z-10 flex items-start gap-4">
            <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center border border-white/12 bg-white/[0.03] text-foreground/58">
              <ShieldLockIcon className="h-4 w-4" />
            </span>
            <p className="text-sm leading-7 text-foreground/66">
              Guests see public preview content only. Frontend route visibility improves the UX,
              while backend RBAC remains authoritative for protected progress, challenge, course,
              lab, and AI Tutor access.
            </p>
          </div>
        </GlowCard>
      </MotionBlock>
    </Stage>
  );
}

function StudentLearningPathsView({
  courses,
  displayName,
  errorMessage,
  isSyncing,
}: {
  courses: CourseSummary[];
  displayName: string;
  errorMessage: string | null;
  isSyncing: boolean;
}) {
  const studentPathCards = useMemo(() => buildStudentPathCards(courses), [courses]);
  const studentRoadmapSteps = useMemo(() => buildStudentRoadmap(courses), [courses]);
  const studentSkillMetrics = useMemo(() => buildSkillMetrics(courses), [courses]);
  const blueCourses = courses.filter((course) => !isRedTeamCourse(course));
  const activeBlueCourse =
    blueCourses.find((course) => getCourseProgress(course).isEnrolled) ?? blueCourses[0] ?? null;
  const blueProgress = averageProgress(blueCourses);
  const activeProgress = activeBlueCourse ? getCourseProgress(activeBlueCourse) : null;
  const activeHref = getCourseLaunchHref(activeBlueCourse);
  const nextModule =
    activeBlueCourse && activeProgress?.isEnrolled
      ? activeBlueCourse.title
      : "Choose a starting course";

  return (
    <Stage>
      <MotionBlock>
        <GlowCard
          tone="cyan"
          className="dashboard-card-3d dashboard-border-sweep dashboard-premium-card learning-paths-hero px-6 py-7 sm:px-8 lg:px-10"
        >
          <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.46fr)] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="border border-primary/28 bg-primary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-primary">
                  Student Hub
                </span>
                <span className="border border-secondary/24 bg-secondary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-secondary">
                  {isSyncing ? "Syncing progress" : `Welcome back, ${displayName}`}
                </span>
              </div>
              <h1 className="mt-5 font-display text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                Your Learning Paths
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-foreground/72 sm:text-lg">
                Track your Red Team and Blue Team growth, continue your current module, and unlock
                practical training step by step.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <StatTile label="Active Path" value="Blue Team Foundations" tone="cyan" />
              <StatTile label="Current Module" value={activeBlueCourse?.title ?? "Not started"} tone="purple" />
              <StatTile label="Recommended Next Step" value={nextModule} tone="pink" />
            </div>
          </div>
          {errorMessage ? (
            <p className="relative z-10 mt-5 text-sm text-tertiary/72">{errorMessage}</p>
          ) : null}
        </GlowCard>
      </MotionBlock>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(22rem,0.82fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <MotionBlock>
            <GlowCard
              tone="cyan"
              className="dashboard-card-3d dashboard-card-hover--primary dashboard-border-sweep dashboard-glow-sweep dashboard-premium-card px-6 py-7 sm:px-8"
            >
              <div className="relative z-10 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.52fr)] lg:items-stretch">
                <div className="flex min-w-0 flex-col gap-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="border border-primary/28 bg-primary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-primary">
                      Status: {activeProgress?.isEnrolled ? "Active" : "Start"}
                    </span>
                    <span className="border border-white/10 bg-white/[0.03] px-3 py-1 font-label text-[0.68rem] uppercase text-foreground/56">
                      Progress: {blueProgress}%
                    </span>
                  </div>

                  <div>
                    <p className="font-label text-[0.68rem] uppercase text-primary/78">
                      Active Path
                    </p>
                    <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
                      Blue Team Foundations
                    </h2>
                    <p className="mt-4 max-w-3xl text-sm leading-7 text-foreground/68">
                      Continue defensive monitoring, phishing analysis, incident response, secure
                      configuration, and SOC investigation training from your backend progress.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <StatTile label="Current Module" value={activeBlueCourse?.title ?? "Not started"} tone="cyan" />
                    <StatTile label="Next Module" value={nextModule} tone="purple" />
                  </div>

                  <ProgressBar value={blueProgress} tone="cyan" label="Blue Team Foundations progress" />

                  <CtaLink href={activeHref}>{activeProgress?.isEnrolled ? "Continue Path" : "Start Path"}</CtaLink>
                </div>

                <div className="learning-paths-blue-core relative min-h-72 overflow-hidden border border-primary/20 bg-[#050811]/86">
                  <div className="relative z-10 flex h-full flex-col justify-between p-5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex h-12 w-12 items-center justify-center border border-primary/28 bg-primary/10 text-primary">
                        <ShieldLockIcon className="h-6 w-6" />
                      </span>
                      <span className="border border-primary/24 bg-primary/10 px-3 py-1 font-label text-[0.62rem] uppercase text-primary">
                        {blueProgress}%
                      </span>
                    </div>
                    <div>
                      <p className="font-label text-[0.68rem] uppercase text-primary/78">
                        Recommended Next Step
                      </p>
                      <h3 className="mt-3 font-display text-2xl font-semibold text-white">
                        {activeProgress?.isEnrolled
                          ? "Continue from the next backend-confirmed lesson."
                          : "Start a course to create your backend progress record."}
                      </h3>
                    </div>
                  </div>
                </div>
              </div>
            </GlowCard>
          </MotionBlock>

          <MotionBlock className="space-y-6" id="student-paths">
            <SectionTitle eyebrow="Core Paths" title="Red Team + Blue Team" tone="purple" />
            <div className="grid gap-6 lg:grid-cols-2">
              {studentPathCards.map((path) => (
                <PathCard key={path.title} mode="student" path={path} />
              ))}
            </div>
          </MotionBlock>

          <MotionBlock>
            <Roadmap steps={studentRoadmapSteps} title="Blue Team Roadmap" tone="blue" />
          </MotionBlock>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <MotionBlock>
            <SkillMatrix skills={studentSkillMetrics} />
          </MotionBlock>

          <MotionBlock>
            <GlowCard
              tone="purple"
              className="dashboard-ai-card dashboard-card-3d dashboard-border-sweep dashboard-glow-sweep px-6 py-7 sm:px-7"
            >
              <div className="dashboard-ai-core" aria-hidden="true" />
              <div className="relative z-10 flex flex-col gap-5">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-secondary/28 bg-secondary/10 text-secondary">
                    <ShieldKeyIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-label text-[0.68rem] uppercase text-secondary/78">
                      AI-guided learning path
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-white">
                      Help when a lesson feels stuck.
                    </h2>
                  </div>
                </div>
                <p className="text-sm leading-7 text-foreground/68">
                  The AI Tutor helps explain lessons, gives safe hints, and recommends next steps
                  without revealing final answers.
                </p>
                <CtaLink href={activeHref} tone="purple">Open AI Tutor</CtaLink>
              </div>
            </GlowCard>
          </MotionBlock>

          <MotionBlock>
            <GlowCard tone="pink" className="dashboard-card-3d dashboard-border-sweep dashboard-challenge-card px-6 py-6">
              <div className="relative z-10 flex flex-col gap-4">
                <p className="font-label text-[0.68rem] uppercase text-tertiary/78">
                  Challenge + Lab Connection
                </p>
                <h2 className="font-display text-2xl font-semibold text-white">
                  Practice reinforces each path.
                </h2>
                <p className="text-sm leading-7 text-foreground/66">
                  Challenges are available in authenticated student contexts. Labs remain previewed
                  from navigation until a dedicated lab route exists.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link
                    href="/challenges"
                    className="learning-paths-secondary-cta inline-flex min-h-12 items-center justify-center border border-tertiary/24 bg-tertiary/10 px-4 py-3 font-label text-[0.68rem] uppercase text-tertiary"
                  >
                    Challenges
                  </Link>
                  <Link
                    href="/labs"
                    className="learning-paths-secondary-cta inline-flex min-h-12 items-center justify-center border border-primary/24 bg-primary/10 px-4 py-3 font-label text-[0.68rem] uppercase text-primary"
                  >
                    Labs Preview
                  </Link>
                </div>
              </div>
            </GlowCard>
          </MotionBlock>
        </aside>
      </div>
    </Stage>
  );
}

export function LearningPathsExperience() {
  const { status, user } = useAuthSession();
  const isStudent = status === "authenticated" && isStudentUser(user);
  const displayName = useMemo(() => getStudentDisplayName(user), [user]);
  const publicCourses = useMemo(() => mockCourses.map(toCourseSummary), []);
  const {
    courses,
    errorMessage,
    isLoading: coursesLoading,
  } = useStudentCourses(isStudent, publicCourses);

  if (status === "loading") {
    return <LearningPathsLoadingView />;
  }

  return isStudent ? (
    <StudentLearningPathsView
      courses={courses}
      displayName={displayName}
      errorMessage={errorMessage}
      isSyncing={coursesLoading}
    />
  ) : (
    <GuestLearningPathsView />
  );
}
