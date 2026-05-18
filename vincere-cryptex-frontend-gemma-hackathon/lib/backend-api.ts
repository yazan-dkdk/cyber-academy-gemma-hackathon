"use client";

const DEFAULT_BACKEND_ORIGIN = "http://localhost:3000";
const FRONTEND_DEV_ORIGINS = new Set([
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);

let loggedBackendOriginWarning = false;

function warnBackendOrigin(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development" || loggedBackendOriginWarning) {
    return;
  }

  loggedBackendOriginWarning = true;
  console.warn(message, details);
}

function normalizeConfiguredOrigin(value: string | undefined) {
  const configuredValue = value?.trim();

  if (!configuredValue) {
    return DEFAULT_BACKEND_ORIGIN;
  }

  try {
    return new URL(configuredValue).origin;
  } catch {
    warnBackendOrigin("Invalid backend API origin; using default Nest backend origin.", {
      configuredValue,
      defaultOrigin: DEFAULT_BACKEND_ORIGIN,
    });
    return DEFAULT_BACKEND_ORIGIN;
  }
}

export function getBackendApiOrigin() {
  const origin = normalizeConfiguredOrigin(process.env.NEXT_PUBLIC_API_BASE_URL);
  const browserOrigin = typeof window === "undefined" ? null : window.location.origin;

  if (
    process.env.NODE_ENV === "development" &&
    (FRONTEND_DEV_ORIGINS.has(origin) || (browserOrigin && origin === browserOrigin))
  ) {
    warnBackendOrigin("Backend API origin points at the frontend dev server; using Nest backend origin.", {
      configuredOrigin: origin,
      browserOrigin,
      backendOrigin: DEFAULT_BACKEND_ORIGIN,
    });
    return DEFAULT_BACKEND_ORIGIN;
  }

  return origin;
}

export function buildBackendApiUrl(namespace: string, path: string) {
  const normalizedNamespace = namespace.startsWith("/") ? namespace : `/${namespace}`;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${getBackendApiOrigin()}/api${normalizedNamespace}${normalizedPath}`;
}

export function logBackendRequest(
  label: string,
  method: string,
  url: string,
  status: number | "NETWORK_ERROR",
) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log(`[${label}]`, method, url, status);
}
