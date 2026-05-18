import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { VisualPanel } from "@/components/auth/VisualPanel";

export const metadata: Metadata = {
  title: "Register",
  description: "Create a Vincere Cryptex account.",
};

export default function RegisterPage() {
  return (
    <AuthLayout
      tone="pink"
      decorations={
        <>
          <div className="pointer-events-none absolute left-10 top-10 hidden h-14 w-14 border-l-2 border-t-2 border-tertiary/55 shadow-[0_0_18px_rgba(255,79,216,0.34)] md:block" />
          <div className="pointer-events-none absolute bottom-14 left-[43%] hidden h-16 w-16 border-b-2 border-r-2 border-tertiary/55 shadow-[0_0_20px_rgba(255,79,216,0.34)] lg:block" />
        </>
      }
      visual={
        <VisualPanel
          tone="pink"
          imageSrc="/images/stitch/register-visual.webp"
          imageAlt="A cinematic cyber-security visual featuring a glowing keyhole within a tactical interface."
          accentVariant="frame"
          imageClassName="object-cover brightness-[0.6] saturate-[0.9]"
          title={<span className="block text-white">Vincere Cryptex</span>}
          description="Join the next generation of tactical cryptographers. Access high-fidelity labs, elite challenges, and master the digital void."
        />
      }
    >
      <AuthPanel
        tone="pink"
        eyebrow="Initialization Sequence"
        title="Create Your Account"
        metadata={
          <div className="mt-8 flex justify-center gap-6 font-label text-[0.62rem] uppercase tracking-[0.34em] text-foreground/28">
            <span>Protocol: V-2.4</span>
            <span>Secure Node: 0x82A</span>
          </div>
        }
      >
        <RegisterForm />
      </AuthPanel>
    </AuthLayout>
  );
}
