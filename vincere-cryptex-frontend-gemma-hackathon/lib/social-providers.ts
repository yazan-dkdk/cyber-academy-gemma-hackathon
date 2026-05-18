export type SocialProviderId = "google" | "linkedin" | "github";

export type SocialProvider = {
  id: SocialProviderId;
  label: string;
};

// Presentational only. Real OAuth routing will be backend-driven via NestJS, and the backend
// will enforce role restrictions such as excluding admins from social sign-in.
export const SOCIAL_PROVIDERS: SocialProvider[] = [
  { id: "google", label: "Continue with Google" },
  { id: "linkedin", label: "Continue with LinkedIn" },
  { id: "github", label: "Continue with GitHub" },
];
