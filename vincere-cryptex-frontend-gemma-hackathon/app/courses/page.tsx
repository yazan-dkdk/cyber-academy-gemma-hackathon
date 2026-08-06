import type { Metadata } from "next";
import { CourseCatalog } from "@/components/courses/CourseCatalog";
import { ServiceUnavailable } from "@/components/courses/ServiceUnavailable";
import { fetchCourseCatalog } from "@/lib/courses/api-client";
import { isCourseServiceUnavailableError } from "@/lib/courses/service-unavailable";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse the Vincere Cryptex training catalog.",
};

async function loadCourseCatalog() {
  try {
    const courses = await fetchCourseCatalog();

    return { courses, serviceError: null };
  } catch (error) {
    if (isCourseServiceUnavailableError(error)) {
      return { courses: null, serviceError: error.state };
    }

    throw error;
  }
}

export default async function CoursesPage() {
  const { courses, serviceError } = await loadCourseCatalog();

  if (serviceError) {
    return <ServiceUnavailable serviceError={serviceError} />;
  }

  return <CourseCatalog courses={courses} />;
}
