type IconProps = {
  className?: string;
};

export function ShieldLockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 2.8 5.7 5.3v5.8c0 4.3 2.6 8.2 6.3 9.8 3.7-1.6 6.3-5.5 6.3-9.8V5.3L12 2.8Z" />
      <rect x="9.3" y="10.4" width="5.4" height="4.8" rx="1.1" />
      <path d="M10.5 10.4V9.2a1.5 1.5 0 1 1 3 0v1.2" />
    </svg>
  );
}

export function GoogleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M20.5 12.3c0-.7-.1-1.3-.2-1.9H12v3.6h4.8a4.3 4.3 0 0 1-1.8 2.8v2.3h2.9c1.7-1.6 2.6-3.9 2.6-6.8Z"
        fill="currentColor"
      />
      <path
        d="M12 21c2.4 0 4.5-.8 6-2.1l-2.9-2.3c-.8.6-1.9 1-3.1 1-2.4 0-4.4-1.6-5.1-3.8H3.9v2.4A9 9 0 0 0 12 21Z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M6.9 13.8a5.3 5.3 0 0 1 0-3.6V7.8H3.9a9 9 0 0 0 0 8.4l3-2.4Z"
        fill="currentColor"
        opacity="0.6"
      />
      <path
        d="M12 6.4c1.4 0 2.7.5 3.7 1.5l2.8-2.8A8.8 8.8 0 0 0 12 3 9 9 0 0 0 3.9 7.8l3 2.4C7.6 8 9.6 6.4 12 6.4Z"
        fill="currentColor"
        opacity="0.95"
      />
    </svg>
  );
}

export function LinkedInIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6.3 8.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />
      <path d="M4.9 9.5h2.8V19H4.9V9.5Zm4.4 0h2.7v1.3h.1c.4-.7 1.3-1.6 2.9-1.6 3 0 3.5 1.9 3.5 4.5V19h-2.8v-4.6c0-1.1 0-2.5-1.6-2.5-1.6 0-1.8 1.2-1.8 2.4V19H9.3V9.5Z" />
    </svg>
  );
}

export function GitHubIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 3.5a8.7 8.7 0 0 0-2.8 17c.4 0 .5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.3-.8-.8-1.1-.8-1.1-.7-.4 0-.4 0-.4.8 0 1.2.8 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4a3.2 3.2 0 0 1 .8-2.2c-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.3.8a7.8 7.8 0 0 1 4.2 0c1.6-1 2.3-.8 2.3-.8.5 1.1.2 2 .1 2.1a3.2 3.2 0 0 1 .8 2.2c0 3.1-1.8 3.8-3.6 4 .3.2.5.7.5 1.5v2.2c0 .2.1.4.5.4A8.7 8.7 0 0 0 12 3.5Z" />
    </svg>
  );
}

export function PersonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5.7 19a6.5 6.5 0 0 1 12.6 0" />
    </svg>
  );
}

export function EmailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M4.5 6.8h15v10.4h-15V6.8Z" />
      <path d="m5.7 8 6.3 5 6.3-5" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="6.5" y="10.5" width="11" height="8.5" rx="1.4" />
      <path d="M9 10.5V8.6a3 3 0 1 1 6 0v1.9" />
    </svg>
  );
}

export function DocumentTextIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M6.5 3.5h7.2l3.8 3.8v13.2h-11V3.5Z" />
      <path d="M13.5 3.8v3.8h3.8" />
      <path d="M9 11h6" />
      <path d="M9 14.4h6" />
      <path d="M9 17.8h3.8" />
    </svg>
  );
}

export function PlayVideoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="4" y="5.5" width="16" height="11.5" rx="1.6" />
      <path d="m10.2 8.8 4.8 2.5-4.8 2.5V8.8Z" />
      <path d="M8 20h8" />
    </svg>
  );
}

export function HybridLessonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M4.5 5.5h15v11h-15v-11Z" />
      <path d="M11.8 5.5v11" />
      <path d="m7.1 8.6 2.7 1.6-2.7 1.6V8.6Z" />
      <path d="M14 9h3" />
      <path d="M14 12.2h2.4" />
      <path d="M8 20h8" />
    </svg>
  );
}

export function ShieldKeyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 2.8 5.8 5.2v5.7c0 4.2 2.6 8 6.2 9.5 3.7-1.6 6.2-5.3 6.2-9.5V5.2L12 2.8Z" />
      <circle cx="11" cy="12" r="1.5" />
      <path d="M12.5 12h3.2m-1 0v1.4m-1.1-1.4v1" />
    </svg>
  );
}

export function ArrowBackIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="m10 6-6 6 6 6" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="10.8" cy="10.8" r="5.8" />
      <path d="m15.2 15.2 4.3 4.3" />
    </svg>
  );
}

export function FilterIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="m5 12 4.2 4.2L19 6.8" />
    </svg>
  );
}

export function BoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M13.2 2.8 5.7 13h5.6l-.8 8.2 7.8-11.5h-5.7l.6-6.9Z" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
