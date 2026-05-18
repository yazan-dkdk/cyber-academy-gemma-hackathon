import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AccentTone } from "@/components/ui/GlowCard";

type SocialButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: AccentTone;
  icon: ReactNode;
  label: string;
};

export function SocialButton({
  tone = "purple",
  icon,
  label,
  className,
  ...props
}: SocialButtonProps) {
  return (
    <button {...props} data-tone={tone} className={cn("social-button", className)}>
      <span className="social-button__icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
