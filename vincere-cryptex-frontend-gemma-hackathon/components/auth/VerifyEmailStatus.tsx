"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { verifyEmail } from "@/lib/auth-client";

type VerifyStatus = "verifying" | "success" | "invalid";

const statusMessages: Record<VerifyStatus, string> = {
  verifying: "Verifying...",
  success: "Email verified successfully",
  invalid: "Invalid or expired verification link",
};

export function VerifyEmailStatus() {
  const router = useRouter();
  const hasRequestedVerification = useRef(false);
  const [status, setStatus] = useState<VerifyStatus>("verifying");

  useEffect(() => {
    router.prefetch("/login");
  }, [router]);

  useEffect(() => {
    if (hasRequestedVerification.current) {
      return;
    }

    hasRequestedVerification.current = true;

    let isMounted = true;

    async function runVerification() {
      const token = new URLSearchParams(window.location.search).get("token")?.trim();
      if (!token) {
        await Promise.resolve();
        if (isMounted) {
          setStatus("invalid");
        }
        return;
      }

      try {
        await verifyEmail(token);
        if (isMounted) {
          setStatus("success");
        }
      } catch {
        if (isMounted) {
          setStatus("invalid");
        }
      }
    }

    void runVerification();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div
        data-tone="cyan"
        className="status-banner px-4 py-3 text-sm leading-6"
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-3">
          {status === "verifying" ? <span className="loading-dot" aria-hidden="true" /> : null}
          {statusMessages[status]}
        </span>
      </div>

      {status === "success" ? (
        <Link href="/login" data-tone="cyan" className="primary-button">
          <span className="primary-button__sweep" />
          <span className="relative z-10">Go to Sign In</span>
        </Link>
      ) : null}
    </div>
  );
}
