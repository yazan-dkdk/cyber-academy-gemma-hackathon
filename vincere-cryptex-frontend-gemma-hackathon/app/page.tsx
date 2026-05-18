import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Vincere Cryptex",
  description:
    "Premium cybersecurity training with guided courses, realistic labs, CTF challenges, and progress dashboards.",
};

export default function HomePage() {
  return <LandingPage />;
}
