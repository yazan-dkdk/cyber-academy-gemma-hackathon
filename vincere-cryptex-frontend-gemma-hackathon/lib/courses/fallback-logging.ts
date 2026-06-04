export function logCourseBackendFallback(route: string, reason: string) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.warn("[COURSE_BACKEND_FALLBACK_USED]", {
    route,
    reason,
  });
}
