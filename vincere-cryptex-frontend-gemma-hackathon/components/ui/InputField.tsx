import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AccentTone } from "@/components/ui/GlowCard";

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  tone?: AccentTone;
  label: string;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  wrapperClassName?: string;
};

export function InputField({
  tone = "cyan",
  label,
  icon,
  iconPosition = "start",
  className,
  wrapperClassName,
  ...props
}: InputFieldProps) {
  const hasLeadingIcon = Boolean(icon) && iconPosition === "start";
  const hasTrailingIcon = Boolean(icon) && iconPosition === "end";

  return (
    <label data-tone={tone} className={cn("field-group block space-y-2", wrapperClassName)}>
      <span className="field-label">{label}</span>
      <span className="input-shell">
        {icon ? (
          <span className={cn("input-icon", hasTrailingIcon && "input-icon--end")}>{icon}</span>
        ) : null}
        <input
          {...props}
          className={cn(
            "field-input",
            hasLeadingIcon && "field-input--with-leading",
            hasTrailingIcon && "field-input--with-trailing",
            className,
          )}
        />
      </span>
    </label>
  );
}
