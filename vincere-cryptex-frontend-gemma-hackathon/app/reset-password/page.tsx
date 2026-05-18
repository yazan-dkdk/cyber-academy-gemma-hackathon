import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new access key for your Vincere Cryptex account.",
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const resolvedSearchParams = await searchParams;
  const tokenValue = resolvedSearchParams.token;
  const token = Array.isArray(tokenValue) ? tokenValue[0] ?? "" : tokenValue ?? "";

  return (
    <AuthLayout
      tone="purple"
      backgroundImage="/images/stitch/forgot-bg.webp"
      centered
    >
      <AuthPanel
        tone="purple"
        title="Provision a New Access Key"
        description="Submit a new password from your recovery link to restore secure platform access."
        descriptionStyle="body"
        metadata={
          <div className="mt-8 flex justify-between border-t border-outline-variant/10 pt-4 font-label text-[0.56rem] uppercase tracking-[0.28em] text-foreground/28">
            <span>Recovery_Mode: Armed</span>
            <span>Link_Check: Active</span>
          </div>
        }
      >
        <ResetPasswordForm token={token} />
      </AuthPanel>
    </AuthLayout>
  );
}
