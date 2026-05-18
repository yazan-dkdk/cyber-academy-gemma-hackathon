import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset access to your Vincere Cryptex account.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      tone="cyan"
      backgroundImage="/images/stitch/forgot-bg.webp"
      centered
    >
      <AuthPanel
        tone="cyan"
        title="Reset Your Password"
        description="Enter your email address to receive a secure recovery link."
        descriptionStyle="body"
        metadata={
          <div className="mt-8 flex justify-between border-t border-outline-variant/10 pt-4 font-label text-[0.56rem] uppercase tracking-[0.28em] text-foreground/28">
            <span>Auth_Node: 0x24F</span>
            <span>Encryption: AES-256</span>
          </div>
        }
      >
        <ForgotPasswordForm />
      </AuthPanel>
    </AuthLayout>
  );
}
