"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, startTransition, useEffect, useState } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { InputField } from "@/components/ui/InputField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { EmailIcon, LockIcon, ShieldKeyIcon } from "@/components/ui/icons";
import { register, resendVerification } from "@/lib/auth-client";

const REGISTER_SUCCESS_MESSAGE =
  "Account created. Check your email to verify your account before signing in.";
const RESEND_SUCCESS_MESSAGE =
  "If the account can receive verification mail, a new verification email has been sent.";

export function RegisterForm() {
  const router = useRouter();
  const { status } = useAuthSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch("/login");

    if (status === "authenticated") {
      startTransition(() => {
        router.replace("/dashboard");
      });
    }
  }, [router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    const acceptedTerms = formData.get("terms") === "on";

    if (password !== confirmPassword) {
      setMessage("Password confirmation does not match. Verify the encryption key and try again.");
      return;
    }

    if (!acceptedTerms) {
      setMessage("Accept the operational protocols before initializing your account.");
      return;
    }

    setMessage(null);
    setResendMessage(null);
    setIsSubmitting(true);

    try {
      await register({ email, password });
      form.reset();
      setRegisteredEmail(email);
      setMessage(REGISTER_SUCCESS_MESSAGE);
    } catch {
      setMessage("Unable to initialize your account right now. Try again in a moment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    if (!registeredEmail || isResending) {
      return;
    }

    setResendMessage(null);
    setIsResending(true);

    try {
      await resendVerification(registeredEmail);
      setResendMessage(RESEND_SUCCESS_MESSAGE);
    } catch {
      setResendMessage("Unable to send the verification request right now. Try again in a moment.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="space-y-8">
      {message ? (
        <div data-tone="pink" className="status-banner px-4 py-3 text-sm leading-6">
          {message}
        </div>
      ) : null}

      {registeredEmail ? (
        <div className="space-y-5">
          <Link href="/login" data-tone="pink" className="primary-button">
            <span className="primary-button__sweep" />
            <span className="relative z-10">Go to Sign In</span>
          </Link>

          <PrimaryButton
            tone="pink"
            type="button"
            loading={isResending}
            onClick={handleResendVerification}
          >
            {isResending ? "Sending..." : "Resend verification email"}
          </PrimaryButton>

          {resendMessage ? (
            <p className="text-center text-sm leading-6 text-foreground/64">{resendMessage}</p>
          ) : null}
        </div>
      ) : (
        <>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <InputField
              tone="pink"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              label="Data Channel (Email)"
              placeholder="Email address"
              icon={<EmailIcon className="h-4 w-4" />}
            />

            <InputField
              tone="pink"
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              label="Encryption Key"
              placeholder="Password"
              icon={<LockIcon className="h-4 w-4" />}
            />

            <InputField
              tone="pink"
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              label="Verify Encryption"
              placeholder="Confirm Password"
              icon={<ShieldKeyIcon className="h-4 w-4" />}
            />

            <label data-tone="pink" className="flex items-start gap-3 text-sm leading-6 text-foreground/70">
              <input id="terms" name="terms" type="checkbox" className="checkbox-core" />
              <span>
                I accept the{" "}
                <Link href="/terms" className="font-semibold text-tertiary hover:text-white">
                  Terms &amp; Conditions
                </Link>{" "}
                and understand the operational protocols.
              </span>
            </label>

            <PrimaryButton tone="pink" type="submit" loading={isSubmitting}>
              {isSubmitting ? "Initializing..." : "Create Account"}
            </PrimaryButton>
          </form>

          <p className="border-t border-outline-variant/12 pt-8 text-center text-sm text-foreground/72">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-tertiary hover:text-white">
              Sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
