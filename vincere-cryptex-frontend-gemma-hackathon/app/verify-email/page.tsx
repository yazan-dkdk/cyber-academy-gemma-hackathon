import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { VerifyEmailStatus } from "@/components/auth/VerifyEmailStatus";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Verify your Vincere Cryptex account email.",
};

export default function VerifyEmailPage() {
  return (
    <AuthLayout
      tone="cyan"
      backgroundImage="/images/stitch/forgot-bg.webp"
      centered
    >
      <AuthPanel
        tone="cyan"
        title="Verify Email"
        description="Complete email verification before signing in to your training console."
        descriptionStyle="body"
        metadata={
          <div className="mt-8 flex justify-between border-t border-outline-variant/10 pt-4 font-label text-[0.56rem] uppercase tracking-[0.28em] text-foreground/28">
            <span>Verification: Link</span>
            <span>Status: Active</span>
          </div>
        }
      >
        <VerifyEmailStatus />
      </AuthPanel>
    </AuthLayout>
  );
}
