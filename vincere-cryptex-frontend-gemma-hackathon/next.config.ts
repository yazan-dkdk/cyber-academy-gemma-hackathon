import type { NextConfig } from "next";

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function validateProductionBackendOrigin() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const rawConfiguredOrigin = process.env.NEXT_PUBLIC_API_BASE_URL;
  const configuredOrigin = rawConfiguredOrigin?.trim();

  if (!configuredOrigin) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required in production");
  }

  if (rawConfiguredOrigin !== configuredOrigin) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must not contain leading or trailing whitespace",
    );
  }

  let backendOrigin: URL;

  try {
    backendOrigin = new URL(configuredOrigin);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be a valid URL");
  }

  if (backendOrigin.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use https:// in production");
  }

  if (backendOrigin.username || backendOrigin.password) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must not contain credentials");
  }

  if (backendOrigin.pathname !== "/" || backendOrigin.search || backendOrigin.hash) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must be an origin without a path, query, or fragment",
    );
  }

  if (isLoopbackHostname(backendOrigin.hostname)) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must not use a loopback host in production");
  }
}

validateProductionBackendOrigin();

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
