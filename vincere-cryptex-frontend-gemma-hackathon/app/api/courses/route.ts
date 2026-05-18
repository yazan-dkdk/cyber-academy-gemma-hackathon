import { getMockCourseCatalog } from "@/lib/courses/mock-api";

export async function GET() {
  const courses = await getMockCourseCatalog();

  return Response.json({ courses });
}
