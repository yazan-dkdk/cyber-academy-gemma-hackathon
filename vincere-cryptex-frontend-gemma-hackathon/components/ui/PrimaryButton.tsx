import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AccentTone } from "@/components/ui/GlowCard";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: AccentTone;
  loading?: boolean;
  children: ReactNode;
};

export function PrimaryButton({
  tone = "cyan",
  loading = false,
  children,
  className,
  disabled,
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      {...props}
      data-tone={tone}
      disabled={disabled || loading}
      className={cn("primary-button", className)}
    >
      <span className="primary-button__sweep" />
      {loading ? <span className="loading-dot" aria-hidden="true" /> : null}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
