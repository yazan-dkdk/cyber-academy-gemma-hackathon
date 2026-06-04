import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseDetailPanel } from "@/components/courses/CourseDetailPanel";
import { fetchCourse } from "@/lib/courses/api-client";

type CoursePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { id } = await params;
  const course = await fetchCourse(id);

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
  const course = await fetchCourse(id);

  if (!course) {
    notFound();
  }

  return <CourseDetailPanel course={course} />;
}
