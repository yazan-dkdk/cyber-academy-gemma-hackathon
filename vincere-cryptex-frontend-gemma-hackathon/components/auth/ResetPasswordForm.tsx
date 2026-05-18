"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { InputField } from "@/components/ui/InputField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ArrowBackIcon, LockIcon, ShieldKeyIcon } from "@/components/ui/icons";
import { getAuthErrorMessage, resetPassword } from "@/lib/auth-client";

const RESET_TOKEN_LENGTH = 64;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const normalizedToken = token.trim();
  const hasValidToken = normalizedToken.length === RESET_TOKEN_LENGTH;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [message, setMessage] = useState<string | null>(
    hasValidToken
      ? null
      : "Recovery link is invalid or incomplete. Request a fresh password reset email.",
  );

  useEffect(() => {
    router.prefetch("/login");
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!hasValidToken) {
      setIsSuccess(false);
      setMessage("Recovery link is invalid or incomplete. Request a fresh password reset email.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setIsSuccess(false);
      setMessage("Password confirmation does not match. Verify the new access key and try again.");
      return;
    }

    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await resetPassword({ token: normalizedToken, password });
      form.reset();
      setIsSuccess(true);
      setMessage(response.message);
    } catch (error) {
      setIsSuccess(false);
      setMessage(
        getAuthErrorMessage(
          error,
          "Unable to reset the password right now. Request a fresh recovery link and try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {message ? (
        <div data-tone="purple" className="status-banner px-4 py-3 text-sm leading-6">
          {message}
        </div>
      ) : null}

      <form className="space-y-6" onSubmit={handleSubmit}>
        <InputField
          tone="purple"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          label="New Access Key"
          placeholder="************"
          icon={<LockIcon className="h-4 w-4" />}
        />

        <InputField
          tone="purple"
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          label="Verify Access Key"
          placeholder="Re-enter the new password"
          icon={<ShieldKeyIcon className="h-4 w-4" />}
        />

        <PrimaryButton
          tone="purple"
          type="submit"
          loading={isSubmitting}
          disabled={!hasValidToken || isSuccess}
        >
          {isSubmitting ? "Updating..." : isSuccess ? "Password Updated" : "Reset Password"}
        </PrimaryButton>

        <div className="pt-4 text-center">
          <Link
            href={isSuccess ? "/login" : "/forgot-password"}
            className="inline-flex items-center gap-2 font-label text-[0.9rem] uppercase tracking-[0.24em] text-foreground/64 hover:text-primary"
          >
            <ArrowBackIcon className="h-4 w-4" />
            {isSuccess ? "Back to login" : "Request new link"}
          </Link>
        </div>
      </form>
    </div>
  );
}
