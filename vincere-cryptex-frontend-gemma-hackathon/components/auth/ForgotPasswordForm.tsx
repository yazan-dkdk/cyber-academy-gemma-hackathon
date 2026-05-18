"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { InputField } from "@/components/ui/InputField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ArrowBackIcon, EmailIcon } from "@/components/ui/icons";
import { forgotPassword, getAuthErrorMessage } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();

    setIsSubmitting(true);

    try {
      const response = await forgotPassword({ email });
      form.reset();
      setMessage(response.message);
    } catch (error) {
      setMessage(
        getAuthErrorMessage(
          error,
          "Unable to send the recovery request right now. Try again in a moment.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {message ? (
        <div data-tone="cyan" className="status-banner px-4 py-3 text-sm leading-6">
          {message}
        </div>
      ) : null}

      <form className="space-y-6" onSubmit={handleSubmit}>
        <InputField
          tone="cyan"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          label="User Email Interface"
          placeholder="name@domain.tech"
          icon={<EmailIcon className="h-4 w-4" />}
          iconPosition="end"
        />

        <PrimaryButton tone="cyan" type="submit" loading={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send Reset Link"}
        </PrimaryButton>

        <div className="pt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 font-label text-[0.9rem] uppercase tracking-[0.24em] text-foreground/64 hover:text-primary"
          >
            <ArrowBackIcon className="h-4 w-4" />
            Back to login
          </Link>
        </div>
      </form>
    </div>
  );
}
