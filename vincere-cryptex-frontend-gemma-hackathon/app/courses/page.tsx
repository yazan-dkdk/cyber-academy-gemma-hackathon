import type { Metadata } from "next";
import { CourseCatalog } from "@/components/courses/CourseCatalog";
import { fetchCourseCatalog } from "@/lib/courses/api-client";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse the Vincere Cryptex training catalog.",
};

export default async function CoursesPage() {
  const courses = await fetchCourseCatalog();

  return <CourseCatalog courses={courses} />;
}
