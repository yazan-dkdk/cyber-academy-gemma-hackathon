export type AccentTone = "cyan" | "violet" | "pink" | "emerald";

export type PlatformArea = {
  id: string;
  title: string;
  label: string;
  summary: string;
  bullets: string[];
  accent: AccentTone;
};

export const platformAreas: PlatformArea[] = [
  {
    id: "network",
    title: "Network",
    label: "Surface 01",
    summary:
      "A place to focus on infrastructure visibility, connection pathways, and exposure review without cluttering the rest of the platform.",
    bullets: [
      "Map approved environments and trust boundaries in a single operational view.",
      "Highlight the systems and segments that deserve analyst attention first.",
      "Leave room for future graphing, packet context, and topology integrations.",
    ],
    accent: "cyan",
  },
  {
    id: "assets",
    title: "Assets",
    label: "Surface 02",
    summary:
      "Track owned systems, inventory posture, and stewardship responsibilities with a cleaner experience than a generic admin console.",
    bullets: [
      "Organize critical systems by owner, environment, and risk relevance.",
      "Prepare the interface for lifecycle, state, and review metadata.",
      "Keep asset context close to the operator instead of buried in forms.",
    ],
    accent: "violet",
  },
  {
    id: "intel",
    title: "Intel",
    label: "Surface 03",
    summary:
      "Present intelligence review as a disciplined workspace for triage, context gathering, and operational prioritization.",
    bullets: [
      "Support curated notes, signals, and watchlists without noisy dashboards.",
      "Leave room for enrichment, tagging, and investigation workflows later.",
      "Use language and spacing that feels deliberate rather than sensational.",
    ],
    accent: "pink",
  },
  {
    id: "vault",
    title: "Vault",
    label: "Surface 04",
    summary:
      "Reserve a protected interface for sensitive artifacts, controlled evidence handling, and high-trust operational material.",
    bullets: [
      "Separate evidence-oriented work from general browsing and monitoring tasks.",
      "Make access expectations clear before any backend storage integration exists.",
      "Set the visual tone for encryption, custody, and privileged review flows.",
    ],
    accent: "emerald",
  },
];

export const operationalPrinciples = [
  {
    title: "Use legal framing early",
    description:
      "Footer links, policy pages, and proprietary license text establish a credible baseline for a production-facing platform.",
  },
  {
    title: "Keep access honest",
    description:
      "Real labels like Email, Password, and Login make the experience grounded while the UI still signals what is not yet wired.",
  },
  {
    title: "Separate responsibilities",
    description:
      "Network, Assets, Intel, and Vault stay distinct so future features can grow without collapsing into one overloaded dashboard.",
  },
  {
    title: "Let design support trust",
    description:
      "Subtle glow, glass panels, and disciplined spacing create atmosphere without turning the product into visual noise.",
  },
];
