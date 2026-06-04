import { fetchCourse } from "@/lib/courses/api-client";

type CourseRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: CourseRouteContext) {
  const { id } = await context.params;
  const course = await fetchCourse(id, `/api/courses/${id}`);

  if (!course) {
    return Response.json({ error: "Course not found" }, { status: 404 });
  }

  return Response.json({ course });
}
