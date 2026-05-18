import {
  DocumentTextIcon,
  HybridLessonIcon,
  PlayVideoIcon,
  ShieldLockIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { LessonType } from "@/lib/courses/types";

type LessonTypeBadgeProps = {
  type: LessonType;
  compact?: boolean;
  prominent?: boolean;
  showProtectedIndicator?: boolean;
  protectedLabel?: string;
  className?: string;
};

const lessonTypeConfig = {
  TEXT: {
    label: "TEXT",
    Icon: DocumentTextIcon,
  },
  VIDEO: {
    label: "VIDEO",
    Icon: PlayVideoIcon,
  },
  HYBRID: {
    label: "HYBRID",
    Icon: HybridLessonIcon,
  },
} satisfies Record<LessonType, { label: string; Icon: typeof DocumentTextIcon }>;

export function LessonTypeBadge({
  type,
  compact = false,
  prominent = false,
  showProtectedIndicator = type === "VIDEO" || type === "HYBRID",
  protectedLabel = "Protected Media",
  className,
}: LessonTypeBadgeProps) {
  const { Icon, label } = lessonTypeConfig[type];

  return (
    <span
      className={cn(
        "lesson-type-cluster",
        compact ? "lesson-type-cluster--compact" : "",
        prominent ? "lesson-type-cluster--prominent" : "",
        className,
      )}
    >
      <span
        data-lesson-type={type}
        className={cn(
          "lesson-type-pill",
          compact ? "lesson-type-pill--compact" : "",
          prominent ? "lesson-type-pill--prominent" : "",
        )}
      >
        <Icon className={cn(prominent ? "h-5 w-5" : "h-4 w-4")} />
        <span>{label}</span>
      </span>
      {showProtectedIndicator ? (
        <span
          className={cn(
            "lesson-protected-badge",
            compact ? "lesson-protected-badge--compact" : "",
            prominent ? "lesson-protected-badge--prominent" : "",
          )}
        >
          <ShieldLockIcon className={cn(prominent ? "h-4 w-4" : "h-3.5 w-3.5")} />
          <span>{protectedLabel}</span>
        </span>
      ) : null}
    </span>
  );
}
