import type { Metadata } from "next";
import { PhishingAwarenessChallenge } from "@/components/challenges/PhishingAwarenessChallenge";

export const metadata: Metadata = {
  title: "Practice Challenges",
  description: "Practice defensive cybersecurity analysis challenges.",
};

export default function ChallengesPage() {
  return <PhishingAwarenessChallenge />;
}
