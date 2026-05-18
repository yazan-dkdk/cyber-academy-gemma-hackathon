import type { Course } from "@/lib/courses/types";

export const mockCourses: Course[] = [
  {
    id: "network-defense-foundations",
    title: "Network Defense Foundations",
    category: "Blue Team",
    shortDescription:
      "Build the baseline skills for reading traffic, spotting weak signals, and hardening a small network.",
    fullDescription:
      "A practical introduction to defensive networking for new operators. You will learn how traffic moves, where useful evidence appears, and how to turn basic observations into a repeatable investigation workflow.",
    difficulty: "beginner",
    tone: "cyan",
    hasLabs: true,
    sections: [
      {
        id: "ndf-orientation",
        title: "Orientation",
        description: "Core concepts for thinking clearly about network defense.",
        order: 1,
        lessons: [
          {
            id: "ndf-traffic-map",
            title: "Reading the Traffic Map",
            type: "TEXT",
            durationMinutes: 12,
            order: 1,
            summary: "Understand hosts, services, ports, and the path an event takes through a network.",
            articleContent: [
              "Network defense starts with a map of normal movement. Identify the hosts involved, the service being requested, the port in use, and the direction of the connection before deciding whether an event is suspicious.",
              "A useful first pass separates expected business traffic from traffic that needs review. Look for unfamiliar destinations, unexpected listening services, repeated failures, and protocol choices that do not fit the asset.",
              "For the MVP, treat this lesson as a structured reading module. Later, the lab backend can attach packet captures and scoring events to the same lesson record.",
            ],
          },
          {
            id: "ndf-packet-view",
            title: "Packet Capture Walkthrough",
            type: "VIDEO",
            durationMinutes: 9,
            order: 2,
            summary: "Review a simple packet capture workflow with protected training media.",
            articleContent: [
              "The protected media slot will eventually stream a guided walkthrough. The key operator habit is to move from broad conversation view into packet-level detail only after the scope is clear.",
            ],
          },
        ],
      },
      {
        id: "ndf-hardening",
        title: "Hardening Basics",
        description: "Small configuration choices that reduce exposure fast.",
        order: 2,
        lessons: [
          {
            id: "ndf-service-review",
            title: "Service Exposure Review",
            type: "HYBRID",
            durationMinutes: 18,
            order: 1,
            summary: "Identify open services and decide which ones belong in the current environment.",
            articleContent: [
              "Exposure review asks a simple question: should this service be reachable from this network zone? If the answer is unclear, document the owner and expected use before making changes.",
              "Start with externally reachable services, then review internal administrative surfaces. Reduce exposure by disabling unused services, restricting source networks, and recording accepted exceptions.",
            ],
          },
          {
            id: "ndf-firewall-rules",
            title: "Firewall Rule Hygiene",
            type: "TEXT",
            durationMinutes: 16,
            order: 2,
            summary: "Translate intended access into simple, auditable firewall rules.",
            articleContent: [
              "Good firewall rules are boring: specific source, specific destination, specific service, and a clear reason. Broad allow rules age badly and make incident review harder.",
              "When reviewing a rule set, group related rules by purpose, remove expired exceptions, and confirm that deny behavior is explicit enough for future operators to understand.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "web-application-attack-lab",
    title: "Web Application Attack Lab",
    category: "Application Security",
    shortDescription:
      "Practice safe exploitation patterns against intentionally vulnerable web surfaces.",
    fullDescription:
      "A guided course for understanding common web application flaws from the attacker perspective. The emphasis stays on controlled labs, evidence, and the mental model needed to report risks responsibly.",
    difficulty: "intermediate",
    tone: "purple",
    hasLabs: true,
    sections: [
      {
        id: "waa-recon",
        title: "Reconnaissance",
        description: "Map the app before touching exploit paths.",
        order: 1,
        lessons: [
          {
            id: "waa-surface-map",
            title: "Application Surface Mapping",
            type: "TEXT",
            durationMinutes: 15,
            order: 1,
            summary: "Catalog routes, inputs, auth boundaries, and data-bearing features.",
            articleContent: [
              "Surface mapping keeps testing disciplined. List routes, forms, API calls, role boundaries, and places where user-provided values are rendered or stored.",
              "A clear map prevents random probing. It also helps you explain why a finding matters when the same flaw appears across several similar endpoints.",
            ],
          },
          {
            id: "waa-proxy-tour",
            title: "Proxy Setup",
            type: "VIDEO",
            durationMinutes: 10,
            order: 2,
            summary: "Configure an intercepting proxy for controlled request inspection.",
            articleContent: [
              "The video placeholder represents a protected walkthrough. The final lesson can reuse this content slot when the media service is connected.",
            ],
          },
        ],
      },
      {
        id: "waa-exploitation",
        title: "Controlled Exploitation",
        description: "Validate impact without overreaching.",
        order: 2,
        lessons: [
          {
            id: "waa-injection",
            title: "Input Injection Signals",
            type: "HYBRID",
            durationMinutes: 22,
            order: 1,
            summary: "Use safe probes to identify injection behavior and document the boundary.",
            articleContent: [
              "Injection testing starts with harmless inputs that reveal parsing behavior. A useful test changes one variable at a time and records both the request and the response.",
              "Do not jump from a signal to destructive proof. In a training environment, the goal is to understand the vulnerable path and produce evidence that a defender or developer can reproduce.",
            ],
          },
          {
            id: "waa-access-control",
            title: "Access Control Checks",
            type: "TEXT",
            durationMinutes: 17,
            order: 2,
            summary: "Test whether resource ownership and role checks hold across common paths.",
            articleContent: [
              "Access control failures often hide in ordinary workflows. Compare what two users with different ownership or roles can read, modify, and delete.",
              "Document the expected rule before showing the bypass. This makes the finding easier to fix and prevents the report from becoming a collection of unrelated screenshots.",
            ],
          },
          {
            id: "waa-reporting",
            title: "Writing the Finding",
            type: "TEXT",
            durationMinutes: 13,
            order: 3,
            summary: "Turn lab evidence into a concise, reproducible report.",
            articleContent: [
              "A strong finding states impact, affected surface, reproduction steps, evidence, and a practical remediation path. Keep speculation out of the main claim.",
              "When the same root cause affects multiple endpoints, group them under one finding and include enough examples to prove the pattern.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "incident-response-operations",
    title: "Incident Response Operations",
    category: "Incident Response",
    shortDescription:
      "Learn the response cadence for triage, containment, recovery, and post-incident review.",
    fullDescription:
      "This course walks through the operator rhythm of incident response. You will move from first signal to action plan, then practice containment and communication choices that keep a response calm and measurable.",
    difficulty: "intermediate",
    tone: "pink",
    hasLabs: false,
    sections: [
      {
        id: "iro-triage",
        title: "Triage",
        description: "Separate signal from noise under time pressure.",
        order: 1,
        lessons: [
          {
            id: "iro-first-hour",
            title: "The First Hour",
            type: "TEXT",
            durationMinutes: 11,
            order: 1,
            summary: "Stabilize the response with scope, severity, owners, and immediate next moves.",
            articleContent: [
              "The first hour is about reducing uncertainty. Capture what triggered the response, what assets might be affected, who owns the decision path, and what action can safely reduce risk.",
              "Avoid overfitting to the first alert. Treat the early narrative as a hypothesis that can change as evidence arrives.",
            ],
          },
          {
            id: "iro-evidence",
            title: "Evidence Handling",
            type: "VIDEO",
            durationMinutes: 8,
            order: 2,
            summary: "Preserve evidence without slowing response.",
            articleContent: [
              "The protected media slot will demonstrate evidence collection order, chain of custody notes, and common mistakes that make later review harder.",
            ],
          },
        ],
      },
      {
        id: "iro-containment",
        title: "Containment",
        description: "Reduce blast radius while maintaining visibility.",
        order: 2,
        lessons: [
          {
            id: "iro-isolation",
            title: "Host Isolation Decisions",
            type: "HYBRID",
            durationMinutes: 18,
            order: 1,
            summary: "Choose isolation steps based on confidence, business impact, and evidence needs.",
            articleContent: [
              "Isolation is a tradeoff. Disconnect too early and you may lose visibility; wait too long and the incident may spread. Use severity, confidence, and business dependency to decide.",
              "When possible, preserve remote collection paths while blocking risky outbound movement. Record the time, owner, reason, and expected rollback condition.",
            ],
          },
          {
            id: "iro-communications",
            title: "Status Communications",
            type: "TEXT",
            durationMinutes: 12,
            order: 2,
            summary: "Keep internal updates factual, brief, and useful for decision makers.",
            articleContent: [
              "Good response updates are factual and time-bound. State what is known, what changed since the last update, what is being done now, and where help is needed.",
              "Avoid dramatic language. Clear communication keeps stakeholders aligned and gives operators room to work.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "advanced-threat-hunting",
    title: "Advanced Threat Hunting",
    category: "Threat Hunting",
    shortDescription:
      "Use hypotheses, telemetry, and adversary tradecraft to hunt across complex environments.",
    fullDescription:
      "A deeper course for operators who already know the defensive basics. The lessons focus on building hunt hypotheses, choosing telemetry, and iterating when early evidence does not confirm the expected path.",
    difficulty: "advanced",
    tone: "neutral",
    hasLabs: true,
    sections: [
      {
        id: "ath-hypothesis",
        title: "Hunt Design",
        description: "Create focused hunts that can be proven or disproven.",
        order: 1,
        lessons: [
          {
            id: "ath-hypothesis-writing",
            title: "Hypothesis Writing",
            type: "TEXT",
            durationMinutes: 16,
            order: 1,
            summary: "Convert adversary behavior into a measurable question for the environment.",
            articleContent: [
              "A hunt hypothesis links behavior, environment, and evidence. It should be narrow enough to test and broad enough to catch a meaningful class of activity.",
              "Strong hypotheses avoid vendor-specific assumptions until the telemetry plan is clear. Start with the behavior, then translate into available data.",
            ],
          },
          {
            id: "ath-telemetry-fit",
            title: "Telemetry Fit",
            type: "TEXT",
            durationMinutes: 19,
            order: 2,
            summary: "Pick data sources that can answer the hunt question with useful confidence.",
            articleContent: [
              "Telemetry fit is about whether the data can prove or disprove the hypothesis. Missing fields, noisy collection, or short retention can all make a hunt inconclusive.",
              "Record blind spots as outcomes. A hunt that reveals a coverage gap still improves the defensive program when that gap gets prioritized.",
            ],
          },
        ],
      },
      {
        id: "ath-execution",
        title: "Execution",
        description: "Run the hunt and adapt without losing the thread.",
        order: 2,
        lessons: [
          {
            id: "ath-query-review",
            title: "Query Review",
            type: "VIDEO",
            durationMinutes: 12,
            order: 1,
            summary: "Review hunt queries and result pivots through protected training media.",
            articleContent: [
              "The final video service can attach query walkthroughs here. The lesson model already knows this is video-first content with protected media.",
            ],
          },
          {
            id: "ath-findings",
            title: "From Hunt to Finding",
            type: "HYBRID",
            durationMinutes: 20,
            order: 2,
            summary: "Decide whether the result is benign, suspicious, or ready for response.",
            articleContent: [
              "Not every hunt hit is an incident. Compare the result against baseline behavior, asset context, timing, and known administrative activity.",
              "When evidence remains ambiguous, document the next query or data source needed. Good hunting is iterative, not theatrical.",
            ],
          },
          {
            id: "ath-retrospective",
            title: "Hunt Retrospective",
            type: "TEXT",
            durationMinutes: 10,
            order: 3,
            summary: "Capture what improved detection coverage and what still needs instrumentation.",
            articleContent: [
              "A retrospective turns a hunt into program improvement. Capture the hypothesis, data sources, queries, result, coverage gaps, and recommended next hunt.",
              "The most useful output may be a new detection, a tuned alert, a documented blind spot, or a confirmed baseline.",
            ],
          },
        ],
      },
    ],
  },
];
