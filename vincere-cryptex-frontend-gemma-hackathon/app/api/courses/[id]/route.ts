import { fetchCourse } from "@/lib/courses/api-client";
import { isCourseServiceUnavailableError } from "@/lib/courses/service-unavailable";

type CourseRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: CourseRouteContext) {
  const { id } = await context.params;

  try {
    const course = await fetchCourse(id, `/api/courses/${id}`);

    if (!course) {
      return Response.json({ error: "Course not found" }, { status: 404 });
    }

    return Response.json({ course });
  } catch (error) {
    if (!isCourseServiceUnavailableError(error)) {
      throw error;
    }

    return Response.json(error.state, { status: error.status });
  }
}
