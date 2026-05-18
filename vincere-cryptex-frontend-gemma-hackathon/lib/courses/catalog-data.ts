import type { CourseDifficulty, CourseTone } from "@/lib/courses/types";

export type LearningPathTone = "red" | "blue";

export type LearningPath = {
  id: string;
  title: string;
  label: string;
  description: string;
  moduleCount: number;
  courseCount: number;
  tone: LearningPathTone;
  entryCourseId: string;
};

export type RecommendedCourse = {
  courseId: string;
  reason: string;
};

export type CourseVisualPreset = {
  tone: CourseTone;
  signal: "defense" | "web" | "soc" | "intel";
};

export const recommendedCourses: RecommendedCourse[] = [
  {
    courseId: "web-application-attack-lab",
    reason: "Controlled exploitation workflows",
  },
  {
    courseId: "advanced-threat-hunting",
    reason: "Advanced telemetry pivots",
  },
  {
    courseId: "incident-response-operations",
    reason: "Triage and containment cadence",
  },
];

export const continueLearningCourseIds = [
  "network-defense-foundations",
  "web-application-attack-lab",
] as const;

export const learningPaths: LearningPath[] = [
  {
    id: "red-team",
    title: "Red Team Path",
    label: "Red Team",
    description:
      "Master reconnaissance, controlled exploitation, web attack chains, and reporting discipline.",
    moduleCount: 12,
    courseCount: 4,
    tone: "red",
    entryCourseId: "web-application-attack-lab",
  },
  {
    id: "blue-team",
    title: "Blue Team Path",
    label: "Blue Team",
    description:
      "Build detection, investigation, hardening, and response skills for real-world defensive operations.",
    moduleCount: 10,
    courseCount: 4,
    tone: "blue",
    entryCourseId: "network-defense-foundations",
  },
];

export const levelLabels: Record<CourseDifficulty, string> = {
  beginner: "BEGINNER",
  intermediate: "INTERMEDIATE",
  advanced: "ADVANCED",
};

export const courseVisualPresets: Record<string, CourseVisualPreset> = {
  "network-defense-foundations": {
    tone: "cyan",
    signal: "defense",
  },
  "web-application-attack-lab": {
    tone: "purple",
    signal: "web",
  },
  "incident-response-operations": {
    tone: "cyan",
    signal: "soc",
  },
  "advanced-threat-hunting": {
    tone: "pink",
    signal: "intel",
  },
};
