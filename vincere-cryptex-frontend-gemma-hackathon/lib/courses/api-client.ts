import { getMockCourseById, getMockCourseCatalog } from "@/lib/courses/mock-api";

export async function fetchCourseCatalogFromMockApi() {
  return getMockCourseCatalog();
}

export async function fetchCourseFromMockApi(id: string) {
  return getMockCourseById(id);
}
