import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = {
  title: "Student Dashboard",
  description: "Student dashboard for Vincere Cryptex cybersecurity training progress.",
};

export default function DashboardPage() {
  return <DashboardShell />;
}
