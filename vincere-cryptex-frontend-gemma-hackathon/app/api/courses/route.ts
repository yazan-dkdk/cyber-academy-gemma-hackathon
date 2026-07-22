import { fetchCourseCatalog } from "@/lib/courses/api-client";
import { isCourseServiceUnavailableError } from "@/lib/courses/service-unavailable";

export async function GET() {
  try {
    const courses = await fetchCourseCatalog("/api/courses");

    return Response.json({ courses });
  } catch (error) {
    if (!isCourseServiceUnavailableError(error)) {
      throw error;
    }

    return Response.json(error.state, { status: error.status });
  }
}
