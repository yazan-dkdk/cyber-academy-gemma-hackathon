import type { Metadata } from "next";
import { CourseCatalog } from "@/components/courses/CourseCatalog";
import { fetchCourseCatalogFromMockApi } from "@/lib/courses/api-client";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse the Vincere Cryptex training catalog.",
};

export default async function CoursesPage() {
  const courses = await fetchCourseCatalogFromMockApi();

  return <CourseCatalog courses={courses} />;
}
