import type { AuthUser } from "@/lib/auth-client";

export function isStudentUser(user: AuthUser | null | undefined) {
  return user?.role.trim().toLowerCase() === "student";
}

function normalizeDisplayName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");

  return normalized.length > 0 ? normalized : null;
}

export function getStudentDisplayName(user: AuthUser | null | undefined) {
  if (!user) {
    return "Student";
  }

  const userRecord = user as AuthUser & {
    fullName?: unknown;
    name?: unknown;
  };
  const profileName = normalizeDisplayName(userRecord.name) ?? normalizeDisplayName(userRecord.fullName);

  if (profileName) {
    return profileName;
  }

  const emailLocalPart = normalizeDisplayName(user.email.split("@")[0]);

  return emailLocalPart ?? "Student";
}
