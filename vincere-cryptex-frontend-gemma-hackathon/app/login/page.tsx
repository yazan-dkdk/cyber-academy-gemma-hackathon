import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { LoginForm } from "@/components/auth/LoginForm";
import { VisualPanel } from "@/components/auth/VisualPanel";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to the Vincere Cryptex frontend.",
};

export default function LoginPage() {
  return (
    <AuthLayout
      tone="purple"
      visual={
        <VisualPanel
          tone="purple"
          imageSrc="/images/stitch/login-cryptex.webp"
          imageAlt="A futuristic metallic cryptex cylinder illuminated with neon cyan and violet glyphs."
          accentVariant="bar"
          imageClassName="object-contain mix-blend-lighten opacity-[0.78]"
          title={
            <>
              <span className="block text-white [text-shadow:0_0_18px_rgba(168,85,247,0.56)]">
                Unlock the
              </span>
              <span className="block text-primary [text-shadow:0_0_30px_rgba(0,240,255,0.72)]">
                Vincere Cryptex
              </span>
            </>
          }
          description="Access the elite cyber-warfare training environment. Real-world labs, high-stakes challenges, and global leaderboard dominance."
        />
      }
    >
      <AuthPanel
        tone="purple"
        title="Sign in to Vincere Cryptex"
        description="Authentication protocol v4.0"
        descriptionStyle="label"
      >
        <LoginForm />
      </AuthPanel>
    </AuthLayout>
  );
}
