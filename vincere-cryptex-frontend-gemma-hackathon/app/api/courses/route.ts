import { fetchCourseCatalog } from "@/lib/courses/api-client";

export async function GET() {
  const courses = await fetchCourseCatalog("/api/courses");

  return Response.json({ courses });
}
