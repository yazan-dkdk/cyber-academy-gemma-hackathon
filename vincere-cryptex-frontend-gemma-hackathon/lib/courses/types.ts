export type CourseDifficulty = "beginner" | "intermediate" | "advanced";

export type LessonType = "TEXT" | "VIDEO" | "HYBRID";

export type CourseTone = "cyan" | "purple" | "pink" | "neutral";

export type CourseSource = "backend" | "public-preview" | "public-fallback";

export type CourseLesson = {
  id: string;
  backendId?: string | null;
  slug?: string | null;
  title: string;
  type: LessonType;
  contentMode?: LessonType | null;
  text?: string | null;
  video?: unknown;
  protectedMedia?: unknown;
  media?: unknown;
  durationMinutes: number;
  order: number;
  isLocked?: boolean | null;
  summary: string;
  articleContent: string[];
};

export type CourseSection = {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: CourseLesson[];
};

export type Course = {
  id: string;
  backendId?: string | null;
  slug?: string | null;
  source?: CourseSource;
  title: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  difficulty: CourseDifficulty;
  tone: CourseTone;
  hasLabs: boolean;
  isPublished?: boolean | null;
  isVisible?: boolean | null;
  sections: CourseSection[];
  enrollmentStatus?: string | null;
  isEnrolled?: boolean | null;
  progressPercent?: number | null;
  completedLessonIds?: string[];
  completedCount?: number | null;
  totalLessons?: number | null;
  currentLessonId?: string | null;
  nextLessonId?: string | null;
  lessonStates?: LessonState[];
  lessonProgress?: Record<string, LessonProgressValues>;
  lastAccessedAt?: string | null;
};

export type CourseSummary = Pick<
  Course,
  | "id"
  | "backendId"
  | "slug"
  | "source"
  | "title"
  | "category"
  | "shortDescription"
  | "difficulty"
  | "tone"
  | "hasLabs"
  | "isPublished"
  | "isVisible"
> & {
  lessonCount: number;
  sectionCount: number;
  durationMinutes: number;
  lessonTypes: LessonType[];
  lessonIds: string[];
  enrollmentStatus?: string | null;
  isEnrolled?: boolean | null;
  progressPercent?: number | null;
  completedLessonIds?: string[];
  completedCount?: number | null;
  totalLessons?: number | null;
  currentLessonId?: string | null;
  nextLessonId?: string | null;
  lessonStates?: LessonState[];
  lessonProgress?: Record<string, LessonProgressValues>;
  lastAccessedAt?: string | null;
};

export type CourseLessonReference = {
  courseId: string;
  sectionId: string;
  sectionTitle: string;
  lesson: CourseLesson;
  lessonIndex: number;
};

export type LessonProgressValues = {
  scroll: number;
  watch: number;
  readingTime: number;
};

export type LessonState = {
  lessonId: string;
  type: LessonType;
  isCompleted: boolean;
  isLocked: boolean;
  progress: LessonProgressValues;
};

export type CourseProgress = {
  courseId: string;
  isEnrolled: boolean;
  isCompleted: boolean;
  completedLessonIds: string[];
  completedCount: number;
  totalLessons: number;
  progressPercent: number;
  currentLessonId: string | null;
  nextLessonId: string | null;
  lessonStates: LessonState[];
  lessonProgress: Record<string, LessonProgressValues>;
};
