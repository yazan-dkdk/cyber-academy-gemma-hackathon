"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, ShieldLockIcon } from "@/components/ui/icons";
import { askAiTutor } from "@/lib/ai-tutor-client";
import { cn } from "@/lib/cn";
import type { LessonType } from "@/lib/courses/types";

const MAX_LESSON_EXCERPT_LENGTH = 1600;
const SAFE_TUTOR_FALLBACK_MESSAGE =
  "AI Tutor temporarily unavailable. Try again in a moment.";
const GREETING_INTRO_MESSAGE =
  "Hello. I'm your AI Tutor for defensive cybersecurity learning.";

type AiTutorMode = "explanation" | "hint" | "next_step" | "question";

type AiTutorResponseType = "explanation" | "hint" | "refusal" | "next_step" | "unsafe";

type AiTutorSafetyLevel = "safe" | "caution" | "blocked";

type AiTutorProviderLabel = "Local Gemma" | "Gemini Fallback" | "Safe Fallback";

type AiTutorResponse = {
  type: AiTutorResponseType;
  answer: string;
  blocked: boolean;
  safetyLevel: AiTutorSafetyLevel;
  providerLabel?: AiTutorProviderLabel;
};

type AiTutorMessage =
  | {
      id: string;
      role: "user";
      content: string;
      mode: AiTutorMode;
    }
  | {
      id: string;
      role: "assistant_intro";
      content: string;
    }
  | {
      id: string;
      role: "assistant";
      content: string;
      response: AiTutorResponse;
    };

type QuickAction = {
  label: string;
  mode: Exclude<AiTutorMode, "question">;
  question: string;
};

type AiTutorPanelProps = {
  courseTitle: string;
  lessonTitle: string;
  lessonType: LessonType;
  currentProgressPercent: number;
  lessonExcerpt: string;
};

const quickActions: QuickAction[] = [
  {
    label: "Explain this lesson",
    mode: "explanation",
    question: "Explain this lesson",
  },
  {
    label: "Give me a safe hint",
    mode: "hint",
    question: "Give me a safe hint",
  },
  {
    label: "What should I learn next?",
    mode: "next_step",
    question: "What should I learn next?",
  },
];

const responseTypeLabels: Record<AiTutorResponseType, string> = {
  explanation: "Explanation",
  hint: "Safe hint",
  refusal: "Safe refusal",
  next_step: "Next step",
  unsafe: "Unsafe request blocked",
};

const safetyLevelLabels: Record<AiTutorSafetyLevel, string> = {
  safe: "Safe",
  caution: "Caution",
  blocked: "Blocked unsafe request",
};

const greetingInputs = new Set(["hi", "hello", "hey", "greetings"]);

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeResponseType(value: unknown): AiTutorResponseType {
  if (
    value === "explanation" ||
    value === "hint" ||
    value === "refusal" ||
    value === "next_step" ||
    value === "unsafe"
  ) {
    return value;
  }

  if (typeof value === "string" && value.toLowerCase().includes("unsafe")) {
    return "unsafe";
  }

  return "explanation";
}

function isSafetyLevel(value: unknown): value is AiTutorSafetyLevel {
  return value === "safe" || value === "caution" || value === "blocked";
}

function collectProviderCandidates(payload: Record<string, unknown>) {
  const providerKeys = [
    "providerLabel",
    "provider",
    "providerName",
    "runtimeProvider",
    "aiProvider",
    "modelProvider",
    "model",
  ];
  const metadataKeys = ["providerMetadata", "metadata", "runtime"];
  const candidates: string[] = [];

  for (const key of providerKeys) {
    const candidate = readString(payload[key]);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  for (const key of metadataKeys) {
    const metadata = payload[key];

    if (!isRecord(metadata)) {
      continue;
    }

    for (const providerKey of providerKeys) {
      const candidate = readString(metadata[providerKey]);

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function normalizeProviderLabel(payload: Record<string, unknown>): AiTutorProviderLabel | undefined {
  const providerSignal = collectProviderCandidates(payload).join(" ").toLowerCase();

  if (!providerSignal) {
    return undefined;
  }

  if (providerSignal.includes("safe") && providerSignal.includes("fallback")) {
    return "Safe Fallback";
  }

  if (providerSignal.includes("gemini")) {
    return "Gemini Fallback";
  }

  if (
    providerSignal.includes("local gemma") ||
    providerSignal.includes("ollama") ||
    providerSignal.includes("gemma")
  ) {
    return "Local Gemma";
  }

  return undefined;
}

function normalizeAiTutorResponse(payload: unknown): AiTutorResponse {
  if (!isRecord(payload)) {
    throw new Error("AI Tutor returned an invalid response.");
  }

  const responseType = normalizeResponseType(payload.type);
  const isUnsafeType = responseType === "unsafe";

  return {
    type: responseType,
    answer:
      typeof payload.answer === "string" && payload.answer.trim()
        ? payload.answer
        : "The AI Tutor returned an empty answer.",
    blocked: payload.blocked === true || isUnsafeType,
    safetyLevel: isSafetyLevel(payload.safetyLevel)
      ? payload.safetyLevel
      : isUnsafeType
        ? "blocked"
        : "safe",
    providerLabel: normalizeProviderLabel(payload),
  };
}

function normalizeProgressPercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function sanitizeLessonExcerpt(value: string) {
  return value
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link removed]")
    .replace(/\b[A-Z0-9_-]*FLAG\{[^}\r\n]{1,200}\}/gi, "[training flag removed]")
    .replace(/\b(?:flag|answer|solution)\s*[:=]\s*["'`]?[^"'`\s\r\n]{3,200}/gi, (match) => {
      const [label] = match.split(/[:=]/);

      return `${label.trim()}: [removed]`;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_LESSON_EXCERPT_LENGTH);
}

function isGreetingQuestion(question: string) {
  const normalizedQuestion = question
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .trim();

  return greetingInputs.has(normalizedQuestion);
}

function splitMarkdownBlocks(content: string) {
  const blocks: Array<
    | {
        type: "text";
        content: string;
      }
    | {
        type: "code";
        content: string;
        language: string | null;
      }
  > = [];
  const codeFencePattern = /```([a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeFencePattern.exec(content)) !== null) {
    const textBeforeCode = content.slice(lastIndex, match.index);

    if (textBeforeCode.trim()) {
      blocks.push({
        type: "text",
        content: textBeforeCode,
      });
    }

    blocks.push({
      type: "code",
      language: match[1]?.trim() ?? null,
      content: match[2].replace(/\n$/, ""),
    });
    lastIndex = codeFencePattern.lastIndex;
  }

  const remainingText = content.slice(lastIndex);

  if (remainingText.trim()) {
    blocks.push({
      type: "text",
      content: remainingText,
    });
  }

  return blocks.length ? blocks : [{ type: "text" as const, content }];
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const inlinePattern = /(`[^`\n]+`|\*\*[^*]+?\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(text)) !== null) {
    const plainText = text.slice(lastIndex, match.index);

    if (plainText) {
      nodes.push(plainText);
    }

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="border border-primary/20 bg-primary/8 px-1.5 py-0.5 font-mono text-[0.78em] text-primary/92"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    }

    lastIndex = inlinePattern.lastIndex;
  }

  const remainingText = text.slice(lastIndex);

  if (remainingText) {
    nodes.push(remainingText);
  }

  return nodes;
}

function renderTextMarkdown(text: string, keyPrefix: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  function flushParagraph() {
    if (!paragraphLines.length) {
      return;
    }

    const paragraphText = paragraphLines.join(" ").replace(/\s+/g, " ").trim();

    if (paragraphText) {
      nodes.push(
        <p key={`${keyPrefix}-p-${nodes.length}`} className="break-words">
          {renderInlineMarkdown(paragraphText, `${keyPrefix}-p-${nodes.length}`)}
        </p>,
      );
    }

    paragraphLines = [];
  }

  function flushList() {
    if (!listType || !listItems.length) {
      listType = null;
      listItems = [];
      return;
    }

    const ListTag = listType;
    const listKey = `${keyPrefix}-${listType}-${nodes.length}`;

    nodes.push(
      <ListTag
        key={listKey}
        className={cn(
          "space-y-1.5 pl-5 marker:text-primary/82",
          listType === "ul" ? "list-disc" : "list-decimal",
        )}
      >
        {listItems.map((item, itemIndex) => (
          <li key={`${listKey}-${itemIndex}`} className="break-words pl-1">
            {renderInlineMarkdown(item, `${listKey}-${itemIndex}`)}
          </li>
        ))}
      </ListTag>,
    );

    listType = null;
    listItems = [];
  }

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    const bulletMatch = trimmedLine.match(/^[-*]\s+(.+)/);
    const numberedMatch = trimmedLine.match(/^\d+[.)]\s+(.+)/);

    if (bulletMatch || numberedMatch) {
      const nextListType = bulletMatch ? "ul" : "ol";

      flushParagraph();

      if (listType && listType !== nextListType) {
        flushList();
      }

      listType = nextListType;
      listItems.push((bulletMatch?.[1] ?? numberedMatch?.[1] ?? "").trim());
      continue;
    }

    flushList();
    paragraphLines.push(trimmedLine);
  }

  flushParagraph();
  flushList();

  return nodes;
}

function MarkdownResponse({
  content,
  isSafetyWarning,
}: {
  content: string;
  isSafetyWarning: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-3 border px-3 py-3 text-sm leading-6 shadow-[inset_0_0_18px_rgba(255,255,255,0.025)]",
        isSafetyWarning
          ? "border-amber-400/30 bg-red-950/18 text-amber-50/86 shadow-[inset_0_0_18px_rgba(251,191,36,0.07)]"
          : "border-outline-variant/26 bg-surface-low/54 text-foreground/78",
      )}
    >
      {splitMarkdownBlocks(content).map((block, blockIndex) => {
        if (block.type === "code") {
          return (
            <pre
              key={`code-${blockIndex}`}
              className="max-w-full overflow-x-auto border border-primary/18 bg-black/35 p-3 font-mono text-xs leading-5 text-primary/88"
            >
              {block.language ? (
                <span className="mb-2 block font-label text-[0.56rem] uppercase text-primary/48">
                  {block.language}
                </span>
              ) : null}
              <code>{block.content}</code>
            </pre>
          );
        }

        return renderTextMarkdown(block.content, `md-${blockIndex}`);
      })}
    </div>
  );
}

function ProviderBadge({ label }: { label: AiTutorProviderLabel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-1 font-label text-[0.54rem] font-extrabold uppercase",
        label === "Local Gemma"
          ? "border-primary/24 bg-primary/8 text-primary/82"
          : label === "Gemini Fallback"
            ? "border-purple-300/24 bg-purple-500/10 text-purple-100/82"
            : "border-amber-400/34 bg-amber-500/10 text-amber-100/88",
      )}
    >
      <span className="h-1.5 w-1.5 bg-current shadow-[0_0_8px_currentColor]" aria-hidden="true" />
      {label}
    </span>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce bg-primary shadow-[0_0_8px_rgba(0,240,255,0.65)]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function isSafetyWarningResponse(response: AiTutorResponse) {
  return response.blocked || response.type === "refusal" || response.type === "unsafe" || response.safetyLevel === "blocked";
}

function getResponseBadgeLabel(response: AiTutorResponse) {
  if (response.blocked && response.type !== "unsafe") {
    return "Safe refusal";
  }

  return responseTypeLabels[response.type];
}

export function AiTutorPanel({
  courseTitle,
  lessonTitle,
  lessonType,
  currentProgressPercent,
  lessonExcerpt,
}: AiTutorPanelProps) {
  const [messages, setMessages] = useState<AiTutorMessage[]>([]);
  const [typedMessages, setTypedMessages] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProviderLabel, setActiveProviderLabel] = useState<AiTutorProviderLabel | null>(null);
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const safeLessonExcerpt = useMemo(
    () => sanitizeLessonExcerpt(lessonExcerpt),
    [lessonExcerpt],
  );
  const safeProgressPercent = normalizeProgressPercent(currentProgressPercent);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, typedMessages, isLoading, errorMessage]);

  useEffect(() => {
    const latestAssistantMessage = messages.findLast(
      (message) => message.role === "assistant" && !animatedMessageIdsRef.current.has(message.id),
    );

    if (!latestAssistantMessage || latestAssistantMessage.role !== "assistant") {
      return;
    }

    animatedMessageIdsRef.current.add(latestAssistantMessage.id);
    setTypedMessages((currentMessages) => ({
      ...currentMessages,
      [latestAssistantMessage.id]: "",
    }));

    let visibleLength = 0;
    const chunkSize = Math.max(1, Math.ceil(latestAssistantMessage.content.length / 140));
    const intervalId = window.setInterval(() => {
      visibleLength = Math.min(
        latestAssistantMessage.content.length,
        visibleLength + chunkSize,
      );

      setTypedMessages((currentMessages) => ({
        ...currentMessages,
        [latestAssistantMessage.id]: latestAssistantMessage.content.slice(0, visibleLength),
      }));

      if (visibleLength >= latestAssistantMessage.content.length) {
        window.clearInterval(intervalId);
      }
    }, 18);

    return () => window.clearInterval(intervalId);
  }, [messages]);

  async function askTutor(userQuestion: string, mode: AiTutorMode) {
    const trimmedQuestion = userQuestion.trim();

    if (!trimmedQuestion || isLoading) {
      return;
    }

    const userMessage: AiTutorMessage = {
      id: createMessageId(),
      role: "user",
      content: trimmedQuestion,
      mode,
    };
    const introMessage: AiTutorMessage | null = isGreetingQuestion(trimmedQuestion)
      ? {
          id: createMessageId(),
          role: "assistant_intro",
          content: GREETING_INTRO_MESSAGE,
        }
      : null;

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      ...(introMessage ? [introMessage] : []),
    ]);
    setErrorMessage(null);
    setActiveProviderLabel(null);
    setIsLoading(true);

    try {
      const response = await askAiTutor({
        question: trimmedQuestion,
        lessonTitle,
        lessonType,
        courseTitle,
        currentProgressPercent: safeProgressPercent,
        lessonContent: safeLessonExcerpt,
      });

      if (!response.ok) {
        throw new Error(`AI Tutor request failed (${response.status}).`);
      }

      const data = normalizeAiTutorResponse(await response.json());
      const assistantMessage: AiTutorMessage = {
        id: createMessageId(),
        role: "assistant",
        content: data.answer,
        response: data,
      };

      setTypedMessages((currentMessages) => ({
        ...currentMessages,
        [assistantMessage.id]: "",
      }));
      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
      setActiveProviderLabel(data.providerLabel ?? null);
      setInputValue("");
    } catch {
      setErrorMessage(SAFE_TUTOR_FALLBACK_MESSAGE);
      setActiveProviderLabel("Safe Fallback");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askTutor(inputValue, "question");
  }

  return (
    <section
      aria-label="AI Tutor"
      aria-busy={isLoading}
      className="space-y-4 border border-primary/14 bg-surface-lowest/44 p-3 shadow-[inset_0_0_22px_rgba(0,240,255,0.04)] sm:p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center border border-primary/24 bg-primary/8 text-primary">
          <ShieldLockIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="lesson-panel-kicker text-primary/76">AI Tutor</p>
            {activeProviderLabel ? <ProviderBadge label={activeProviderLabel} /> : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-foreground/62">
            Safe AI Tutor: gives explanations and hints, but does not reveal flags or harmful steps.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-1">
        {quickActions.map((action) => (
          <button
            key={action.mode}
            type="button"
            disabled={isLoading}
            onClick={() => void askTutor(action.question, action.mode)}
            className="inline-flex min-h-10 items-center justify-between gap-3 border border-primary/18 bg-primary/5 px-3 py-2 text-left font-label text-[0.62rem] font-extrabold uppercase text-primary/86 hover:border-primary/44 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{action.label}</span>
            <ArrowRightIcon className="h-3.5 w-3.5 shrink-0" />
          </button>
        ))}
      </div>

      <div
        className="max-h-80 space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]"
        aria-live="polite"
      >
        {messages.map((message) => {
          if (message.role === "user") {
            return (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[92%] break-words border border-primary/18 bg-primary/10 px-3 py-2 text-sm leading-6 text-foreground/86 sm:max-w-[88%]">
                  {message.content}
                </p>
              </div>
            );
          }

          if (message.role === "assistant_intro") {
            return (
              <p
                key={message.id}
                className="border border-primary/16 bg-primary/5 px-3 py-2 text-xs leading-5 text-primary/78"
              >
                {message.content}
              </p>
            );
          }

          const isSafetyWarning = isSafetyWarningResponse(message.response);
          const isBlockedSafetyLevel = message.response.safetyLevel === "blocked";

          return (
            <div key={message.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 border px-2 py-1 font-label text-[0.56rem] font-extrabold uppercase",
                    isSafetyWarning
                      ? "border-amber-400/38 bg-red-950/22 text-amber-100"
                      : "border-primary/18 bg-primary/8 text-primary/82",
                  )}
                >
                  {isSafetyWarning ? <ShieldLockIcon className="h-3 w-3" /> : null}
                  {getResponseBadgeLabel(message.response)}
                </span>
                <span
                  className={cn(
                    "border px-2 py-1 font-label text-[0.56rem] font-extrabold uppercase",
                    isBlockedSafetyLevel
                      ? "border-red-400/38 bg-red-500/12 text-red-100"
                      : "border-outline-variant/40 bg-white/[0.03] text-foreground/46",
                  )}
                >
                  {safetyLevelLabels[message.response.safetyLevel]}
                </span>
                {message.response.providerLabel ? (
                  <ProviderBadge label={message.response.providerLabel} />
                ) : null}
              </div>
              <MarkdownResponse
                content={typedMessages[message.id] ?? message.content}
                isSafetyWarning={isSafetyWarning}
              />
            </div>
          );
        })}

        {isLoading ? (
          <p className="flex items-center justify-between gap-3 border border-primary/18 bg-primary/5 px-3 py-3 text-sm leading-6 text-primary/78">
            <span>AI Tutor is preparing a safe response</span>
            <LoadingDots />
          </p>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="border border-amber-400/32 bg-red-950/18 px-3 py-3 text-xs leading-5 text-amber-50/88 shadow-[inset_0_0_18px_rgba(251,191,36,0.07)]"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-label text-[0.56rem] font-extrabold uppercase text-amber-100">
                <ShieldLockIcon className="h-3 w-3" />
                Safe fallback
              </span>
              <ProviderBadge label="Safe Fallback" />
            </div>
            {errorMessage}
          </div>
        ) : null}

        {!messages.length && !isLoading && !errorMessage ? (
          <p className="border border-outline-variant/22 bg-white/[0.025] px-3 py-3 text-xs leading-5 text-foreground/46">
            Ask for an explanation, a safe hint, or the next learning step for this lesson.
          </p>
        ) : null}

        <div ref={latestMessageRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={inputValue}
          disabled={isLoading}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Ask a safe lesson question"
          className="min-w-0 flex-1 border border-outline-variant/42 bg-surface-highest/58 px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/28 focus:border-primary/72 focus:shadow-[0_0_18px_rgba(0,240,255,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className="inline-flex min-h-10 items-center justify-center border border-primary/28 bg-primary/12 px-3 text-primary hover:border-primary/64 hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-50 sm:w-11"
          aria-label="Ask AI Tutor"
        >
          {isLoading ? (
            <span
              className="h-4 w-4 animate-spin border border-primary/28 border-t-primary"
              aria-hidden="true"
            />
          ) : (
            <ArrowRightIcon className="h-4 w-4" />
          )}
        </button>
      </form>
    </section>
  );
}
