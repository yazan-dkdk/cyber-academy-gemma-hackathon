import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPagePanel } from "@/components/courses/LessonPagePanel";
import { fetchCourseFromMockApi } from "@/lib/courses/api-client";
import { findLessonReference } from "@/lib/courses/structure";

type LessonPageProps = {
  params: Promise<{
    id: string;
    lessonId: string;
  }>;
};

export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const { id, lessonId } = await params;
  const course = await fetchCourseFromMockApi(id);
  const reference = course ? findLessonReference(course, lessonId) : null;

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
  const course = await fetchCourseFromMockApi(id);
  const reference = course ? findLessonReference(course, lessonId) : null;

  if (!course || !reference) {
    notFound();
  }

  return <LessonPagePanel course={course} lessonId={lessonId} />;
}
