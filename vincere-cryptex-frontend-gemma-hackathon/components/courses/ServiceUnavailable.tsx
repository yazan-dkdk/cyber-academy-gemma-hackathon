"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { GlowCard } from "@/components/ui/GlowCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ShieldLockIcon } from "@/components/ui/icons";
import type { CourseServiceUnavailableState } from "@/lib/courses/service-unavailable";

type ServiceUnavailableProps = {
  serviceError: CourseServiceUnavailableState;
  onRetry?: () => void | Promise<void>;
};

export function ServiceUnavailable({ serviceError, onRetry }: ServiceUnavailableProps) {
  const router = useRouter();
  const [retryingError, setRetryingError] = useState<CourseServiceUnavailableState | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isRetrying = retryingError === serviceError;

  useEffect(() => {
    alertRef.current?.focus();
  }, []);

  function handleRetry() {
    if (isRetrying) {
      return;
    }

    setRetryingError(serviceError);

    try {
      void Promise.resolve(onRetry ? onRetry() : router.refresh()).catch(() => {
        setRetryingError(null);
      });
    } catch {
      setRetryingError(null);
    }
  }

  return (
    <section className="dashboard-stage dashboard-3d-space dashboard-scan-energy relative flex min-h-[72vh] flex-1 items-center justify-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(0,240,255,0.13),transparent_30%),radial-gradient(circle_at_82%_22%,rgba(168,85,247,0.12),transparent_32%),linear-gradient(rgba(0,240,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.02)_1px,transparent_1px)] bg-[size:auto,auto,32px_32px,32px_32px]"
        aria-hidden="true"
      />

      <GlowCard
        tone="cyan"
        className="dashboard-card-3d dashboard-border-sweep dashboard-premium-card relative z-10 w-full max-w-3xl overflow-hidden px-6 py-9 sm:px-10 sm:py-11 lg:px-12"
      >
        <div
          ref={alertRef}
          role="alert"
          aria-atomic="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className="relative z-10 outline-none"
        >
          <div className="flex flex-col items-center text-center">
            <div
              className="inline-flex items-center gap-2 border border-primary/24 bg-primary/[0.07] px-3 py-1.5 font-label text-[0.66rem] uppercase tracking-[0.2em] text-primary"
              aria-label="Learning service connection interrupted"
            >
              <span
                className="h-2 w-2 rounded-full bg-primary shadow-[0_0_14px_rgba(0,240,255,0.8)] motion-safe:animate-pulse"
                aria-hidden="true"
              />
              Connection interrupted
            </div>

            <span
              className="mt-7 flex h-16 w-16 items-center justify-center border border-primary/28 bg-primary/10 text-primary shadow-[0_0_36px_rgba(0,240,255,0.16)]"
              aria-hidden="true"
            >
              <ShieldLockIcon className="h-8 w-8" />
            </span>

            <p className="mt-6 font-label text-[0.7rem] uppercase tracking-[0.22em] text-primary/70">
              Learning Service Status
            </p>
            <h1
              id={titleId}
              className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl"
            >
              Service Temporarily Unavailable
            </h1>

            <div
              id={descriptionId}
              className="mt-5 max-w-2xl space-y-3 text-sm leading-7 text-foreground/70 sm:text-base"
            >
              <p>We&apos;re currently unable to reach the learning service.</p>
              <p className="text-foreground/82">Your account and learning progress remain safe.</p>
              <p>Please try again in a few moments.</p>
            </div>

            <div className="mt-8 grid w-full max-w-md gap-3 sm:grid-cols-2">
              <PrimaryButton
                type="button"
                disabled={isRetrying}
                onClick={handleRetry}
                aria-busy={isRetrying}
                aria-describedby={descriptionId}
                className="min-h-12 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {isRetrying ? (
                    <span
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : null}
                  {isRetrying ? "Retrying" : "Retry"}
                </span>
              </PrimaryButton>
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center border border-secondary/30 bg-secondary/10 px-5 py-3 font-label text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-secondary transition hover:border-secondary/60 hover:bg-secondary/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
              >
                Return Home
              </Link>
            </div>

            <p className="sr-only" role="status" aria-live="polite">
              {isRetrying ? "Retrying the learning service request." : ""}
            </p>
          </div>
        </div>
      </GlowCard>
    </section>
  );
}
