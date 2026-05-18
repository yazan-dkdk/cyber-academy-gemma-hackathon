import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for the Vincere Cryptex cybersecurity platform frontend.",
};

const termsSections: LegalSection[] = [
  {
    title: "Acceptance of Terms",
    paragraphs: [
      "By accessing or using Vincere Cryptex, you agree to be bound by these Terms of Service and any applicable organizational policies that govern your access to the platform.",
      "If you do not agree to these terms, you must not access or use the service.",
    ],
  },
  {
    title: "Authorized Access",
    paragraphs: [
      "The platform is intended only for users who have received explicit authorization from the relevant organization or system owner.",
      "You are responsible for safeguarding your credentials and for all activity performed through your account unless and until you report a suspected compromise through an approved support or security channel.",
    ],
  },
  {
    title: "Acceptable Use",
    paragraphs: [
      "You may use the platform only for lawful, approved, and security-related business purposes consistent with your assigned role.",
    ],
    bullets: [
      "Do not attempt to access environments, data, or workflows beyond your granted permissions.",
      "Do not copy, extract, reverse engineer, or redistribute proprietary materials without written authorization.",
      "Do not use the platform to interfere with availability, integrity, or confidentiality of systems or data.",
    ],
  },
  {
    title: "Intellectual Property",
    paragraphs: [
      "Vincere Cryptex, including its interface, underlying logic, design system, documentation, and related materials, is proprietary and protected by applicable intellectual property laws.",
      "No rights are granted except the limited right to use the platform as expressly authorized.",
    ],
  },
  {
    title: "Service Changes and Availability",
    paragraphs: [
      "We may modify, improve, suspend, or retire features at any time to support security, reliability, or product evolution.",
      "While we aim for stable service, uninterrupted availability is not guaranteed.",
    ],
  },
  {
    title: "Disclaimer and Limitation",
    paragraphs: [
      "To the fullest extent permitted by law, the platform is provided on an as available basis without guarantees that every feature will be error-free, uninterrupted, or suitable for every use case.",
      "You remain responsible for applying appropriate human review, internal controls, and operational judgment when relying on platform output.",
    ],
  },
  {
    title: "Termination",
    paragraphs: [
      "Access may be suspended or terminated if use of the platform creates security risk, violates these terms, or conflicts with organizational policy or legal requirements.",
      "Upon termination, your right to access the platform ends immediately unless otherwise required by a separate written agreement.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Terms of Service"
      title="Rules for authorized use of the platform."
      summary="These terms outline the access boundaries, intellectual property protections, and operational expectations associated with the Vincere Cryptex interface."
      lastUpdated="April 7, 2026"
      sections={termsSections}
    />
  );
}
