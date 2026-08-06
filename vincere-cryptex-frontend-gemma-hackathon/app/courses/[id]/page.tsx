import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseDetailPanel } from "@/components/courses/CourseDetailPanel";
import { ServiceUnavailable } from "@/components/courses/ServiceUnavailable";
import { fetchCourse } from "@/lib/courses/api-client";
import { isCourseServiceUnavailableError } from "@/lib/courses/service-unavailable";

type CoursePageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function loadCourse(id: string) {
  try {
    const course = await fetchCourse(id);

    return { course, serviceError: null };
  } catch (error) {
    if (isCourseServiceUnavailableError(error)) {
      return { course: null, serviceError: error.state };
    }

    throw error;
  }
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { id } = await params;
  const { course, serviceError } = await loadCourse(id);

  if (serviceError) {
    return {
      title: "Service Temporarily Unavailable",
    };
  }

  if (!course) {
    return {
      title: "Course Not Found",
    };
  }

  return {
    title: course.title,
    description: course.shortDescription,
  };
}

export default async function CourseDetailsPage({ params }: CoursePageProps) {
  const { id } = await params;
  const { course, serviceError } = await loadCourse(id);

  if (serviceError) {
    return <ServiceUnavailable serviceError={serviceError} />;
  }

  if (!course) {
    notFound();
  }

  return <CourseDetailPanel course={course} />;
}
