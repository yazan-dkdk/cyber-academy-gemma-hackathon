import { logBackendRequest } from "@/lib/backend-api";
import { notifySessionExpired } from "@/lib/session-events";

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionState = {
  mfaRequired: boolean;
  mfaConfigured: boolean;
  mfaVerified: boolean;
};

export type AuthSessionPayload = {
  user: AuthUser;
  session: AuthSessionState;
};

type AuthMessageResponse = {
  message: string;
};

type LoginResponse = {
  user: AuthUser;
  mfaRequired: boolean;
  mfaConfigured: boolean;
  mfaVerified: boolean;
};

type MeResponse = {
  user: AuthUser;
  session: AuthSessionState;
};

type AuthRequestInit = RequestInit & {
  notifyOnUnauthorized?: boolean;
};

export class AuthApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.data = data;
  }
}

function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `/api/auth${normalizedPath}`;
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

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const topLevelMessage = readMessage(payloadRecord.message);
  if (topLevelMessage) {
    return topLevelMessage;
  }

  if (!payloadRecord.error || typeof payloadRecord.error !== "object") {
    return null;
  }

  const errorRecord = payloadRecord.error as Record<string, unknown>;
  return readMessage(errorRecord.message);
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? { message: text } : null;
}

async function request<T>(path: string, init: AuthRequestInit = {}) {
  const { notifyOnUnauthorized, ...requestInit } = init;
  const headers = new Headers(init.headers);
  const url = buildApiUrl(path);
  const method = init.method?.toUpperCase() ?? "GET";

  if (requestInit.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...requestInit,
      credentials: "include",
      headers,
    });
  } catch (error) {
    logBackendRequest("auth-api", method, url, "NETWORK_ERROR");
    throw error;
  }

  logBackendRequest("auth-api", method, url, response.status);

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    if (notifyOnUnauthorized && response.status === 401) {
      notifySessionExpired();
    }

    throw new AuthApiError(
      extractErrorMessage(payload) ?? "Authentication request failed.",
      response.status,
      payload,
    );
  }

  return payload as T;
}

function normalizeSessionPayload(payload: LoginResponse | MeResponse): AuthSessionPayload {
  if ("session" in payload) {
    return payload;
  }

  return {
    user: payload.user,
    session: {
      mfaRequired: payload.mfaRequired,
      mfaConfigured: payload.mfaConfigured,
      mfaVerified: payload.mfaVerified,
    },
  };
}

export async function login(input: { email: string; password: string }) {
  await request<LoginResponse>("/login", {
    method: "POST",
    body: JSON.stringify(input),
  });

  const payload = await getCurrentUser();

  if (process.env.NODE_ENV === "development") {
    console.log("[AUTH_COOKIE_AFTER_LOGIN]", "confirmed by /api/auth/me");
  }

  return payload;
}

export async function register(input: { email: string; password: string }) {
  return request<AuthMessageResponse>("/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyEmail(token: string) {
  return request<AuthMessageResponse>("/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function resendVerification(email: string) {
  return request<AuthMessageResponse>("/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function logout() {
  return request<AuthMessageResponse>("/logout", {
    method: "POST",
    notifyOnUnauthorized: true,
  });
}

export async function getCurrentUser() {
  const payload = await request<MeResponse>("/me");
  return normalizeSessionPayload(payload);
}

export async function forgotPassword(input: { email: string }) {
  return request<AuthMessageResponse>("/forgot-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resetPassword(input: { token: string; password: string }) {
  return request<AuthMessageResponse>("/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function isUnauthenticatedError(error: unknown) {
  return error instanceof AuthApiError && (error.status === 401 || error.status === 403);
}

export function getAuthErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof AuthApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}
