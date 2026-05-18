import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy practices for the Vincere Cryptex cybersecurity platform frontend.",
};

const privacySections: LegalSection[] = [
  {
    title: "Information We Collect",
    paragraphs: [
      "Vincere Cryptex may process account identifiers, authentication events, session metadata, audit records, and usage telemetry that are necessary to operate a secure cybersecurity platform.",
      "The exact data collected depends on the services you enable, the integrations you connect, and the access level assigned to your account.",
    ],
  },
  {
    title: "How We Use Information",
    paragraphs: [
      "We use platform information to authenticate users, authorize access, secure the environment, monitor operational activity, investigate incidents, and improve the reliability of the service.",
      "Security-related logs and review trails may also be used to support internal governance, compliance workflows, and forensic analysis when needed.",
    ],
  },
  {
    title: "Sharing and Disclosure",
    paragraphs: [
      "Information may be shared with approved service providers or internal stakeholders only when that sharing is required to operate, secure, maintain, or legally support the platform.",
      "We do not disclose platform data for unrelated purposes, and we expect every authorized recipient to handle it under equivalent confidentiality and security obligations.",
    ],
  },
  {
    title: "Retention",
    paragraphs: [
      "Data is retained only for as long as it is required for operational continuity, security monitoring, contractual obligations, legal compliance, or legitimate business recordkeeping.",
      "Retention periods can vary by data type, deployment model, and customer policy.",
    ],
  },
  {
    title: "Security Measures",
    paragraphs: [
      "We design the platform around layered access controls, audit-friendly workflows, and administrative review of sensitive actions.",
      "No system can promise absolute security, but we aim to apply reasonable technical and organizational safeguards appropriate to the nature of the data being handled.",
    ],
  },
  {
    title: "Your Responsibilities",
    paragraphs: [
      "Users are responsible for maintaining accurate account information, protecting their credentials, and using the platform in accordance with approved organizational and legal requirements.",
      "If you believe your account, workspace, or data has been exposed or misused, you should notify your authorized platform contact immediately.",
    ],
  },
  {
    title: "Policy Updates",
    paragraphs: [
      "This Privacy Policy may be updated to reflect changes in the platform, applicable law, or operating practices.",
      "Continued use of the platform after an update takes effect constitutes acceptance of the revised policy.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Privacy Policy"
      title="Privacy practices for a secure operational workspace."
      summary="This policy explains the kinds of information a cybersecurity platform may process, the reasons that information is used, and the safeguards expected around sensitive operational data."
      lastUpdated="April 7, 2026"
      sections={privacySections}
    />
  );
}
