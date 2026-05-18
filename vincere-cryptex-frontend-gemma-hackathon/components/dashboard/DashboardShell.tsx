"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { AiTutorCore3D } from "@/components/dashboard/AiTutorCore3D";
import { DashboardThreeScene } from "@/components/dashboard/DashboardThreeScene";
import { GlowCard } from "@/components/ui/GlowCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import {
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  LockIcon,
  PersonIcon,
  ShieldKeyIcon,
  ShieldLockIcon,
} from "@/components/ui/icons";
import { getStudentDisplayName, isStudentUser } from "@/lib/auth-roles";
import { mockCourses } from "@/lib/courses/mock-data";
import { toCourseSummary } from "@/lib/courses/mock-api";
import { getOrderedLessonReferences } from "@/lib/courses/structure";
import { getCourseImagePath } from "@/lib/courses/course-images";
import { getCourseRouteId, normalizeCourseRouteId } from "@/lib/courses/routing";
import {
  buildCourseProgress,
  getSafeEnrollmentLessonHref,
  useStudentActivity,
  useStudentContinueLearning,
  useStudentCourses,
  useStudentDashboard,
  type ContinueLearningItem,
  type StudentAchievementItem,
} from "@/components/courses/course-state";
import type { CourseSummary } from "@/lib/courses/types";

type DashboardTone = "cyan" | "purple" | "pink" | "neutral";
type RoadmapState = "completed" | "current" | "next" | "locked";

const maxVisibleActivityItems = 6;

const toneTextClasses: Record<DashboardTone, string> = {
  cyan: "text-primary",
  purple: "text-secondary",
  pink: "text-tertiary",
  neutral: "text-foreground/70",
};

const toneBadgeClasses: Record<DashboardTone, string> = {
  cyan: "border-primary/24 bg-primary/10 text-primary",
  purple: "border-secondary/24 bg-secondary/10 text-secondary",
  pink: "border-tertiary/24 bg-tertiary/10 text-tertiary",
  neutral: "border-white/10 bg-white/[0.03] text-foreground/64",
};

const roadmapStateClasses: Record<RoadmapState, string> = {
  completed: "border-primary/50 bg-primary/12 text-primary shadow-[0_0_22px_rgba(0,240,255,0.18)]",
  current: "dashboard-roadmap-node--current border-primary bg-surface-lowest text-primary",
  next: "border-secondary/46 bg-secondary/10 text-secondary",
  locked: "border-white/12 bg-white/[0.025] text-foreground/38",
};

function formatMinutes(minutes: number) {
  if (minutes <= 0) {
    return "0 min";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatActivityTime(value: string | null) {
  if (!value) {
    return "Recent";
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Recent";
  }

  const now = Date.now();
  const elapsedDays = Math.floor((now - timestamp) / 86_400_000);

  if (elapsedDays <= 0) {
    return "Today";
  }

  if (elapsedDays === 1) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
}

function getPublicCourseById(courseId: string) {
  const routeId = normalizeCourseRouteId(courseId);
  return mockCourses.find((course) => normalizeCourseRouteId(course.slug ?? course.id) === routeId) ?? null;
}

function getContinueLesson(course: CourseSummary | ContinueLearningItem | null) {
  if (!course) {
    return null;
  }

  const progress = buildCourseProgress(course.id, course.lessonIds, course);
  const lessonId = progress.currentLessonId ?? progress.nextLessonId;
  const publicCourse = getPublicCourseById(course.id);

  if (!publicCourse || !lessonId) {
    return null;
  }

  return getOrderedLessonReferences(publicCourse).find((reference) => reference.lesson.id === lessonId) ?? null;
}

function buildSkillMatrix(courses: CourseSummary[]) {
  const skillDefinitions = [
    { label: "Network Defense", tone: "cyan" as const, matches: ["network", "defense"] },
    { label: "Web Security", tone: "purple" as const, matches: ["web", "application"] },
    { label: "Phishing Analysis", tone: "pink" as const, matches: ["phishing"] },
    { label: "Incident Response", tone: "neutral" as const, matches: ["incident", "response"] },
    { label: "Threat Hunting", tone: "cyan" as const, matches: ["threat", "hunting"] },
  ];

  return skillDefinitions.map((skill) => {
    const matchingCourses = courses.filter((course) => {
      const searchable = `${course.title} ${course.category}`.toLowerCase();
      return skill.matches.some((match) => searchable.includes(match));
    });
    const progressValues = matchingCourses.map((course) =>
      buildCourseProgress(course.id, course.lessonIds, course).progressPercent,
    );
    const value = progressValues.length
      ? Math.round(progressValues.reduce((total, progress) => total + progress, 0) / progressValues.length)
      : 0;

    return {
      label: skill.label,
      value,
      tone: skill.tone,
    };
  });
}

function buildRoadmapItems(course: CourseSummary | ContinueLearningItem | null) {
  const publicCourse = course ? getPublicCourseById(course.id) : mockCourses[0] ?? null;
  const lessonReferences = publicCourse ? getOrderedLessonReferences(publicCourse).slice(0, 5) : [];
  const progress = course ? buildCourseProgress(course.id, course.lessonIds, course) : null;
  const currentLessonId = progress?.currentLessonId ?? progress?.nextLessonId ?? lessonReferences[0]?.lesson.id ?? null;

  if (!lessonReferences.length) {
    return [];
  }

  return lessonReferences.map((reference, index) => {
    const lessonState = progress?.lessonStates.find((state) => state.lessonId === reference.lesson.id);

    if (lessonState?.isCompleted) {
      return { label: reference.lesson.title, status: "Completed", state: "completed" as const };
    }

    if (progress?.isEnrolled && reference.lesson.id === currentLessonId) {
      return { label: reference.lesson.title, status: "Current", state: "current" as const };
    }

    if (!progress?.isEnrolled && index === 0) {
      return { label: reference.lesson.title, status: "Start", state: "next" as const };
    }

    const isLocked = lessonState?.isLocked ?? index > 0;

    return {
      label: reference.lesson.title,
      status: isLocked ? "Locked" : "Next",
      state: (isLocked ? "locked" : "next") as RoadmapState,
    };
  });
}

function getActivityIcon(tone: DashboardTone) {
  if (tone === "cyan") {
    return CheckIcon;
  }

  if (tone === "purple") {
    return ShieldLockIcon;
  }

  if (tone === "pink") {
    return BoltIcon;
  }

  return ShieldKeyIcon;
}

function getAchievementIcon(achievement: StudentAchievementItem) {
  if (!achievement.isEarned) {
    return LockIcon;
  }

  if (achievement.tone === "cyan") {
    return CheckIcon;
  }

  if (achievement.tone === "pink") {
    return BoltIcon;
  }

  return ShieldKeyIcon;
}

export function DashboardShell() {
  const router = useRouter();
  const { errorMessage, refreshSession, session, status, user } = useAuthSession();
  const isStudent = status === "authenticated" && isStudentUser(user);
  const displayName = getStudentDisplayName(user);
  const publicCourses = useMemo(() => mockCourses.map(toCourseSummary), []);
  const {
    dashboard,
    errorMessage: dashboardErrorMessage,
    isLoading: dashboardLoading,
  } = useStudentDashboard(isStudent, publicCourses);
  const {
    courses,
    errorMessage: coursesErrorMessage,
    isLoading: coursesLoading,
  } = useStudentCourses(isStudent, publicCourses);
  const dashboardCourseItems = dashboard?.enrolledCourseItems.length
    ? dashboard.enrolledCourseItems
    : courses;
  const {
    items: continueLearningItems,
    errorMessage: continueLearningErrorMessage,
    isLoading: continueLearningLoading,
  } = useStudentContinueLearning(isStudent, dashboardCourseItems);
  const {
    activity: fallbackActivity,
    errorMessage: fallbackActivityErrorMessage,
    isLoading: fallbackActivityLoading,
  } = useStudentActivity(isStudent && !dashboard && Boolean(dashboardErrorMessage));
  const activity = dashboard?.activity ?? fallbackActivity;
  const activityErrorMessage = dashboardErrorMessage ?? fallbackActivityErrorMessage;
  const activityLoading = dashboardLoading || fallbackActivityLoading;
  const visibleActivity = activity.slice(0, maxVisibleActivityItems);
  const hiddenActivityCount = Math.max(0, activity.length - visibleActivity.length);
  const courseProgressItems = useMemo(
    () =>
      dashboardCourseItems.map((course) => ({
        course,
        progress: buildCourseProgress(course.id, course.lessonIds, course),
      })),
    [dashboardCourseItems],
  );
  const enrolledCourseItems = useMemo(
    () => courseProgressItems.filter((item) => item.progress.isEnrolled),
    [courseProgressItems],
  );
  const fallbackCompletedLessons = enrolledCourseItems.reduce(
    (total, item) => total + item.progress.completedCount,
    0,
  );
  const fallbackTotalEnrolledLessons = enrolledCourseItems.reduce(
    (total, item) => total + item.progress.totalLessons,
    0,
  );
  const fallbackAverageProgress = enrolledCourseItems.length
    ? Math.round(
        enrolledCourseItems.reduce((total, item) => total + item.progress.progressPercent, 0) /
          enrolledCourseItems.length,
      )
    : 0;
  const completedLessons = dashboard?.completedLessons ?? fallbackCompletedLessons;
  const totalEnrolledLessons = dashboard?.totalLessons ?? fallbackTotalEnrolledLessons;
  const averageProgress = dashboard?.averageProgress ?? fallbackAverageProgress;
  const enrolledCoursesCount = dashboard?.enrolledCourses ?? enrolledCourseItems.length;
  const activeContinueCourse =
    continueLearningItems.find(
      (course) => !buildCourseProgress(course.id, course.lessonIds, course).isCompleted,
    ) ??
    enrolledCourseItems.find((item) => !item.progress.isCompleted)?.course ??
    null;
  const primaryContinueCourse =
    activeContinueCourse ??
    continueLearningItems[0] ??
    enrolledCourseItems[0]?.course ??
    null;
  const primaryContinueProgress = primaryContinueCourse
    ? buildCourseProgress(primaryContinueCourse.id, primaryContinueCourse.lessonIds, primaryContinueCourse)
    : null;
  const primaryContinueIsCompleted = Boolean(primaryContinueProgress?.isCompleted);
  const primaryContinueLesson = getContinueLesson(primaryContinueCourse);
  const primaryContinueLessonId =
    primaryContinueIsCompleted
      ? null
      : primaryContinueProgress?.nextLessonId ?? primaryContinueProgress?.currentLessonId ?? null;
  const continueHref =
    primaryContinueCourse && primaryContinueLessonId
      ? getSafeEnrollmentLessonHref(
          getCourseRouteId(primaryContinueCourse),
          null,
          primaryContinueLessonId,
          primaryContinueCourse.lessonIds,
          primaryContinueCourse,
        ) ?? `/courses/${getCourseRouteId(primaryContinueCourse)}`
      : primaryContinueCourse
        ? `/courses/${getCourseRouteId(primaryContinueCourse)}`
        : "/courses";
  const tutorHref = primaryContinueCourse ? continueHref : "/courses";
  const continueLearningCourseFields = primaryContinueCourse as Partial<ContinueLearningItem> | null;
  const currentLessonTitle: string = primaryContinueIsCompleted
    ? "Course completed"
    : primaryContinueCourse
      ? primaryContinueLesson?.lesson.title ??
        continueLearningCourseFields?.currentLessonTitle ??
        "Course Overview"
      : primaryContinueLesson?.lesson.title ?? "Course Overview";
  const currentLessonSummary: string = primaryContinueIsCompleted
    ? "All backend-tracked lessons for this course are complete. Review the course or choose another path when you are ready."
    : primaryContinueCourse
      ? primaryContinueLesson?.lesson.summary ??
        continueLearningCourseFields?.currentLessonSummary ??
        primaryContinueCourse.shortDescription
      : primaryContinueLesson?.lesson.summary ?? "";
  const minutesRemaining = primaryContinueCourse
    ? Math.max(
        0,
        primaryContinueIsCompleted
          ? 0
          : primaryContinueCourse.durationMinutes -
            Math.round((primaryContinueCourse.durationMinutes * (primaryContinueProgress?.progressPercent ?? 0)) / 100),
      )
    : 0;
  const overviewStats = [
    {
      label: "Enrolled Courses",
      value: `${enrolledCoursesCount}`,
      tone: "cyan" as const,
    },
    {
      label: "Average Progress",
      value: `${averageProgress}%`,
      tone: "purple" as const,
    },
    {
      label: "Completed Lessons",
      value: `${completedLessons}/${totalEnrolledLessons || 0}`,
      tone: "pink" as const,
    },
    {
      label: "Activity Feed",
      value: activity.length ? `${visibleActivity.length}/${activity.length} shown` : "No activity",
      tone: "neutral" as const,
    },
  ];
  const skillMatrix = useMemo(() => buildSkillMatrix(dashboardCourseItems), [dashboardCourseItems]);
  const roadmapItems = useMemo(() => buildRoadmapItems(primaryContinueCourse), [primaryContinueCourse]);
  const earnedAchievements = dashboard?.achievements.filter((achievement) => achievement.isEarned) ?? [];
  const lockedAchievements = dashboard?.achievements.filter((achievement) => !achievement.isEarned) ?? [];
  const nextBadge = dashboard?.nextBadge ?? null;
  const activeChallenge = dashboard?.activeChallenge ?? null;
  const activeChallengeStatus = activeChallenge?.status?.toLowerCase() ?? "";
  const activeChallengeSolved = activeChallengeStatus.includes("solved") || Boolean(activeChallenge?.solvedAt);
  const activeChallengeAttempted = !activeChallengeSolved && activeChallengeStatus.includes("attempt");
  const hasStudentProgress = enrolledCourseItems.length > 0 || completedLessons > 0 || activity.length > 0;

  useEffect(() => {
    router.prefetch("/login");

    if (status === "unauthenticated") {
      startTransition(() => {
        router.replace("/login");
      });
    }
  }, [router, status]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <GlowCard tone="cyan" className="w-full max-w-xl px-8 py-10 text-center">
          <p className="font-label text-[0.72rem] uppercase text-primary/72">Session Check</p>
          <h1 className="mt-4 font-display text-4xl font-bold text-white">
            Preparing your dashboard...
          </h1>
        </GlowCard>
      </section>
    );
  }

  if (status === "error" || !user || !session) {
    return (
      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <GlowCard tone="pink" className="w-full max-w-xl px-8 py-10 text-center">
          <p className="font-label text-[0.72rem] uppercase text-tertiary/72">Session Check</p>
          <h1 className="mt-4 font-display text-4xl font-bold text-white">
            We could not load your dashboard
          </h1>
          <p className="mt-4 text-sm leading-7 text-foreground/68">
            {errorMessage ?? "Unable to confirm the current session."}
          </p>
          <div className="mt-8">
            <PrimaryButton tone="pink" type="button" onClick={() => void refreshSession()}>
              Retry Session Check
            </PrimaryButton>
          </div>
        </GlowCard>
      </section>
    );
  }

  if (!isStudent) {
    return (
      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <GlowCard tone="pink" className="w-full max-w-xl px-8 py-10 text-center">
          <p className="font-label text-[0.72rem] uppercase text-tertiary/72">Protected Access</p>
          <h1 className="mt-4 font-display text-4xl font-bold text-white">
            Student dashboard access required
          </h1>
          <p className="mt-4 text-sm leading-7 text-foreground/68">
            This frontend check keeps the dashboard UX student-only. Backend RBAC remains
            authoritative for real authorization.
          </p>
          <div className="mt-8">
            <Link href="/courses" className="nav-action nav-action--primary">
              View Public Courses
            </Link>
          </div>
        </GlowCard>
      </section>
    );
  }

  return (
    <section className="dashboard-stage dashboard-3d-space dashboard-scan-energy relative flex flex-1 overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="dashboard-bg-glow pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_15%_10%,rgba(0,240,255,0.15),transparent_30%),radial-gradient(circle_at_80%_18%,rgba(168,85,247,0.14),transparent_32%)]" />
      <div className="dashboard-bg-grid pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.025)_1px,transparent_1px)] bg-[size:32px_32px] opacity-50" />
      <div className="dashboard-bg-orb dashboard-bg-orb--cyan" aria-hidden="true" />
      <div className="dashboard-bg-orb dashboard-bg-orb--purple" aria-hidden="true" />
      <div className="dashboard-bg-orb dashboard-bg-orb--blue" aria-hidden="true" />
      <DashboardThreeScene />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 lg:gap-7">
        <GlowCard
          tone="cyan"
          className="dashboard-card-hover dashboard-card-3d dashboard-premium-card dashboard-hero-card px-6 py-7 sm:px-8 lg:px-10"
        >
          <div className="relative z-10 flex flex-col gap-7">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="border border-primary/24 bg-primary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-primary">
                    Student Dashboard
                  </span>
                  <span className="border border-white/10 bg-white/[0.03] px-3 py-1 font-label text-[0.68rem] uppercase text-foreground/54">
                    Daily Training Overview
                  </span>
                </div>
                <h1 className="mt-5 font-display text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                  Welcome back, {displayName}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-8 text-foreground/72 sm:text-lg">
                  Continue your cybersecurity path and improve your defensive skills today.
                </p>
              </div>

              <div className="dashboard-profile-plate w-full border border-secondary/20 bg-[#0b0e16]/72 p-4 shadow-[0_0_34px_rgba(168,85,247,0.1)] lg:w-[22rem]">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-secondary/30 bg-secondary/10 text-secondary">
                    <PersonIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{user.email}</p>
                    <p className="mt-1 font-label text-[0.62rem] uppercase text-foreground/44">
                      Role: Student
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-4 text-sm">
                  <div>
                    <p className="font-label text-[0.58rem] uppercase text-foreground/38">Path</p>
                    <p className="mt-1 text-primary">
                      {primaryContinueCourse ? primaryContinueCourse.category : "Not started"}
                    </p>
                  </div>
                  <div>
                    <p className="font-label text-[0.58rem] uppercase text-foreground/38">Status</p>
                    <p className="mt-1 text-primary">
                      {hasStudentProgress ? "Active" : "Ready"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 border-t border-white/8 pt-6 sm:grid-cols-2 lg:grid-cols-4">
              {overviewStats.map((stat) => (
                <div
                  key={stat.label}
                  className="dashboard-hero-stat border border-white/8 bg-white/[0.025] px-4 py-4 transition-all duration-300 hover:border-primary/24 hover:bg-primary/[0.045]"
                >
                  <p className="font-label text-[0.64rem] uppercase text-foreground/42">
                    {stat.label}
                  </p>
                  <p className={`mt-2 text-base font-semibold ${toneTextClasses[stat.tone]}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </GlowCard>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,0.86fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <GlowCard
              tone="cyan"
              className="dashboard-card-hover dashboard-card-hover--primary dashboard-card-3d dashboard-border-sweep dashboard-glow-sweep dashboard-premium-card px-6 py-6 sm:px-7"
            >
              <div className="relative z-10 flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-label text-[0.68rem] uppercase text-primary/78">
                      Continue Learning
                    </p>
                    <h2 className="mt-3 font-display text-3xl font-semibold text-white">
                      {primaryContinueCourse?.title ?? "Start your first course"}
                    </h2>
                  </div>
                  <span className="inline-flex w-fit border border-primary/24 bg-primary/10 px-3 py-1 font-label text-[0.64rem] uppercase text-primary">
                    {coursesLoading || continueLearningLoading || dashboardLoading
                      ? "Syncing"
                      : primaryContinueIsCompleted
                        ? "Completed"
                        : "Course"}
                  </span>
                </div>

                {coursesErrorMessage || continueLearningErrorMessage || dashboardErrorMessage ? (
                  <p className="text-sm text-tertiary/72">
                    {dashboardErrorMessage ?? coursesErrorMessage ?? continueLearningErrorMessage}
                  </p>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)] xl:items-stretch">
                  <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(13rem,0.42fr)_minmax(0,1fr)] md:items-stretch">
                    <div className="dashboard-course-visual relative min-h-48 overflow-hidden border border-primary/18 bg-surface-lowest">
                      {primaryContinueCourse ? (
                        <Image
                          src={getCourseImagePath(primaryContinueCourse)}
                          alt={`${primaryContinueCourse.title} course visual`}
                          fill
                          sizes="(min-width: 1280px) 24vw, (min-width: 768px) 34vw, 100vw"
                          className="object-cover opacity-80"
                          priority
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-primary/10 mix-blend-screen" />
                    </div>

                    <div className="flex min-w-0 flex-col justify-between gap-6">
                      <div>
                        <p className="font-label text-[0.66rem] uppercase text-foreground/46">
                          {primaryContinueIsCompleted
                            ? "Course completed"
                            : primaryContinueCourse
                              ? "Current lesson"
                              : "Zero state"}
                        </p>
                        <h3 className="mt-2 font-display text-2xl font-semibold text-white">
                          {primaryContinueCourse ? currentLessonTitle : "No enrollment or progress yet"}
                        </h3>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground/66">
                          {primaryContinueCourse
                            ? currentLessonSummary
                            : "Choose a course to create a student-scoped progress record. Nothing is marked complete until the backend records it."}
                        </p>
                      </div>

                      <div
                        role="progressbar"
                        aria-label="Course progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={primaryContinueProgress?.progressPercent ?? 0}
                        className="space-y-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-label text-[0.66rem] uppercase text-primary">
                            Progress
                          </span>
                          <span className="font-label text-[0.66rem] uppercase text-white">
                            {primaryContinueProgress?.progressPercent ?? 0}%
                          </span>
                        </div>
                        <div className="dashboard-progress-track dashboard-progress-beam h-2.5 overflow-hidden bg-surface-container-highest shadow-[inset_0_0_16px_rgba(0,0,0,0.42)]">
                          <div
                            className="dashboard-progress-bar dashboard-progress-animated dashboard-progress-bar--course h-full bg-gradient-to-r from-primary to-secondary shadow-[0_0_18px_rgba(0,240,255,0.52)]"
                            style={{ width: `${primaryContinueProgress?.progressPercent ?? 0}%` }}
                          />
                        </div>
                      </div>

                      <Link
                        href={continueHref}
                        data-tone="cyan"
                        className="primary-button dashboard-cta-pulse w-full px-5 py-3 text-[0.72rem] sm:w-fit"
                      >
                        <span className="primary-button__sweep" />
                        <span className="relative z-10 inline-flex items-center justify-center gap-2">
                          {primaryContinueIsCompleted
                            ? "Review Course"
                            : primaryContinueCourse
                              ? "Continue Lesson"
                              : "Browse Courses"}
                          <ArrowRightIcon className="h-4 w-4" />
                        </span>
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="border border-primary/16 bg-primary/[0.035] p-4">
                      <p className="font-label text-[0.58rem] uppercase text-foreground/42">
                        Status
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {primaryContinueIsCompleted ? "Complete" : primaryContinueCourse ? "Active" : "Ready"}
                      </p>
                    </div>
                    <div className="border border-secondary/16 bg-secondary/[0.035] p-4">
                      <p className="font-label text-[0.58rem] uppercase text-foreground/42">
                        Lessons
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {primaryContinueProgress?.completedCount ?? 0}/
                        {primaryContinueProgress?.totalLessons ?? 0}
                      </p>
                    </div>
                    <div className="border border-white/10 bg-white/[0.025] p-4">
                      <p className="font-label text-[0.58rem] uppercase text-foreground/42">
                        Time Left
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {formatMinutes(minutesRemaining)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </GlowCard>

            <GlowCard tone="purple" className="dashboard-card-hover dashboard-card-3d dashboard-border-sweep dashboard-premium-card px-6 py-6 sm:px-7">
              <div className="relative z-10">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-label text-[0.68rem] uppercase text-secondary/78">
                      Skill Matrix
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-white">
                      Defensive skill growth
                    </h2>
                  </div>
                  <p className="max-w-md text-sm leading-6 text-foreground/58">
                    Focus areas derived from your backend course progress.
                  </p>
                </div>

                <div className="mt-6 grid gap-x-8 gap-y-5 md:grid-cols-2">
                  {skillMatrix.map((skill) => (
                    <div
                      key={skill.label}
                      data-tone={skill.tone}
                      className="dashboard-skill-row md:last:col-span-2"
                    >
                      <div className="flex items-end justify-between gap-4">
                        <span className="text-sm font-semibold text-white">{skill.label}</span>
                        <span className={`font-label text-[0.66rem] uppercase ${toneTextClasses[skill.tone]}`}>
                          {skill.value}%
                        </span>
                      </div>
                      <div className="dashboard-progress-track dashboard-progress-beam mt-2 h-1.5 overflow-hidden bg-surface-container-highest">
                        <div
                          className={`dashboard-progress-bar dashboard-progress-animated dashboard-progress-segment h-full ${
                            skill.tone === "neutral"
                              ? "bg-outline"
                              : "bg-gradient-to-r from-primary to-secondary"
                          }`}
                          style={{ width: `${skill.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlowCard>

            <GlowCard tone="cyan" className="dashboard-card-hover dashboard-card-3d dashboard-border-sweep dashboard-premium-card px-6 py-6 sm:px-7">
              <div className="relative z-10">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-label text-[0.68rem] uppercase text-primary/78">
                      Path Roadmap
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-white">
                      {primaryContinueCourse?.title ?? "Course Roadmap"}
                    </h2>
                  </div>
                  <p className="text-sm leading-6 text-foreground/58">
                    {primaryContinueCourse ? "Current node follows backend progress." : "Enroll to activate the first node."}
                  </p>
                </div>

                <ol className="mt-7 flex min-w-0 snap-x gap-0 overflow-x-auto pb-2">
                  {roadmapItems.map((item, index) => (
                    <li
                      key={item.label}
                      className="dashboard-roadmap-item relative flex min-w-32 flex-1 snap-start flex-col items-center px-3 text-center"
                    >
                      {index < roadmapItems.length - 1 ? (
                        <span
                          className={`dashboard-roadmap-line absolute left-1/2 top-5 h-px w-full ${
                            item.state === "completed"
                              ? "dashboard-roadmap-complete-line bg-primary/70"
                              : "bg-white/12"
                          }`}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span
                        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border ${roadmapStateClasses[item.state]} ${
                          item.state === "current"
                            ? "dashboard-pulse-node dashboard-roadmap-current"
                            : item.state === "completed"
                              ? "dashboard-roadmap-completed"
                              : ""
                        }`}
                      >
                        {item.state === "completed" ? (
                          <CheckIcon className="h-4 w-4" />
                        ) : item.state === "locked" ? (
                          <LockIcon className="h-4 w-4" />
                        ) : (
                          <span className="h-3 w-3 rounded-full bg-current shadow-[0_0_18px_currentColor]" />
                        )}
                      </span>
                      <p className="mt-3 text-sm font-semibold text-white">{item.label}</p>
                      <p className="mt-1 font-label text-[0.6rem] uppercase text-foreground/42">
                        {item.status}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </GlowCard>
          </div>

          <aside className="flex min-w-0 flex-col gap-6">
            <GlowCard tone="purple" className="dashboard-card-hover dashboard-card-3d dashboard-border-sweep dashboard-glow-sweep dashboard-ai-card px-6 py-6">
              <div className="dashboard-ai-core" aria-hidden="true" />
              <div className="relative z-10 flex h-full flex-col gap-5">
                <div className="dashboard-ai-core-shell relative h-28 overflow-hidden border border-secondary/24 bg-[#090c16]/78 sm:h-32">
                  <div className="absolute inset-0">
                    <AiTutorCore3D />
                  </div>
                  <span
                    className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center border border-secondary/30 bg-secondary/10 text-secondary backdrop-blur-sm"
                    aria-hidden="true"
                  >
                    <ShieldKeyIcon className="h-5 w-5" />
                  </span>
                  <span className="absolute right-4 top-4 border border-secondary/24 bg-secondary/10 px-3 py-1 font-label text-[0.64rem] uppercase text-secondary backdrop-blur-sm">
                    Available
                  </span>
                </div>
                <div>
                  <p className="font-label text-[0.68rem] uppercase text-secondary/78">
                    AI Tutor Guidance
                  </p>
                  <h2 className="mt-3 font-display text-2xl font-semibold text-white">
                    Safe explanations, guided hints, and next-step help.
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-foreground/64">
                    Ask for support that keeps the learning experience intact.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 border-y border-white/8 py-4">
                  <div>
                    <p className="font-label text-[0.6rem] uppercase text-foreground/40">Course</p>
                    <p className="mt-1 text-xl font-semibold text-white">
                      {primaryContinueCourse ? "Ready" : "Start"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-label text-[0.6rem] uppercase text-foreground/40">Progress</p>
                    <p className="mt-1 text-xl font-semibold text-white">
                      {primaryContinueProgress?.progressPercent ?? 0}%
                    </p>
                  </div>
                </div>
                <Link
                  href={tutorHref}
                  data-tone="purple"
                  className="primary-button dashboard-cta-pulse mt-auto w-full px-5 py-3 text-[0.72rem]"
                >
                  <span className="primary-button__sweep" />
                  <span className="relative z-10 inline-flex items-center justify-center gap-2">
                    Ask AI Tutor
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </Link>
              </div>
            </GlowCard>

            <GlowCard tone="pink" className="dashboard-card-hover dashboard-card-3d dashboard-border-sweep dashboard-challenge-card dashboard-premium-card px-6 py-6">
              <div className="relative z-10 flex h-full flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-label text-[0.68rem] uppercase text-tertiary/78">
                      Active Challenge
                    </p>
                    <h2 className="mt-3 font-display text-2xl font-semibold text-white">
                      {activeChallenge?.title ?? "Phishing Awareness Challenge"}
                    </h2>
                  </div>
                  <span className="dashboard-alert-pulse mt-2 h-2.5 w-2.5 bg-tertiary shadow-[0_0_18px_rgba(245,245,255,0.72)]" />
                </div>
                <div className="border border-white/8 bg-white/[0.025] p-4">
                  <p className="font-label text-[0.62rem] uppercase text-foreground/42">
                    Type: {activeChallenge?.category ?? "Defensive Analysis"}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/8 pt-4">
                    <span className="font-label text-[0.62rem] uppercase text-tertiary">
                      {activeChallengeSolved ? "Solved" : activeChallengeAttempted ? "Attempted" : "Available"}
                    </span>
                    <span className="font-label text-[0.62rem] uppercase text-primary">
                      {activeChallenge?.difficulty ?? "Practice"}
                    </span>
                  </div>
                </div>
                <Link
                  href="/challenges"
                  data-tone="pink"
                  className="primary-button dashboard-cta-pulse mt-auto w-full px-5 py-3 text-[0.72rem]"
                >
                  <span className="primary-button__sweep" />
                  <span className="relative z-10 inline-flex items-center justify-center gap-2">
                    {activeChallengeSolved ? "Review Challenge" : "Continue Challenge"}
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </Link>
              </div>
            </GlowCard>

            <GlowCard tone="cyan" corners={false} className="dashboard-card-hover dashboard-card-3d dashboard-border-sweep dashboard-action-panel px-5 py-5">
              <div className="relative z-10 flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
                  <ArrowRightIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-label text-[0.68rem] uppercase text-primary">
                    Recommended Action
                  </p>
                  <p className="mt-2 text-sm leading-7 text-foreground/72">
                    {primaryContinueCourse ? (
                      <>
                        Continue <span className="text-primary">{currentLessonTitle}</span>, then
                        practice the <span className="text-tertiary">Phishing Awareness Challenge</span>.
                      </>
                    ) : (
                      <>
                        Enroll in your first course, then return here to continue from your backend
                        progress state.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </GlowCard>
          </aside>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <GlowCard tone="purple" className="dashboard-card-hover dashboard-card-3d dashboard-border-sweep dashboard-premium-card px-6 py-6 sm:px-7">
            <div className="relative z-10">
              <p className="font-label text-[0.68rem] uppercase text-secondary/78">Backend Badges</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-white">
                Learning achievements
              </h2>

              {dashboardLoading ? (
                <div className="mt-6 border border-white/8 bg-white/[0.02] px-4 py-4 text-sm text-foreground/58">
                  Syncing achievements...
                </div>
              ) : earnedAchievements.length || lockedAchievements.length ? (
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {[...earnedAchievements, ...lockedAchievements].map((achievement) => {
                    const BadgeIcon = getAchievementIcon(achievement);
                    const tone = achievement.isEarned ? achievement.tone : "neutral";

                    return (
                      <div
                        key={achievement.id}
                        className={`dashboard-badge-card group flex min-h-32 flex-col items-center justify-center gap-3 border border-white/8 bg-white/[0.025] px-3 py-4 text-center transition-all duration-300 hover:border-secondary/32 hover:bg-secondary/8 ${
                          achievement.isEarned ? "" : "dashboard-badge-card--locked opacity-72"
                        }`}
                      >
                        <span
                          className={`dashboard-badge dashboard-badge-3d flex h-12 w-12 items-center justify-center border ${toneBadgeClasses[tone]}`}
                          aria-hidden="true"
                        >
                          <BadgeIcon className="h-5 w-5" />
                        </span>
                        <span className={achievement.isEarned ? "text-sm font-semibold text-white" : "text-sm font-semibold text-foreground/48"}>
                          {achievement.label}
                        </span>
                        {achievement.description ? (
                          <span className="line-clamp-2 text-xs leading-5 text-foreground/44">
                            {achievement.description}
                          </span>
                        ) : null}
                        <span
                          className={`font-label text-[0.56rem] uppercase ${
                            achievement.isEarned ? "text-primary/78" : "text-foreground/38"
                          }`}
                        >
                          {achievement.isEarned ? "Earned" : "Locked"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 border border-white/8 bg-white/[0.02] px-4 py-5">
                  <p className="text-sm font-semibold text-white">No achievements yet</p>
                  <p className="mt-1 text-sm leading-6 text-foreground/58">
                    Backend-earned achievements will appear here after milestones are reached.
                  </p>
                </div>
              )}

              <div className="mt-4 border border-secondary/18 bg-secondary/[0.035] p-4">
                <div className="flex items-start gap-4">
                  <span
                    className={`dashboard-badge dashboard-badge-3d flex h-12 w-12 shrink-0 items-center justify-center border ${
                      nextBadge ? toneBadgeClasses.neutral : "border-white/10 text-foreground/40"
                    }`}
                    aria-hidden="true"
                  >
                    <LockIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-label text-[0.62rem] uppercase text-secondary/78">Next Badge</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {nextBadge?.label ?? "Awaiting backend badge"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-foreground/54">
                      {nextBadge?.description ??
                        (nextBadge?.progressPercent !== null && nextBadge?.progressPercent !== undefined
                          ? `${nextBadge.progressPercent}% complete`
                          : "The next locked badge from the student dashboard will render here.")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </GlowCard>

          <GlowCard tone="neutral" className="dashboard-card-hover dashboard-card-3d dashboard-border-sweep dashboard-premium-card px-6 py-6 sm:px-7">
            <div className="relative z-10">
              <p className="font-label text-[0.68rem] uppercase text-foreground/42">
                Recent Activity
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-white">
                Learning updates
              </h2>

              {activityLoading ? (
                <div className="mt-6 border border-white/8 bg-white/[0.02] px-4 py-4 text-sm text-foreground/58">
                  Syncing activity...
                </div>
              ) : activity.length ? (
                <ol className="relative mt-6 grid gap-4 before:absolute before:bottom-6 before:left-5 before:top-6 before:w-px before:bg-gradient-to-b before:from-primary/34 before:via-secondary/28 before:to-tertiary/20">
                  {visibleActivity.map((item, index) => {
                    const ActivityIcon = getActivityIcon(item.tone);

                    return (
                      <li
                        key={item.id}
                        className="dashboard-activity-item dashboard-activity-glow group relative flex gap-4 border border-white/8 bg-white/[0.02] px-4 py-4 transition-all duration-300 hover:border-primary/28 hover:bg-white/[0.04]"
                      >
                        <span
                          className={`relative z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center border ${toneBadgeClasses[item.tone]} transition-all duration-300 group-hover:shadow-[0_0_18px_currentColor] ${
                            index === 0 ? "dashboard-timeline-pulse" : ""
                          }`}
                          aria-hidden="true"
                        >
                          <ActivityIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-label text-[0.58rem] uppercase text-foreground/40">
                            {formatActivityTime(item.createdAt)}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-white">{item.label}</p>
                          <p className="mt-1 text-sm leading-6 text-foreground/58">
                            {item.description}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="mt-6 border border-white/8 bg-white/[0.02] px-4 py-5">
                  <p className="text-sm font-semibold text-white">No activity yet</p>
                  <p className="mt-1 text-sm leading-6 text-foreground/58">
                    Backend activity will appear here after this student starts learning.
                  </p>
                </div>
              )}

              {activityErrorMessage ? (
                <p className="mt-4 text-sm text-tertiary/72">{activityErrorMessage}</p>
              ) : null}

              {hiddenActivityCount > 0 ? (
                <div className="mt-4 flex items-center justify-between gap-4 border border-white/8 bg-white/[0.02] px-4 py-3">
                  <span className="text-sm text-foreground/58">
                    {hiddenActivityCount} older updates hidden
                  </span>
                  <span className="font-label text-[0.64rem] uppercase text-primary/78">
                    View all activity
                  </span>
                </div>
              ) : null}
            </div>
          </GlowCard>
        </div>
      </div>
    </section>
  );
}
