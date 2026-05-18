import {
  ChallengeDifficulty,
  ChallengeStatus,
  CourseLevel,
  CourseStatus,
  LessonContentMode,
  LessonStatus,
  PrismaClient,
  SectionStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

interface LessonSeed {
  position: number;
  slug: string;
  title: string;
  summary: string;
  textContent: string;
  contentMode?: LessonContentMode;
  videoProvider?: string;
  videoAssetId?: string;
  videoDurationSeconds?: number;
}

interface SectionSeed {
  position: number;
  title: string;
  lessons: LessonSeed[];
}

interface CourseSeed {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  level: CourseLevel;
  sections: SectionSeed[];
}

interface ChallengeHintSeed {
  position: 1 | 2;
  title: string;
  content: string;
}

interface ChallengeSeed {
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: ChallengeDifficulty;
  points: number;
  flag: string;
  hints: ChallengeHintSeed[];
}

const LEGACY_LESSON_SLUGS_BY_COURSE_SLUG: Record<string, Record<string, string[]>> = {
  'network-defense-foundations': {
    'ndf-traffic-map': ['network-segmentation-basics', 'reading-the-traffic-map'],
    'ndf-packet-view': ['secure-remote-access', 'packet-capture-walkthrough'],
    'ndf-service-review': ['logging-useful-network-events', 'service-exposure-review'],
    'ndf-firewall-rules': ['firewall-rule-hygiene'],
  },
  'web-application-attack-lab': {
    'waa-surface-map': ['mapping-application-surfaces', 'application-surface-mapping'],
    'waa-proxy-tour': ['proxy-setup'],
    'waa-injection': ['injection-risk-patterns', 'input-injection-signals'],
    'waa-access-control': ['broken-access-control-checks', 'access-control-checks'],
    'waa-reporting': ['reporting-web-findings', 'writing-the-finding'],
  },
  'incident-response-operations': {
    'iro-first-hour': ['incident-intake-and-severity', 'the-first-hour'],
    'iro-evidence': ['evidence-preservation', 'evidence-handling'],
    'iro-isolation': ['containment-decision-records', 'host-isolation-decisions'],
    'iro-communications': ['recovery-and-lessons-learned', 'status-communications'],
  },
  'advanced-threat-hunting': {
    'ath-hypothesis-writing': ['building-hunt-hypotheses', 'hypothesis-writing'],
    'ath-telemetry-fit': ['endpoint-telemetry-joins', 'telemetry-fit'],
    'ath-query-review': ['query-review'],
    'ath-findings': ['converting-hunts-to-detections', 'from-hunt-to-finding'],
    'ath-retrospective': ['hunt-retrospective'],
  },
};

const courseSeeds: CourseSeed[] = [
  {
    slug: 'network-defense-foundations',
    title: 'Network Defense Foundations',
    shortDescription:
      'Build the baseline skills for reading traffic, spotting weak signals, and hardening a small network.',
    description:
      'A practical introduction to defensive networking for new operators. You will learn how traffic moves, where useful evidence appears, and how to turn basic observations into a repeatable investigation workflow.',
    level: CourseLevel.BEGINNER,
    sections: [
      {
        position: 1,
        title: 'Orientation',
        lessons: [
          {
            position: 1,
            slug: 'ndf-traffic-map',
            title: 'Reading the Traffic Map',
            summary:
              'Understand hosts, services, ports, and the path an event takes through a network.',
            textContent:
              'Network defense starts with a map of normal movement. Identify the hosts involved, the service being requested, the port in use, and the direction of the connection before deciding whether an event is suspicious.\n\nA useful first pass separates expected business traffic from traffic that needs review. Look for unfamiliar destinations, unexpected listening services, repeated failures, and protocol choices that do not fit the asset.',
            contentMode: LessonContentMode.TEXT,
          },
          {
            position: 2,
            slug: 'ndf-packet-view',
            title: 'Packet Capture Walkthrough',
            summary: 'Review a simple packet capture workflow with protected training media.',
            textContent:
              'The protected media slot will eventually stream a guided walkthrough. The key operator habit is to move from broad conversation view into packet-level detail only after the scope is clear.',
            contentMode: LessonContentMode.VIDEO,
          },
        ],
      },
      {
        position: 2,
        title: 'Hardening Basics',
        lessons: [
          {
            position: 1,
            slug: 'ndf-service-review',
            title: 'Service Exposure Review',
            summary:
              'Identify open services and decide which ones belong in the current environment.',
            textContent:
              'Exposure review asks a simple question: should this service be reachable from this network zone? If the answer is unclear, document the owner and expected use before making changes.\n\nStart with externally reachable services, then review internal administrative surfaces. Reduce exposure by disabling unused services, restricting source networks, and recording accepted exceptions.',
            contentMode: LessonContentMode.HYBRID,
          },
          {
            position: 2,
            slug: 'ndf-firewall-rules',
            title: 'Firewall Rule Hygiene',
            summary: 'Translate intended access into simple, auditable firewall rules.',
            textContent:
              'Good firewall rules are boring: specific source, specific destination, specific service, and a clear reason. Broad allow rules age badly and make incident review harder.\n\nWhen reviewing a rule set, group related rules by purpose, remove expired exceptions, and confirm that deny behavior is explicit enough for future operators to understand.',
            contentMode: LessonContentMode.TEXT,
          },
        ],
      },
    ],
  },
  {
    slug: 'web-application-attack-lab',
    title: 'Web Application Attack Lab',
    shortDescription:
      'Practice safe exploitation patterns against intentionally vulnerable web surfaces.',
    description:
      'A guided course for understanding common web application flaws from the attacker perspective. The emphasis stays on controlled labs, evidence, and the mental model needed to report risks responsibly.',
    level: CourseLevel.INTERMEDIATE,
    sections: [
      {
        position: 1,
        title: 'Reconnaissance',
        lessons: [
          {
            position: 1,
            slug: 'waa-surface-map',
            title: 'Application Surface Mapping',
            summary: 'Catalog routes, inputs, auth boundaries, and data-bearing features.',
            textContent:
              'Surface mapping keeps testing disciplined. List routes, forms, API calls, role boundaries, and places where user-provided values are rendered or stored.\n\nA clear map prevents random probing. It also helps you explain why a finding matters when the same flaw appears across several similar endpoints.',
            contentMode: LessonContentMode.TEXT,
          },
          {
            position: 2,
            slug: 'waa-proxy-tour',
            title: 'Proxy Setup',
            summary: 'Configure an intercepting proxy for controlled request inspection.',
            textContent:
              'The video placeholder represents a protected walkthrough. The final lesson can reuse this content slot when the media service is connected.',
            contentMode: LessonContentMode.HYBRID,
          },
        ],
      },
      {
        position: 2,
        title: 'Controlled Exploitation',
        lessons: [
          {
            position: 1,
            slug: 'waa-injection',
            title: 'Input Injection Signals',
            summary: 'Use safe probes to identify injection behavior and document the boundary.',
            textContent:
              'Injection testing starts with harmless inputs that reveal parsing behavior. A useful test changes one variable at a time and records both the request and the response.\n\nDo not jump from a signal to destructive proof. In a training environment, the goal is to understand the vulnerable path and produce evidence that a defender or developer can reproduce.',
            contentMode: LessonContentMode.HYBRID,
          },
          {
            position: 2,
            slug: 'waa-access-control',
            title: 'Access Control Checks',
            summary:
              'Test whether resource ownership and role checks hold across common paths.',
            textContent:
              'Access control failures often hide in ordinary workflows. Compare what two users with different ownership or roles can read, modify, and delete.\n\nDocument the expected rule before showing the bypass. This makes the finding easier to fix and prevents the report from becoming a collection of unrelated screenshots.',
            contentMode: LessonContentMode.TEXT,
          },
          {
            position: 3,
            slug: 'waa-reporting',
            title: 'Writing the Finding',
            summary: 'Turn lab evidence into a concise, reproducible report.',
            textContent:
              'A strong finding states impact, affected surface, reproduction steps, evidence, and a practical remediation path. Keep speculation out of the main claim.\n\nWhen the same root cause affects multiple endpoints, group them under one finding and include enough examples to prove the pattern.',
            contentMode: LessonContentMode.TEXT,
          },
        ],
      },
    ],
  },
  {
    slug: 'incident-response-operations',
    title: 'Incident Response Operations',
    shortDescription:
      'Learn the response cadence for triage, containment, recovery, and post-incident review.',
    description:
      'This course walks through the operator rhythm of incident response. You will move from first signal to action plan, then practice containment and communication choices that keep a response calm and measurable.',
    level: CourseLevel.INTERMEDIATE,
    sections: [
      {
        position: 1,
        title: 'Triage',
        lessons: [
          {
            position: 1,
            slug: 'iro-first-hour',
            title: 'The First Hour',
            summary:
              'Stabilize the response with scope, severity, owners, and immediate next moves.',
            textContent:
              'The first hour is about reducing uncertainty. Capture what triggered the response, what assets might be affected, who owns the decision path, and what action can safely reduce risk.\n\nAvoid overfitting to the first alert. Treat the early narrative as a hypothesis that can change as evidence arrives.',
            contentMode: LessonContentMode.TEXT,
          },
          {
            position: 2,
            slug: 'iro-evidence',
            title: 'Evidence Handling',
            summary: 'Preserve evidence without slowing response.',
            textContent:
              'The protected media slot will demonstrate evidence collection order, chain of custody notes, and common mistakes that make later review harder.',
            contentMode: LessonContentMode.VIDEO,
          },
        ],
      },
      {
        position: 2,
        title: 'Containment',
        lessons: [
          {
            position: 1,
            slug: 'iro-isolation',
            title: 'Host Isolation Decisions',
            summary:
              'Choose isolation steps based on confidence, business impact, and evidence needs.',
            textContent:
              'Isolation is a tradeoff. Disconnect too early and you may lose visibility; wait too long and the incident may spread. Use severity, confidence, and business dependency to decide.\n\nWhen possible, preserve remote collection paths while blocking risky outbound movement. Record the time, owner, reason, and expected rollback condition.',
            contentMode: LessonContentMode.HYBRID,
          },
          {
            position: 2,
            slug: 'iro-communications',
            title: 'Status Communications',
            summary: 'Keep internal updates factual, brief, and useful for decision makers.',
            textContent:
              'Good response updates are factual and time-bound. State what is known, what changed since the last update, what is being done now, and where help is needed.\n\nAvoid dramatic language. Clear communication keeps stakeholders aligned and gives operators room to work.',
            contentMode: LessonContentMode.TEXT,
          },
        ],
      },
    ],
  },
  {
    slug: 'advanced-threat-hunting',
    title: 'Advanced Threat Hunting',
    shortDescription:
      'Use hypotheses, telemetry, and adversary tradecraft to hunt across complex environments.',
    description:
      'A deeper course for operators who already know the defensive basics. The lessons focus on building hunt hypotheses, choosing telemetry, and iterating when early evidence does not confirm the expected path.',
    level: CourseLevel.ADVANCED,
    sections: [
      {
        position: 1,
        title: 'Hunt Design',
        lessons: [
          {
            position: 1,
            slug: 'ath-hypothesis-writing',
            title: 'Hypothesis Writing',
            summary:
              'Convert adversary behavior into a measurable question for the environment.',
            textContent:
              'A hunt hypothesis links behavior, environment, and evidence. It should be narrow enough to test and broad enough to catch a meaningful class of activity.\n\nStrong hypotheses avoid vendor-specific assumptions until the telemetry plan is clear. Start with the behavior, then translate into available data.',
            contentMode: LessonContentMode.TEXT,
          },
          {
            position: 2,
            slug: 'ath-telemetry-fit',
            title: 'Telemetry Fit',
            summary: 'Pick data sources that can answer the hunt question with useful confidence.',
            textContent:
              'Telemetry fit is about whether the data can prove or disprove the hypothesis. Missing fields, noisy collection, or short retention can all make a hunt inconclusive.\n\nRecord blind spots as outcomes. A hunt that reveals a coverage gap still improves the defensive program when that gap gets prioritized.',
            contentMode: LessonContentMode.HYBRID,
          },
        ],
      },
      {
        position: 2,
        title: 'Execution',
        lessons: [
          {
            position: 1,
            slug: 'ath-query-review',
            title: 'Query Review',
            summary:
              'Review hunt queries and result pivots through protected training media.',
            textContent:
              'The final video service can attach query walkthroughs here. The lesson model already knows this is video-first content with protected media.',
            contentMode: LessonContentMode.HYBRID,
          },
          {
            position: 2,
            slug: 'ath-findings',
            title: 'From Hunt to Finding',
            summary: 'Decide whether the result is benign, suspicious, or ready for response.',
            textContent:
              'Not every hunt hit is an incident. Compare the result against baseline behavior, asset context, timing, and known administrative activity.\n\nWhen evidence remains ambiguous, document the next query or data source needed. Good hunting is iterative, not theatrical.',
            contentMode: LessonContentMode.HYBRID,
          },
          {
            position: 3,
            slug: 'ath-retrospective',
            title: 'Hunt Retrospective',
            summary:
              'Capture what improved detection coverage and what still needs instrumentation.',
            textContent:
              'A retrospective turns a hunt into program improvement. Capture the hypothesis, data sources, queries, result, coverage gaps, and recommended next hunt.\n\nThe most useful output may be a new detection, a tuned alert, a documented blind spot, or a confirmed baseline.',
            contentMode: LessonContentMode.TEXT,
          },
        ],
      },
    ],
  },
];

const demoChallengeSeed: ChallengeSeed = {
  slug: 'phishing-awareness',
  title: 'Phishing Awareness Challenge',
  description:
    'Review the suspicious message details and identify the defensive training flag.',
  category: 'Defensive Analysis',
  difficulty: ChallengeDifficulty.EASY,
  points: 100,
  flag: 'CYBER_SAFE_PHISHING_101',
  hints: [
    {
      position: 1,
      title: 'Look at the ask',
      content: 'Focus on what the sender is pushing the recipient to do urgently.',
    },
    {
      position: 2,
      title: 'Check the training cue',
      content: 'The flag follows the all-caps CYBER_SAFE training phrase format.',
    },
  ],
};

const PROTECTED_DEMO_MEDIA_PROVIDER = 'protected-demo-media';
const DEFAULT_PROTECTED_DEMO_VIDEO_DURATION_SECONDS = 300;

function resolveLessonContentMode(lesson: LessonSeed) {
  return lesson.contentMode ?? LessonContentMode.TEXT;
}

function lessonHasVideoContent(contentMode: LessonContentMode) {
  return contentMode === LessonContentMode.VIDEO || contentMode === LessonContentMode.HYBRID;
}

function resolveLessonTextContent(lesson: LessonSeed, contentMode: LessonContentMode) {
  return contentMode === LessonContentMode.VIDEO ? null : lesson.textContent;
}

function resolveProtectedDemoMediaFields(lesson: LessonSeed, contentMode: LessonContentMode) {
  if (!lessonHasVideoContent(contentMode)) {
    return {
      videoProvider: null,
      videoAssetId: null,
      videoDurationSeconds: null,
    };
  }

  return {
    videoProvider: lesson.videoProvider ?? PROTECTED_DEMO_MEDIA_PROVIDER,
    videoAssetId: lesson.videoAssetId ?? `demo-${lesson.slug}`,
    videoDurationSeconds:
      lesson.videoDurationSeconds ?? DEFAULT_PROTECTED_DEMO_VIDEO_DURATION_SECONDS,
  };
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveSeededLessonSlugCandidates(courseSlug: string, lesson: LessonSeed) {
  return uniqueValues([
    lesson.slug,
    ...(LEGACY_LESSON_SLUGS_BY_COURSE_SLUG[courseSlug]?.[lesson.slug] ?? []),
    slugify(lesson.title),
  ]);
}

function buildLegacyReplacementSlug(lessonId: string) {
  return `legacy-${lessonId}`;
}

function hashFlag(flag: string) {
  return createHash('sha256').update(flag).digest('hex');
}

async function findSeededLessonTarget(input: {
  courseId: string;
  courseSlug: string;
  sectionId: string;
  lesson: LessonSeed;
}) {
  const lessonAtSeededPosition = await prisma.lesson.findUnique({
    where: {
      sectionId_position: {
        sectionId: input.sectionId,
        position: input.lesson.position,
      },
    },
    select: {
      id: true,
    },
  });

  if (lessonAtSeededPosition) {
    return lessonAtSeededPosition;
  }

  return prisma.lesson.findFirst({
    where: {
      courseId: input.courseId,
      slug: {
        in: resolveSeededLessonSlugCandidates(input.courseSlug, input.lesson),
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
    },
  });
}

async function freeConflictingSeededLessonSlug(input: {
  courseId: string;
  lessonSlug: string;
  targetLessonId: string | null;
}) {
  const slugOwner = await prisma.lesson.findUnique({
    where: {
      courseId_slug: {
        courseId: input.courseId,
        slug: input.lessonSlug,
      },
    },
    select: {
      id: true,
    },
  });

  if (!slugOwner || slugOwner.id === input.targetLessonId) {
    return;
  }

  await prisma.lesson.update({
    where: {
      id: slugOwner.id,
    },
    data: {
      slug: buildLegacyReplacementSlug(slugOwner.id),
      status: LessonStatus.DRAFT,
      publishedAt: null,
    },
  });
}

async function upsertSeededLesson(input: {
  courseId: string;
  courseSlug: string;
  sectionId: string;
  lesson: LessonSeed;
  publishedAt: Date;
}) {
  const contentMode = resolveLessonContentMode(input.lesson);
  const protectedMediaFields = resolveProtectedDemoMediaFields(input.lesson, contentMode);
  const targetLesson = await findSeededLessonTarget(input);

  await freeConflictingSeededLessonSlug({
    courseId: input.courseId,
    lessonSlug: input.lesson.slug,
    targetLessonId: targetLesson?.id ?? null,
  });

  const lessonData = {
    courseId: input.courseId,
    sectionId: input.sectionId,
    title: input.lesson.title,
    slug: input.lesson.slug,
    summary: input.lesson.summary,
    contentMode,
    status: LessonStatus.PUBLISHED,
    position: input.lesson.position,
    textContent: resolveLessonTextContent(input.lesson, contentMode),
    ...protectedMediaFields,
    publishedAt: input.publishedAt,
  };

  if (targetLesson) {
    return prisma.lesson.update({
      where: {
        id: targetLesson.id,
      },
      data: lessonData,
    });
  }

  return prisma.lesson.create({
    data: lessonData,
  });
}

async function upsertCourse(courseSeed: CourseSeed, publishedAt: Date) {
  const course = await prisma.course.upsert({
    where: {
      slug: courseSeed.slug,
    },
    update: {
      title: courseSeed.title,
      shortDescription: courseSeed.shortDescription,
      description: courseSeed.description,
      level: courseSeed.level,
      status: CourseStatus.PUBLISHED,
      publishedAt,
    },
    create: {
      title: courseSeed.title,
      slug: courseSeed.slug,
      shortDescription: courseSeed.shortDescription,
      description: courseSeed.description,
      level: courseSeed.level,
      status: CourseStatus.PUBLISHED,
      publishedAt,
    },
  });

  const seededLessonIds: string[] = [];

  for (const sectionSeed of courseSeed.sections) {
    const section = await prisma.section.upsert({
      where: {
        courseId_position: {
          courseId: course.id,
          position: sectionSeed.position,
        },
      },
      update: {
        title: sectionSeed.title,
        status: SectionStatus.PUBLISHED,
        publishedAt,
      },
      create: {
        courseId: course.id,
        title: sectionSeed.title,
        position: sectionSeed.position,
        status: SectionStatus.PUBLISHED,
        publishedAt,
      },
    });

    for (const lesson of sectionSeed.lessons) {
      const seededLesson = await upsertSeededLesson({
        courseId: course.id,
        courseSlug: course.slug,
        sectionId: section.id,
        lesson,
        publishedAt,
      });

      seededLessonIds.push(seededLesson.id);
    }
  }

  await prisma.lesson.updateMany({
    where: {
      courseId: course.id,
      id: {
        notIn: seededLessonIds,
      },
    },
    data: {
      status: LessonStatus.DRAFT,
      publishedAt: null,
    },
  });
}

async function upsertChallenge(challengeSeed: ChallengeSeed, publishedAt: Date) {
  const challenge = await prisma.challenge.upsert({
    where: {
      slug: challengeSeed.slug,
    },
    update: {
      title: challengeSeed.title,
      description: challengeSeed.description,
      category: challengeSeed.category,
      difficulty: challengeSeed.difficulty,
      points: challengeSeed.points,
      status: ChallengeStatus.PUBLISHED,
      flagHash: hashFlag(challengeSeed.flag),
      publishedAt,
      downloadName: null,
      downloadStorageKey: null,
      downloadSizeBytes: null,
    },
    create: {
      slug: challengeSeed.slug,
      title: challengeSeed.title,
      description: challengeSeed.description,
      category: challengeSeed.category,
      difficulty: challengeSeed.difficulty,
      points: challengeSeed.points,
      status: ChallengeStatus.PUBLISHED,
      flagHash: hashFlag(challengeSeed.flag),
      publishedAt,
    },
  });

  for (const hint of challengeSeed.hints) {
    await prisma.challengeHint.upsert({
      where: {
        challengeId_position: {
          challengeId: challenge.id,
          position: hint.position,
        },
      },
      update: {
        title: hint.title,
        content: hint.content,
      },
      create: {
        challengeId: challenge.id,
        position: hint.position,
        title: hint.title,
        content: hint.content,
      },
    });
  }
}

async function logSeedVerification() {
  const courseSlugs = courseSeeds.map((course) => course.slug);
  const courses = await prisma.course.findMany({
    where: {
      slug: {
        in: courseSlugs,
      },
    },
    orderBy: {
      slug: 'asc',
    },
    select: {
      slug: true,
      lessons: {
        orderBy: [
          {
            section: {
              position: 'asc',
            },
          },
          {
            position: 'asc',
          },
        ],
        select: {
          slug: true,
          contentMode: true,
          videoProvider: true,
          videoAssetId: true,
        },
      },
    },
  });

  for (const course of courses) {
    for (const lesson of course.lessons) {
      console.log(
        '[SEED_LESSON_VERIFY]',
        JSON.stringify({
          courseSlug: course.slug,
          lessonSlug: lesson.slug,
          contentMode: lesson.contentMode,
          hasVideo: Boolean(lesson.videoProvider && lesson.videoAssetId),
        }),
      );
    }
  }

  const challenge = await prisma.challenge.findUnique({
    where: {
      slug: demoChallengeSeed.slug,
    },
    select: {
      slug: true,
      title: true,
      status: true,
      points: true,
      difficulty: true,
      _count: {
        select: {
          hints: true,
        },
      },
    },
  });

  if (challenge) {
    console.log(
      '[SEED_CHALLENGE_VERIFY]',
      JSON.stringify({
        slug: challenge.slug,
        title: challenge.title,
        status: challenge.status,
        points: challenge.points,
        difficulty: challenge.difficulty,
        hintsCount: challenge._count.hints,
      }),
    );
  }
}

async function main() {
  const publishedAt = new Date();

  for (const courseSeed of courseSeeds) {
    await upsertCourse(courseSeed, publishedAt);
  }

  await upsertChallenge(demoChallengeSeed, publishedAt);

  await logSeedVerification();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
