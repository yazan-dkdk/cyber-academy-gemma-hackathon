import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPagePanel } from "@/components/courses/LessonPagePanel";
import { ServiceUnavailable } from "@/components/courses/ServiceUnavailable";
import { fetchCourse } from "@/lib/courses/api-client";
import { isCourseServiceUnavailableError } from "@/lib/courses/service-unavailable";
import { findLessonReference } from "@/lib/courses/structure";

type LessonPageProps = {
  params: Promise<{
    id: string;
    lessonId: string;
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

export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const { id, lessonId } = await params;
  const { course, serviceError } = await loadCourse(id);
  const reference = course ? findLessonReference(course, lessonId) : null;

  if (serviceError) {
    return {
      title: "Service Temporarily Unavailable",
    };
  }

  if (!course || !reference) {
    return {
      title: "Lesson Not Found",
    };
  }

  return {
    title: reference.lesson.title,
    description: reference.lesson.summary,
  };
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { id, lessonId } = await params;
  const { course, serviceError } = await loadCourse(id);
  const reference = course ? findLessonReference(course, lessonId) : null;

  if (serviceError) {
    return <ServiceUnavailable serviceError={serviceError} />;
  }

  if (!course || !reference) {
    notFound();
  }

  return <LessonPagePanel course={course} lessonId={lessonId} />;
}
