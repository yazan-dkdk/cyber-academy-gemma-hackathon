"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, startTransition, useEffect, useState } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { InputField } from "@/components/ui/InputField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { SocialButton } from "@/components/ui/SocialButton";
import { GitHubIcon, GoogleIcon, LinkedInIcon } from "@/components/ui/icons";
import { login, resendVerification } from "@/lib/auth-client";
import { SOCIAL_PROVIDERS } from "@/lib/social-providers";

const providerIcons = {
  google: GoogleIcon,
  linkedin: LinkedInIcon,
  github: GitHubIcon,
};

const RESEND_SUCCESS_MESSAGE =
  "If the account can receive verification mail, a new verification email has been sent.";

export function LoginForm() {
  const router = useRouter();
  const { setAuthenticatedSession, status } = useAuthSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/register");
    router.prefetch("/forgot-password");
    router.prefetch("/reset-password");

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

    setNotice(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const normalizedEmail = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const session = await login({ email: normalizedEmail, password });
      setAuthenticatedSession(session);

      startTransition(() => {
        router.push("/dashboard");
      });
    } catch {
      setNotice("Unable to sign in. Check your credentials and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    if (isResending) {
      return;
    }

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setNotice("Enter your email above to request a verification email.");
      return;
    }

    setNotice(null);
    setIsResending(true);

    try {
      await resendVerification(normalizedEmail);
      setNotice(RESEND_SUCCESS_MESSAGE);
    } catch {
      setNotice("Unable to send the verification request right now. Try again in a moment.");
    } finally {
      setIsResending(false);
    }
  }

  function handleSocialClick(providerId: (typeof SOCIAL_PROVIDERS)[number]["id"]) {
    const provider = SOCIAL_PROVIDERS.find((item) => item.id === providerId);

    if (!provider) {
      return;
    }

    setNotice(
      `${provider.label} will be wired to the secure backend-driven student flow later. Admin access will remain excluded from social login.`,
    );
  }

  return (
    <div className="space-y-8">
      {notice ? (
        <div
          data-tone="purple"
          className="status-banner px-4 py-3 text-sm leading-6"
        >
          {notice}
        </div>
      ) : null}

      <form className="space-y-6" onSubmit={handleSubmit}>
        <InputField
          tone="purple"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          label="Operator Identifier"
          placeholder="operator@vincere.io"
        />

        <div className="space-y-2">
          <InputField
            tone="purple"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            maxLength={128}
            label="Access Key"
            placeholder="************"
          />
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm text-secondary hover:text-[#ddb7ff]"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <p className="text-sm leading-6 text-foreground/60">
          If you just registered, verify your email first.{" "}
          <button
            type="button"
            disabled={isResending}
            onClick={handleResendVerification}
            className="font-semibold text-[#ddb7ff] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isResending ? "Sending..." : "Resend verification email"}
          </button>
        </p>

        <PrimaryButton tone="purple" type="submit" loading={isSubmitting}>
          {isSubmitting ? "Signing In..." : "Sign In"}
        </PrimaryButton>
      </form>

      <div className="auth-divider font-label text-[0.62rem] font-bold uppercase tracking-[0.34em] text-foreground/44">
        Or continue with
      </div>

      <div className="grid gap-3">
        {SOCIAL_PROVIDERS.map((provider) => {
          const Icon = providerIcons[provider.id];

          return (
            <SocialButton
              key={provider.id}
              tone="purple"
              type="button"
              label={provider.label}
              icon={<Icon className="h-5 w-5" />}
              onClick={() => handleSocialClick(provider.id)}
            />
          );
        })}
      </div>

      <p className="pt-2 text-center text-sm text-foreground/72">
        New to Vincere Cryptex?{" "}
        <Link
          href="/register"
          className="font-semibold text-[#ddb7ff] hover:text-white"
        >
          Create Account
        </Link>
      </p>
    </div>
  );
}
