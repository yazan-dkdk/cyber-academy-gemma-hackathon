import type { Metadata } from "next";
import { LearningPathsExperience } from "@/components/learning-paths/LearningPathsExperience";

export const metadata: Metadata = {
  title: "Learning Paths",
  description:
    "Choose structured cybersecurity learning paths and build practical skills step by step.",
};

export default function LearningPathsPage() {
  return <LearningPathsExperience />;
}
