"use client";

import { notifySessionExpired } from "@/lib/session-events";

export class StudentApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "StudentApiError";
    this.status = status;
    this.data = data;
  }
}

function buildStudentApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `/api/student${normalizedPath}`;
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
    return messages.length ? messages.join(" ") : null;
  }

  return null;
}

function extractErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const topLevelMessage = readMessage(record.message);

  if (topLevelMessage) {
    return topLevelMessage;
  }

  if (!record.error || typeof record.error !== "object") {
    return null;
  }

  return readMessage((record.error as Record<string, unknown>).message);
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text.length ? { message: text } : null;
}

async function studentRequest<T>(path: string, init: RequestInit = {}) {
  const url = buildStudentApiUrl(path);

  if (typeof window === "undefined") {
    console.warn("student api blocked on server runtime");
    throw new StudentApiError("Student API requests must run in the browser.", 0, null);
  }

  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch (error) {
    throw error;
  }

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    if (response.status === 401) {
      notifySessionExpired();
    }

    throw new StudentApiError(
      extractErrorMessage(payload) ?? "Student API request failed.",
      response.status,
      payload,
    );
  }

  return payload as T;
}

async function parseStudentResponse<T>(
  response: Response,
  fallbackMessage = "Student API request failed.",
) {
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    if (response.status === 401) {
      notifySessionExpired();
    }

    throw new StudentApiError(
      extractErrorMessage(payload) ?? fallbackMessage,
      response.status,
      payload,
    );
  }

  return payload as T;
}

function readProgressNumber(
  record: Record<string, unknown>,
  nestedRecord: Record<string, unknown> | null,
  keys: string[],
) {
  for (const key of keys) {
    const value = record[key] ?? nestedRecord?.[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return null;
}

function readProgressBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function clampProgressPercent(value: number | null) {
  return value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
}

function clampReadingTimeSeconds(value: number | null) {
  return value === null ? 0 : Math.max(0, Math.round(value));
}

function normalizeStudentLessonProgressBody(body: unknown) {
  if (!isRecord(body)) {
    return null;
  }

  const nestedProgress = isRecord(body.progress) ? body.progress : null;
  const scrollPercent = readProgressNumber(body, nestedProgress, [
    "scrollPercent",
    "scroll",
    "scrollProgress",
  ]);
  const watchPercent = readProgressNumber(body, nestedProgress, [
    "watchPercent",
    "watch",
    "watchProgress",
  ]);
  const readingTimeSeconds = readProgressNumber(body, nestedProgress, [
    "readingTimeSeconds",
    "readingTime",
  ]);
  const completed = readProgressBoolean(body, [
    "completed",
    "completionRequested",
    "isCompleted",
  ]);

  if (
    scrollPercent === null &&
    watchPercent === null &&
    readingTimeSeconds === null &&
    completed === null
  ) {
    return null;
  }

  const normalizedBody: {
    scrollPercent?: number;
    readingTimeSeconds?: number;
    watchPercent?: number;
    completed: boolean;
  } = {
    completed: completed ?? false,
  };

  if (scrollPercent !== null) {
    normalizedBody.scrollPercent = clampProgressPercent(scrollPercent);
  }

  if (readingTimeSeconds !== null) {
    normalizedBody.readingTimeSeconds = clampReadingTimeSeconds(readingTimeSeconds);
  }

  if (watchPercent !== null) {
    normalizedBody.watchPercent = clampProgressPercent(watchPercent);
  }

  return normalizedBody;
}

export function fetchStudentCourses() {
  return studentRequest<unknown>("/courses");
}

export function fetchStudentDashboard() {
  return studentRequest<unknown>("/dashboard");
}

export function fetchStudentCourse(courseId: string) {
  return studentRequest<unknown>(`/courses/${encodeURIComponent(courseId)}`);
}

export function enrollStudentCourse(courseId: string) {
  const normalizedCourseId = courseId.trim();

  if (!normalizedCourseId) {
    throw new StudentApiError("Missing course id for enrollment.", 0, null);
  }

  return studentRequest<unknown>(`/courses/${encodeURIComponent(normalizedCourseId)}/enroll`, {
    method: "POST",
  });
}

export function fetchStudentLesson(courseId: string, lessonId: string) {
  return studentRequest<unknown>(
    `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`,
  );
}

export function updateStudentLessonProgress(courseId: string, lessonId: string, body: unknown) {
  const normalizedBody = normalizeStudentLessonProgressBody(body);

  if (!normalizedBody) {
    return Promise.reject(
      new StudentApiError("Progress update skipped because no measured values were present.", 0, null),
    );
  }

  const progressBody = JSON.stringify(normalizedBody);
  const options: RequestInit = {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: progressBody,
  };

  return fetch(
    `/api/student/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/progress`,
    options,
  ).then((response) => parseStudentResponse<unknown>(response));
}

export function fetchStudentContinueLearning() {
  return studentRequest<unknown>("/continue-learning");
}

export function fetchStudentActivity() {
  return studentRequest<unknown>("/activity");
}
