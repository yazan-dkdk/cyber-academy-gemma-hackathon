"use client";

import { useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  CatalogHeader,
  type CatalogFilters,
  type CatalogLevelFilter,
} from "@/components/courses/CatalogHeader";
import { ContinueLearningCard } from "@/components/courses/ContinueLearningCard";
import { CourseCard } from "@/components/courses/CourseCard";
import { LearningPathCard } from "@/components/courses/LearningPathCard";
import { learningPaths, recommendedCourses } from "@/lib/courses/catalog-data";
import { useStudentContinueLearning, useStudentCourses } from "@/components/courses/course-state";
import { isStudentUser } from "@/lib/auth-roles";
import type { CourseSummary } from "@/lib/courses/types";
import { cn } from "@/lib/cn";

type CourseCatalogProps = {
  courses: CourseSummary[];
};

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  accent?: "cyan" | "purple" | "pink" | "green";
  aside?: ReactNode;
};

const revealVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 28,
  },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay,
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

const accentClasses: Record<NonNullable<SectionHeadingProps["accent"]>, string> = {
  cyan: "bg-primary shadow-[0_0_16px_rgba(0,240,255,0.5)]",
  purple: "bg-secondary shadow-[0_0_16px_rgba(168,85,247,0.42)]",
  pink: "bg-tertiary shadow-[0_0_16px_rgba(255,79,216,0.42)]",
  green: "bg-[#00FF88] shadow-[0_0_16px_rgba(0,255,136,0.42)]",
};

function SectionHeading({ eyebrow, title, accent = "cyan", aside }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="font-label text-[0.7rem] uppercase text-foreground/44">{eyebrow}</p>
        ) : null}
        <div className="flex items-center gap-4">
          <span className={cn("h-8 w-1.5", accentClasses[accent])} aria-hidden="true" />
          <h2 className="font-display text-2xl font-semibold uppercase text-white sm:text-3xl">
            {title}
          </h2>
        </div>
      </div>
      {aside}
    </div>
  );
}

function RevealSection({
  children,
  className,
  delay = 0,
  id,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  id?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      id={id}
      className={className}
      custom={delay}
      variants={revealVariants}
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "visible"}
      viewport={{ once: true, margin: "-80px" }}
    >
      {children}
    </motion.section>
  );
}

function getCourseById(courses: CourseSummary[], courseId: string) {
  return courses.find((course) => course.id === courseId) ?? null;
}

export function CourseCatalog({ courses }: CourseCatalogProps) {
  const { status, user } = useAuthSession();
  const showStudentControls = status === "authenticated" && isStudentUser(user);
  const {
    courses: studentCourses,
    errorMessage: coursesErrorMessage,
    isLoading: coursesLoading,
  } = useStudentCourses(showStudentControls, courses);
  const displayCourses = showStudentControls ? studentCourses : courses;
  const {
    items: continueLearningCourses,
    errorMessage: continueLearningErrorMessage,
    isLoading: continueLearningLoading,
  } = useStudentContinueLearning(showStudentControls, displayCourses);
  const [filters, setFilters] = useState<CatalogFilters>({
    query: "",
    level: "all",
    category: "all",
  });

  const categories = useMemo(
    () => Array.from(new Set(displayCourses.map((course) => course.category))).sort(),
    [displayCourses],
  );

  const filteredCourses = useMemo(() => {
    const normalizedQuery = filters.query.trim().toLowerCase();

    return displayCourses.filter((course) => {
      const matchesQuery =
        !normalizedQuery ||
        course.title.toLowerCase().includes(normalizedQuery) ||
        course.shortDescription.toLowerCase().includes(normalizedQuery) ||
        course.category.toLowerCase().includes(normalizedQuery);
      const matchesLevel = filters.level === "all" || course.difficulty === filters.level;
      const matchesCategory = filters.category === "all" || course.category === filters.category;

      return matchesQuery && matchesLevel && matchesCategory;
    });
  }, [displayCourses, filters]);

  const recommended = useMemo(
    () =>
      recommendedCourses
        .map((recommendation) => ({
          recommendation,
          course: getCourseById(displayCourses, recommendation.courseId),
        }))
        .filter((item): item is { recommendation: typeof recommendedCourses[number]; course: CourseSummary } =>
          Boolean(item.course),
        ),
    [displayCourses],
  );

  function updateLevel(level: CatalogLevelFilter) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      level,
    }));
  }

  return (
    <div className="catalog-page relative isolate overflow-hidden px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <div className="catalog-depth" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-16 xl:gap-20">
        <CatalogHeader
          filters={filters}
          categories={categories}
          totalCourses={displayCourses.length}
          visibleCourses={filteredCourses.length}
          onQueryChange={(query) =>
            setFilters((currentFilters) => ({
              ...currentFilters,
              query,
            }))
          }
          onLevelChange={updateLevel}
          onCategoryChange={(category) =>
            setFilters((currentFilters) => ({
              ...currentFilters,
              category,
            }))
          }
        />

        {showStudentControls ? (
          <RevealSection className="space-y-7">
            <SectionHeading
              title="Continue Learning"
              accent="cyan"
              aside={
                coursesLoading || continueLearningLoading ? (
                  <span className="font-label text-[0.7rem] uppercase text-foreground/48">
                    Syncing
                  </span>
                ) : null
              }
            />
            {continueLearningCourses.length ? (
              <div className="grid gap-6 xl:grid-cols-2">
                {continueLearningCourses.map((course) => (
                  <ContinueLearningCard key={course.id} course={course} />
                ))}
              </div>
            ) : (
              <div className="catalog-empty-state px-5 py-10 text-center">
                <p className="font-display text-2xl font-semibold text-white">No active courses yet</p>
                <p className="mt-2 text-sm text-foreground/58">
                  Enroll in a course to start building your personal progress record.
                </p>
              </div>
            )}
            {continueLearningErrorMessage ? (
              <p className="text-sm text-tertiary/72">{continueLearningErrorMessage}</p>
            ) : null}
            {coursesErrorMessage ? (
              <p className="text-sm text-tertiary/72">{coursesErrorMessage}</p>
            ) : null}
          </RevealSection>
        ) : null}

        <RevealSection className="catalog-band space-y-7 p-5 sm:p-7 lg:p-8" delay={0.06}>
          <SectionHeading title="Recommended Courses" accent="pink" />
          <div className="grid gap-6 md:grid-cols-3">
            {recommended.map(({ course, recommendation }) => (
              <CourseCard
                key={course.id}
                course={course}
                reason={recommendation.reason}
                compact
                showStudentControls={showStudentControls}
              />
            ))}
          </div>
        </RevealSection>

        <RevealSection className="space-y-7" delay={0.12}>
          <SectionHeading
            eyebrow="Career Architectures"
            title="Learning Paths"
            accent="purple"
          />
          <div className="grid gap-6 lg:grid-cols-2">
            {learningPaths.map((path) => (
              <LearningPathCard key={path.id} path={path} />
            ))}
          </div>
        </RevealSection>

        <RevealSection id="all-courses" className="space-y-7" delay={0.18}>
          <SectionHeading
            eyebrow="Global Intel Database"
            title="All Courses Grid"
            accent="green"
            aside={
              <span className="font-label text-[0.7rem] uppercase text-foreground/48">
                {filteredCourses.length} Visible
              </span>
            }
          />

          {filteredCourses.length ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {filteredCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  showStudentControls={showStudentControls}
                />
              ))}
            </div>
          ) : (
            <div className="catalog-empty-state px-5 py-10 text-center">
              <p className="font-display text-2xl font-semibold text-white">No courses found</p>
              <p className="mt-2 text-sm text-foreground/58">Adjust the catalog query or filters.</p>
            </div>
          )}
        </RevealSection>
      </div>
    </div>
  );
}
