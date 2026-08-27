import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  ActivityType,
  ChallengeDifficulty,
  ChallengeStatus,
  CourseLevel,
  CourseStatus,
  EnrollmentStatus,
  LessonContentMode,
  LessonStatus,
  Prisma,
  PrismaClient,
  QuizAttemptStatus,
  QuizStatus,
  QuizTargetType,
  SectionStatus,
  UserRole,
  UserStatus,
  type Course,
  type Lesson,
  type Section,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import type { createApplication } from '../../src/application';
import type { EmailService } from '../../src/auth/email.service';
import {
  buildIntegrationTestProcessEnvironment,
  IntegrationEnvironment,
  validateIntegrationEnvironment,
} from '../../scripts/integration/environment';
import {
  createVerifiedPrismaClient,
  createVerifiedRedisClient,
  IntegrationRedisClient,
} from '../../scripts/integration/targets';

const TEST_USER_AGENT = 'pf05f-student-assessment-integration/1.0';
const DEFAULT_PASSWORD = 'Integration-password-123!';
const SESSION_COOKIE_NAME = 'pf05e_session';

interface PublishedCourseFixture {
  course: Course;
  section: Section;
  lessons: Lesson[];
}

interface LessonDefinition {
  name: string;
  mode: LessonContentMode;
}

type QuizFixture = Prisma.QuizGetPayload<{
  include: {
    questions: {
      include: {
        choices: true;
      };
    };
  };
}>;

type QuizQuestionFixture = QuizFixture['questions'][number];

interface EnrollmentResponse {
  enrollment: {
    id: string;
    courseId: string;
    status: EnrollmentStatus;
  };
  enrolled: boolean;
  courseId: string;
}

interface CourseDetailResponse {
  course: {
    id: string;
    enrollmentStatus: string;
    progressPercent: number;
    completedLessons: number;
    totalLessons: number;
    sections: Array<{
      lessons: Array<{
        id: string;
        locked: boolean;
        unlocked: boolean;
        completed: boolean;
      }>;
    }>;
  };
}

interface LessonResponse {
  lesson: {
    id: string;
    contentMode: LessonContentMode;
    completionRequirements: {
      scrollPercent: number | null;
      watchPercent: number | null;
      readingTimeSeconds: number | null;
    };
  };
  watermark: {
    identity: string | null;
  };
  progress: {
    completed: boolean;
    completedAt: string | null;
  };
}

interface ProgressResponse {
  lessonProgress: {
    lessonId: string;
    scrollPercent: number;
    watchPercent: number;
    readingTimeSeconds: number;
    completed: boolean;
    completedAt: string | null;
  };
  progress: {
    completed: boolean;
    completedAt: string | null;
  };
  completion: {
    canComplete: boolean;
    engagementSatisfied: boolean;
    quizPassed: boolean;
    hasQuiz: boolean;
  };
}

interface QuizResponse {
  quiz: {
    id: string;
    passPercentage: number;
    totalQuestions: number;
  };
  questions: Array<{
    id: string;
    prompt: string;
    choices: Array<{
      id: string;
      choiceText: string;
    }>;
  }>;
}

interface AttemptResponse {
  attempt: {
    id: string;
    quizId: string;
    status: QuizAttemptStatus;
    correctAnswers: number | null;
    scorePercentage: number | null;
    passed: boolean | null;
  };
  reusedExistingAttempt: boolean;
}

interface QuizSubmissionResponse {
  result: {
    attemptId: string;
    quizId: string;
    totalQuestions: number;
    answeredQuestions: number;
    correctAnswers: number;
    scorePercentage: number;
    passed: boolean;
  };
  progress: {
    isCompleted: boolean;
    completedAt: string | null;
  } | null;
}

interface QuizResultResponse {
  result: QuizSubmissionResponse['result'];
}

interface ChallengeDetailResponse {
  challenge: {
    id: string;
    studentStatus: string;
    attemptsCount: number;
    pointsAwarded: number;
    hints: Array<{
      id: string;
      position: number;
      content: string | null;
      isUsed: boolean;
    }>;
  };
}

interface HintResponse {
  hint: {
    id: string;
    position: number;
    content: string;
    isUsed: boolean;
  };
  alreadyUsed: boolean;
}

interface ChallengeSubmissionResponse {
  correct: boolean;
  alreadySolved: boolean;
  pointsAwarded: number;
  attemptsCount: number;
  solvedAt: string | null;
}

interface ChallengeListResponse {
  challenges: Array<{
    id: string;
    studentStatus: string;
    attemptsCount: number;
    pointsAwarded: number;
  }>;
}

interface DashboardResponse {
  summary: {
    totalChallengeScore: number;
  };
  activeChallenge: {
    id: string;
    status: string;
    pointsAwarded: number;
  } | null;
  achievements: Array<{
    id: string;
    unlocked: boolean;
    isEarned: boolean;
  }>;
}

interface ActivityResponse {
  activities: Array<{
    activityType: ActivityType;
    referenceId: string;
    metadata: Record<string, boolean | number>;
  }>;
}

type ApplicationFactory = typeof createApplication;
type EmailServiceClass = typeof EmailService;

let environment: IntegrationEnvironment;
let prisma: PrismaClient;
let redis: IntegrationRedisClient;
let app: Awaited<ReturnType<typeof createApplication>>;
let passwordHash: string;
let originalFetch: typeof globalThis.fetch;
let externalHttpAttempts = 0;
let emailDeliveryAttempts = 0;

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const responseJson = <T>(response: { json(): unknown }): T => response.json() as T;

const assertPublicResponseIsSanitized = (
  response: { body: string },
  forbiddenValues: string[] = [],
): void => {
  for (const forbidden of [
    '"passwordHash"',
    '"tokenHash"',
    '"sessionId"',
    '"secretCiphertext"',
    '"secretIv"',
    '"secretTag"',
    '"flagHash"',
    '"submittedFlagHash"',
    '"firstCorrectAttemptId"',
    '"stack"',
    'P2002',
    'PrismaClient',
  ]) {
    assert.equal(response.body.includes(forbidden), false, `response exposed ${forbidden}`);
  }

  for (const forbiddenValue of forbiddenValues) {
    assert.equal(
      response.body.includes(forbiddenValue),
      false,
      'response exposed a forbidden fixture value',
    );
  }
};

const getCookiePair = (response: { headers: Record<string, unknown> }): string => {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  assert.equal(typeof value, 'string', 'login response did not set a session cookie');

  const cookiePair = (value as string).split(';', 1)[0]!;
  assert.ok(cookiePair.startsWith(`${SESSION_COOKIE_NAME}=`));
  return cookiePair;
};

const inject = (
  method: 'GET' | 'POST',
  url: string,
  options: { payload?: Record<string, unknown>; cookie?: string } = {},
) =>
  app.inject({
    method,
    url,
    headers: {
      'user-agent': TEST_USER_AGENT,
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  });

const deleteRedisKeys = async (patterns: string[]): Promise<void> => {
  for (const pattern of patterns) {
    const keys: string[] = [];
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key);
    }

    if (keys.length > 0) {
      await redis.del(keys);
    }
  }
};

const cleanupStudentRedisState = async (): Promise<void> =>
  deleteRedisKeys([
    'session:*',
    'user-auth-state:*',
    'rate-limit:login:*',
    'rate-limit:flag:*',
  ]);

const createStudentSession = async (email: string) => {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });
  const login = await inject('POST', '/api/auth/login', {
    payload: { email, password: DEFAULT_PASSWORD },
  });

  assert.equal(login.statusCode, 200);
  assertPublicResponseIsSanitized(login);
  return { cookie: getCookiePair(login), user };
};

const createPublishedCourse = async (
  name: string,
  lessonDefinitions: LessonDefinition[],
): Promise<PublishedCourseFixture> => {
  const publishedAt = new Date();
  const course = await prisma.course.create({
    data: {
      title: `PF-05F ${name}`,
      slug: `pf05f-${name}`,
      shortDescription: 'PF-05F integration fixture',
      description: 'Deterministic student learning integration fixture',
      level: CourseLevel.BEGINNER,
      status: CourseStatus.PUBLISHED,
      publishedAt,
    },
  });
  const section = await prisma.section.create({
    data: {
      courseId: course.id,
      title: 'PF-05F section',
      position: 1,
      status: SectionStatus.PUBLISHED,
      publishedAt,
    },
  });
  const lessons: Lesson[] = [];

  for (const [index, definition] of lessonDefinitions.entries()) {
    const hasText =
      definition.mode === LessonContentMode.TEXT ||
      definition.mode === LessonContentMode.HYBRID;
    const hasVideo =
      definition.mode === LessonContentMode.VIDEO ||
      definition.mode === LessonContentMode.HYBRID;
    lessons.push(
      await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: `PF-05F ${definition.name}`,
          slug: `pf05f-${name}-${definition.name}`,
          summary: 'PF-05F deterministic lesson',
          contentMode: definition.mode,
          status: LessonStatus.PUBLISHED,
          position: index + 1,
          textContent: hasText ? `Safe lesson text for ${definition.name}` : null,
          videoProvider: hasVideo ? 'integration-video-provider' : null,
          videoAssetId: hasVideo ? `private-asset-${name}-${definition.name}` : null,
          videoDurationSeconds: hasVideo ? 120 : null,
          publishedAt,
        },
      }),
    );
  }

  return { course, section, lessons };
};

const createPublishedQuiz = async (
  name: string,
  courseId: string,
  lessonId: string | null,
  passPercentage = 75,
): Promise<QuizFixture> =>
  prisma.quiz.create({
    data: {
      courseId,
      lessonId,
      targetType: lessonId ? QuizTargetType.LESSON : QuizTargetType.COURSE,
      title: `PF-05F ${name}`,
      description: 'PF-05F deterministic quiz',
      status: QuizStatus.PUBLISHED,
      passPercentage,
      publishedAt: new Date(),
      questions: {
        create: [
          {
            prompt: `PF-05F ${name} question one`,
            position: 1,
            choices: {
              create: [
                { choiceText: `${name} q1 correct`, position: 1, isCorrect: true },
                { choiceText: `${name} q1 wrong`, position: 2, isCorrect: false },
              ],
            },
          },
          {
            prompt: `PF-05F ${name} question two`,
            position: 2,
            choices: {
              create: [
                { choiceText: `${name} q2 wrong`, position: 1, isCorrect: false },
                { choiceText: `${name} q2 correct`, position: 2, isCorrect: true },
              ],
            },
          },
        ],
      },
    },
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: {
          choices: {
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  });

const createPublishedChallenge = async (flag: string) =>
  prisma.challenge.create({
    data: {
      title: 'PF-05F Phishing Awareness',
      slug: 'phishing-awareness',
      description: 'PF-05F challenge fixture',
      category: 'phishing',
      difficulty: ChallengeDifficulty.MEDIUM,
      points: 240,
      status: ChallengeStatus.PUBLISHED,
      flagHash: sha256(flag),
      downloadName: 'pf05f-evidence.txt',
      downloadStorageKey: 'private/pf05f/evidence-storage-key',
      downloadSizeBytes: 128,
      publishedAt: new Date(),
      hints: {
        create: [
          {
            position: 1,
            title: 'Inspect the sender',
            content: 'PF-05F private hint one',
          },
          {
            position: 2,
            title: 'Inspect the link',
            content: 'PF-05F private hint two',
          },
        ],
      },
    },
    include: {
      hints: {
        orderBy: { position: 'asc' },
      },
    },
  });

const enroll = async (cookie: string, courseId: string) => {
  const response = await inject('POST', `/api/student/courses/${courseId}/enroll`, {
    cookie,
  });
  assert.equal(response.statusCode, 201);
  return response;
};

const correctChoice = (question: QuizQuestionFixture) => {
  const choice = question.choices.find((candidate) => candidate.isCorrect);
  assert.ok(choice);
  return choice;
};

const wrongChoice = (question: QuizQuestionFixture) => {
  const choice = question.choices.find((candidate) => !candidate.isCorrect);
  assert.ok(choice);
  return choice;
};

describe('student learning and assessment integration', () => {
  before(async () => {
    Object.assign(process.env, buildIntegrationTestProcessEnvironment(process.env));
    environment = validateIntegrationEnvironment(process.env);
    assert.equal(process.env.OLLAMA_ENABLED, 'false');
    assert.equal(process.env.GEMINI_ENABLED, 'false');
    assert.equal(process.env.MAIL_HOST, '');
    assert.equal(process.env.RESEND_API_KEY, '');

    originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      externalHttpAttempts += 1;
      throw new Error('External HTTP is forbidden during integration tests');
    }) as typeof globalThis.fetch;

    prisma = await createVerifiedPrismaClient(environment);
    redis = await createVerifiedRedisClient(environment);
    await cleanupStudentRedisState();
    passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 4);

    const compiledApplicationUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'dist', 'application.js'),
    ).href;
    const compiledEmailUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'dist', 'auth', 'email.service.js'),
    ).href;
    const compiledApplicationModule = (await import(compiledApplicationUrl)) as {
      createApplication: ApplicationFactory;
    };
    const compiledEmailModule = (await import(compiledEmailUrl)) as {
      EmailService: EmailServiceClass;
    };

    app = await compiledApplicationModule.createApplication();
    app.useLogger(false);

    const emailService = app.get(compiledEmailModule.EmailService);
    emailService.sendEmailVerification = async () => {
      emailDeliveryAttempts += 1;
      throw new Error('Email delivery is forbidden during student integration tests');
    };
    emailService.sendPasswordResetEmail = async () => {
      emailDeliveryAttempts += 1;
      throw new Error('Email delivery is forbidden during student integration tests');
    };

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  after(async () => {
    try {
      if (app) {
        await app.close();
      }
      if (redis?.isOpen) {
        await cleanupStudentRedisState();
      }
      assert.equal(externalHttpAttempts, 0, 'an external HTTP call was attempted');
      assert.equal(emailDeliveryAttempts, 0, 'an email delivery was attempted');
    } finally {
      globalThis.fetch = originalFetch;
      if (prisma) {
        await prisma.$disconnect();
      }
      if (redis?.isOpen) {
        await redis.quit();
      }
    }
  });

  it('enforces protected boundaries and session-owned idempotent enrollment', async () => {
    const fixture = await createPublishedCourse('enrollment', [
      { name: 'first', mode: LessonContentMode.TEXT },
      { name: 'second', mode: LessonContentMode.TEXT },
    ]);
    const studentA = await createStudentSession('pf05f-enrollment-a@example.invalid');
    const studentB = await createStudentSession('pf05f-enrollment-b@example.invalid');

    const unauthenticatedResponses = await Promise.all([
      inject('GET', '/api/student/dashboard'),
      inject('POST', `/api/student/courses/${fixture.course.id}/enroll`),
      inject('GET', `/api/quizzes/${randomUUID()}`),
      inject('GET', `/api/challenges/${randomUUID()}`),
    ]);
    assert.equal(
      unauthenticatedResponses.every((response) => response.statusCode === 401),
      true,
    );
    assert.equal(await prisma.enrollment.count({ where: { courseId: fixture.course.id } }), 0);

    const adminBoundary = await inject('GET', '/api/users', {
      cookie: studentA.cookie,
    });
    assert.equal(adminBoundary.statusCode, 403);

    const firstEnrollment = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/enroll`,
      {
        cookie: studentA.cookie,
        payload: {
          userId: studentB.user.id,
          enrollmentId: randomUUID(),
          status: EnrollmentStatus.COMPLETED,
        },
      },
    );
    assert.equal(firstEnrollment.statusCode, 201);
    const firstEnrollmentBody = responseJson<EnrollmentResponse>(firstEnrollment);
    assert.equal(firstEnrollmentBody.enrolled, true);
    assert.equal(firstEnrollmentBody.courseId, fixture.course.id);
    assertPublicResponseIsSanitized(firstEnrollment, [studentB.user.id]);

    const persistedEnrollment = await prisma.enrollment.findUniqueOrThrow({
      where: {
        userId_courseId: {
          userId: studentA.user.id,
          courseId: fixture.course.id,
        },
      },
    });
    assert.equal(persistedEnrollment.id, firstEnrollmentBody.enrollment.id);
    assert.equal(persistedEnrollment.userId, studentA.user.id);
    assert.equal(persistedEnrollment.status, EnrollmentStatus.ACTIVE);
    assert.equal(
      await prisma.enrollment.count({
        where: { userId: studentB.user.id, courseId: fixture.course.id },
      }),
      0,
    );

    const repeatedEnrollment = await enroll(studentA.cookie, fixture.course.id);
    const repeatedEnrollmentBody = responseJson<EnrollmentResponse>(repeatedEnrollment);
    assert.equal(repeatedEnrollmentBody.enrolled, false);
    assert.equal(repeatedEnrollmentBody.enrollment.id, persistedEnrollment.id);
    assert.equal(
      await prisma.enrollment.count({
        where: { userId: studentA.user.id, courseId: fixture.course.id },
      }),
      1,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: fixture.course.id,
          activityType: ActivityType.COURSE_ENROLLED,
        },
      }),
      1,
    );

    const invalidCourseEnrollment = await inject(
      'POST',
      `/api/student/courses/${randomUUID()}/enroll`,
      { cookie: studentA.cookie },
    );
    assert.equal(invalidCourseEnrollment.statusCode, 404);
    assertPublicResponseIsSanitized(invalidCourseEnrollment);
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          activityType: ActivityType.COURSE_ENROLLED,
        },
      }),
      1,
    );

    const studentADetail = await inject(
      'GET',
      `/api/student/courses/${fixture.course.id}`,
      { cookie: studentA.cookie },
    );
    const studentBDetail = await inject(
      'GET',
      `/api/student/courses/${fixture.course.id}`,
      { cookie: studentB.cookie },
    );
    assert.equal(studentADetail.statusCode, 200);
    assert.equal(studentBDetail.statusCode, 200);
    const studentACourse = responseJson<CourseDetailResponse>(studentADetail).course;
    const studentBCourse = responseJson<CourseDetailResponse>(studentBDetail).course;
    assert.equal(studentACourse.enrollmentStatus, 'ENROLLED');
    assert.equal(studentACourse.sections[0]!.lessons[0]!.unlocked, true);
    assert.equal(studentACourse.sections[0]!.lessons[1]!.locked, true);
    assert.equal(studentBCourse.enrollmentStatus, 'NOT_ENROLLED');
    assert.equal(studentBCourse.sections[0]!.lessons.every((lesson) => lesson.locked), true);
    assertPublicResponseIsSanitized(studentADetail, [studentB.user.email]);
    assertPublicResponseIsSanitized(studentBDetail, [persistedEnrollment.id, studentA.user.email]);
  });

  it('enforces sequential server-owned progress and text, video, and hybrid thresholds', async () => {
    const fixture = await createPublishedCourse('progress', [
      { name: 'text', mode: LessonContentMode.TEXT },
      { name: 'video', mode: LessonContentMode.VIDEO },
      { name: 'hybrid', mode: LessonContentMode.HYBRID },
    ]);
    const foreignFixture = await createPublishedCourse('progress-foreign', [
      { name: 'foreign', mode: LessonContentMode.TEXT },
    ]);
    const studentA = await createStudentSession('pf05f-progress-a@example.invalid');
    const studentB = await createStudentSession('pf05f-progress-b@example.invalid');
    const enrollmentResponse = await enroll(studentA.cookie, fixture.course.id);
    const enrollmentId = responseJson<EnrollmentResponse>(enrollmentResponse).enrollment.id;
    const [textLesson, videoLesson, hybridLesson] = fixture.lessons;

    const lockedLesson = await inject(
      'GET',
      `/api/student/courses/${fixture.course.id}/lessons/${videoLesson!.id}`,
      { cookie: studentA.cookie },
    );
    assert.equal(lockedLesson.statusCode, 403);
    assert.equal(
      await prisma.lessonProgress.count({ where: { lessonId: videoLesson!.id } }),
      0,
    );

    const forgedProgress = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${textLesson!.id}/progress`,
      {
        cookie: studentA.cookie,
        payload: {
          userId: studentB.user.id,
          enrollmentId: randomUUID(),
          scrollPercent: 100,
          readingTimeSeconds: 100,
        },
      },
    );
    assert.equal(forgedProgress.statusCode, 400);
    assert.equal(await prisma.lessonProgress.count({ where: { lessonId: textLesson!.id } }), 0);

    const mismatchedLesson = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${foreignFixture.lessons[0]!.id}/progress`,
      {
        cookie: studentA.cookie,
        payload: { scrollPercent: 100, readingTimeSeconds: 100 },
      },
    );
    assert.equal(mismatchedLesson.statusCode, 404);
    assert.equal(
      await prisma.lessonProgress.count({
        where: { lessonId: foreignFixture.lessons[0]!.id },
      }),
      0,
    );

    const studentBAccess = await inject(
      'GET',
      `/api/student/courses/${fixture.course.id}/lessons/${textLesson!.id}`,
      { cookie: studentB.cookie },
    );
    assert.equal(studentBAccess.statusCode, 403);
    assert.equal(
      await prisma.lessonProgress.count({
        where: { userId: studentB.user.id, courseId: fixture.course.id },
      }),
      0,
    );

    const openedTextLesson = await inject(
      'GET',
      `/api/student/courses/${fixture.course.id}/lessons/${textLesson!.id}`,
      { cookie: studentA.cookie },
    );
    assert.equal(openedTextLesson.statusCode, 200);
    const openedTextBody = responseJson<LessonResponse>(openedTextLesson);
    assert.equal(openedTextBody.watermark.identity, studentA.user.email);
    assert.deepEqual(openedTextBody.lesson.completionRequirements, {
      scrollPercent: 90,
      watchPercent: null,
      readingTimeSeconds: 10,
    });
    assert.equal(openedTextBody.progress.completed, false);
    assertPublicResponseIsSanitized(openedTextLesson, [studentB.user.email]);

    const markOnly = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${textLesson!.id}/progress`,
      { cookie: studentA.cookie, payload: { markComplete: true } },
    );
    assert.equal(responseJson<ProgressResponse>(markOnly).progress.completed, false);

    const belowTextThreshold = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${textLesson!.id}/progress`,
      {
        cookie: studentA.cookie,
        payload: {
          completionRequested: true,
          scrollPercent: 90,
          readingTimeSeconds: 9,
        },
      },
    );
    const belowTextBody = responseJson<ProgressResponse>(belowTextThreshold);
    assert.equal(belowTextBody.completion.engagementSatisfied, false);
    assert.equal(belowTextBody.progress.completed, false);

    const completeText = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${textLesson!.id}/progress`,
      {
        cookie: studentA.cookie,
        payload: { completed: true, scrollPercent: 90, readingTimeSeconds: 10 },
      },
    );
    const completeTextBody = responseJson<ProgressResponse>(completeText);
    assert.equal(completeTextBody.completion.canComplete, true);
    assert.equal(completeTextBody.progress.completed, true);
    assert.equal(typeof completeTextBody.progress.completedAt, 'string');
    const textCompletedAt = completeTextBody.progress.completedAt;

    const repeatText = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${textLesson!.id}/progress`,
      {
        cookie: studentA.cookie,
        payload: { markComplete: true, scrollPercent: 0, readingTimeSeconds: 0 },
      },
    );
    const repeatTextBody = responseJson<ProgressResponse>(repeatText);
    assert.equal(repeatTextBody.progress.completedAt, textCompletedAt);
    assert.equal(repeatTextBody.lessonProgress.scrollPercent, 90);
    assert.equal(repeatTextBody.lessonProgress.readingTimeSeconds, 10);

    const openedVideoLesson = await inject(
      'GET',
      `/api/student/courses/${fixture.course.id}/lessons/${videoLesson!.id}`,
      { cookie: studentA.cookie },
    );
    assert.equal(openedVideoLesson.statusCode, 200);
    assert.deepEqual(
      responseJson<LessonResponse>(openedVideoLesson).lesson.completionRequirements,
      { scrollPercent: null, watchPercent: 85, readingTimeSeconds: null },
    );
    assertPublicResponseIsSanitized(openedVideoLesson, [videoLesson!.videoAssetId!]);

    const belowVideo = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${videoLesson!.id}/progress`,
      { cookie: studentA.cookie, payload: { markComplete: true, watchPercent: 84 } },
    );
    assert.equal(responseJson<ProgressResponse>(belowVideo).progress.completed, false);
    const completeVideo = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${videoLesson!.id}/progress`,
      { cookie: studentA.cookie, payload: { watchPercent: 85 } },
    );
    assert.equal(responseJson<ProgressResponse>(completeVideo).progress.completed, true);

    const openedHybridLesson = await inject(
      'GET',
      `/api/student/courses/${fixture.course.id}/lessons/${hybridLesson!.id}`,
      { cookie: studentA.cookie },
    );
    assert.equal(openedHybridLesson.statusCode, 200);
    assert.deepEqual(
      responseJson<LessonResponse>(openedHybridLesson).lesson.completionRequirements,
      { scrollPercent: 90, watchPercent: 85, readingTimeSeconds: 10 },
    );
    assertPublicResponseIsSanitized(openedHybridLesson, [hybridLesson!.videoAssetId!]);

    const belowHybrid = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${hybridLesson!.id}/progress`,
      {
        cookie: studentA.cookie,
        payload: { scrollPercent: 90, watchPercent: 85, readingTimeSeconds: 9 },
      },
    );
    assert.equal(responseJson<ProgressResponse>(belowHybrid).progress.completed, false);
    const completeHybrid = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${hybridLesson!.id}/progress`,
      {
        cookie: studentA.cookie,
        payload: { scrollPercent: 90, watchPercent: 85, readingTimeSeconds: 10 },
      },
    );
    assert.equal(responseJson<ProgressResponse>(completeHybrid).progress.completed, true);

    const progressRecords = await prisma.lessonProgress.findMany({
      where: { userId: studentA.user.id, courseId: fixture.course.id },
    });
    assert.equal(progressRecords.length, 3);
    assert.equal(progressRecords.every((progress) => progress.enrollmentId === enrollmentId), true);
    assert.equal(progressRecords.every((progress) => progress.completedAt !== null), true);
    assert.equal(
      await prisma.lessonProgress.count({
        where: { userId: studentB.user.id, courseId: fixture.course.id },
      }),
      0,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          activityType: ActivityType.LESSON_VIEWED,
          entityId: { in: fixture.lessons.map((lesson) => lesson.id) },
        },
      }),
      3,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          activityType: ActivityType.LESSON_COMPLETED,
          entityId: { in: fixture.lessons.map((lesson) => lesson.id) },
        },
      }),
      3,
    );

    const persistedEnrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
    });
    assert.equal(persistedEnrollment.status, EnrollmentStatus.COMPLETED);
    assert.ok(persistedEnrollment.completedAt);

    const finalCourseDetail = await inject(
      'GET',
      `/api/student/courses/${fixture.course.id}`,
      { cookie: studentA.cookie },
    );
    const finalCourse = responseJson<CourseDetailResponse>(finalCourseDetail).course;
    assert.equal(finalCourse.enrollmentStatus, 'COMPLETED');
    assert.equal(finalCourse.progressPercent, 100);
    assert.equal(finalCourse.completedLessons, 3);
    assert.equal(
      finalCourse.sections[0]!.lessons.every((lesson) => lesson.completed && lesson.unlocked),
      true,
    );
  });

  it('keeps quiz answers secret and calculates fail, retake, and pass state server-side', async () => {
    const fixture = await createPublishedCourse('quiz', [
      { name: 'hybrid-quiz', mode: LessonContentMode.HYBRID },
    ]);
    const lesson = fixture.lessons[0]!;
    const quiz = await createPublishedQuiz('lesson-quiz', fixture.course.id, lesson.id);
    const foreignQuiz = await createPublishedQuiz('foreign-quiz', fixture.course.id, null);
    const studentA = await createStudentSession('pf05f-quiz-a@example.invalid');
    const studentB = await createStudentSession('pf05f-quiz-b@example.invalid');
    await enroll(studentA.cookie, fixture.course.id);
    await enroll(studentB.cookie, fixture.course.id);

    const openedLesson = await inject(
      'GET',
      `/api/student/courses/${fixture.course.id}/lessons/${lesson.id}`,
      { cookie: studentA.cookie },
    );
    assert.equal(openedLesson.statusCode, 200);
    const engagementBeforeQuiz = await inject(
      'POST',
      `/api/student/courses/${fixture.course.id}/lessons/${lesson.id}/progress`,
      {
        cookie: studentA.cookie,
        payload: { scrollPercent: 90, watchPercent: 85, readingTimeSeconds: 10 },
      },
    );
    const engagementBody = responseJson<ProgressResponse>(engagementBeforeQuiz);
    assert.equal(engagementBody.completion.engagementSatisfied, true);
    assert.equal(engagementBody.completion.hasQuiz, true);
    assert.equal(engagementBody.completion.quizPassed, false);
    assert.equal(engagementBody.progress.completed, false);

    const quizResponse = await inject('GET', `/api/quizzes/${quiz.id}`, {
      cookie: studentA.cookie,
    });
    assert.equal(quizResponse.statusCode, 200);
    const publicQuiz = responseJson<QuizResponse>(quizResponse);
    assert.equal(publicQuiz.quiz.passPercentage, 75);
    assert.equal(publicQuiz.quiz.totalQuestions, 2);
    assert.equal(publicQuiz.questions.length, 2);
    for (const forbiddenField of ['"isCorrect"', '"correctChoiceId"', '"answerKey"']) {
      assert.equal(quizResponse.body.includes(forbiddenField), false);
    }
    assertPublicResponseIsSanitized(quizResponse);

    const firstStart = await inject('POST', `/api/quizzes/${quiz.id}/attempts/start`, {
      cookie: studentA.cookie,
    });
    assert.equal(firstStart.statusCode, 201);
    const firstAttempt = responseJson<AttemptResponse>(firstStart);
    assert.equal(firstAttempt.reusedExistingAttempt, false);
    assert.equal(firstAttempt.attempt.status, QuizAttemptStatus.IN_PROGRESS);

    const repeatedStart = await inject('POST', `/api/quizzes/${quiz.id}/attempts/start`, {
      cookie: studentA.cookie,
    });
    const repeatedStartBody = responseJson<AttemptResponse>(repeatedStart);
    assert.equal(repeatedStart.statusCode, 201);
    assert.equal(repeatedStartBody.reusedExistingAttempt, true);
    assert.equal(repeatedStartBody.attempt.id, firstAttempt.attempt.id);
    assert.equal(
      await prisma.quizAttempt.count({
        where: { userId: studentA.user.id, quizId: quiz.id },
      }),
      1,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: quiz.id,
          activityType: ActivityType.QUIZ_STARTED,
        },
      }),
      1,
    );

    const [questionOne, questionTwo] = quiz.questions;
    const questionOneCorrect = correctChoice(questionOne!);
    const questionTwoCorrect = correctChoice(questionTwo!);
    const questionTwoWrong = wrongChoice(questionTwo!);
    const validCorrectAnswers = [
      { questionId: questionOne!.id, choiceId: questionOneCorrect.id },
      { questionId: questionTwo!.id, choiceId: questionTwoCorrect.id },
    ];

    const studentBSubmit = await inject(
      'POST',
      `/api/quiz-attempts/${firstAttempt.attempt.id}/submit`,
      { cookie: studentB.cookie, payload: { answers: validCorrectAnswers } },
    );
    const studentBResult = await inject(
      'GET',
      `/api/quiz-attempts/${firstAttempt.attempt.id}/result`,
      { cookie: studentB.cookie },
    );
    assert.equal(studentBSubmit.statusCode, 404);
    assert.equal(studentBResult.statusCode, 404);

    const forgedScore = await inject(
      'POST',
      `/api/quiz-attempts/${firstAttempt.attempt.id}/submit`,
      {
        cookie: studentA.cookie,
        payload: {
          answers: validCorrectAnswers,
          scorePercentage: 100,
          passed: true,
          pointsAwarded: 999_999,
        },
      },
    );
    assert.equal(forgedScore.statusCode, 400);

    const randomChoiceSubmission = await inject(
      'POST',
      `/api/quiz-attempts/${firstAttempt.attempt.id}/submit`,
      {
        cookie: studentA.cookie,
        payload: {
          answers: [
            { questionId: questionOne!.id, choiceId: randomUUID() },
            { questionId: questionTwo!.id, choiceId: questionTwoCorrect.id },
          ],
        },
      },
    );
    assert.equal(randomChoiceSubmission.statusCode, 400);

    const foreignChoice = correctChoice(foreignQuiz.questions[0]!);
    const foreignQuizChoiceSubmission = await inject(
      'POST',
      `/api/quiz-attempts/${firstAttempt.attempt.id}/submit`,
      {
        cookie: studentA.cookie,
        payload: {
          answers: [
            { questionId: questionOne!.id, choiceId: foreignChoice.id },
            { questionId: questionTwo!.id, choiceId: questionTwoCorrect.id },
          ],
        },
      },
    );
    assert.equal(foreignQuizChoiceSubmission.statusCode, 400);
    assert.equal(
      await prisma.quizAttemptAnswer.count({
        where: { attemptId: firstAttempt.attempt.id },
      }),
      0,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: quiz.id,
          activityType: ActivityType.QUIZ_SUBMITTED,
        },
      }),
      0,
    );

    const failedSubmission = await inject(
      'POST',
      `/api/quiz-attempts/${firstAttempt.attempt.id}/submit`,
      {
        cookie: studentA.cookie,
        payload: {
          answers: [
            { questionId: questionOne!.id, choiceId: questionOneCorrect.id },
            { questionId: questionTwo!.id, choiceId: questionTwoWrong.id },
          ],
        },
      },
    );
    assert.equal(failedSubmission.statusCode, 201);
    const failedBody = responseJson<QuizSubmissionResponse>(failedSubmission);
    assert.equal(failedBody.result.correctAnswers, 1);
    assert.equal(failedBody.result.scorePercentage, 50);
    assert.equal(failedBody.result.passed, false);
    assert.equal(failedBody.progress?.isCompleted, false);
    assertPublicResponseIsSanitized(failedSubmission);
    assert.equal(failedSubmission.body.includes('"isCorrect"'), false);
    assert.equal(failedSubmission.body.includes('"selectedChoiceText"'), false);

    const persistedFailure = await prisma.quizAttempt.findUniqueOrThrow({
      where: { id: firstAttempt.attempt.id },
      include: { answers: { orderBy: { questionId: 'asc' } } },
    });
    assert.equal(persistedFailure.status, QuizAttemptStatus.SUBMITTED);
    assert.equal(persistedFailure.correctAnswers, 1);
    assert.equal(persistedFailure.scorePercentage, 50);
    assert.equal(persistedFailure.passed, false);
    assert.equal(persistedFailure.answers.filter((answer) => answer.isCorrect).length, 1);

    const ownFailedResult = await inject(
      'GET',
      `/api/quiz-attempts/${firstAttempt.attempt.id}/result`,
      { cookie: studentA.cookie },
    );
    assert.equal(ownFailedResult.statusCode, 200);
    assert.equal(responseJson<QuizResultResponse>(ownFailedResult).result.scorePercentage, 50);
    assert.equal(responseJson<QuizResultResponse>(ownFailedResult).result.passed, false);

    const retake = await inject('POST', `/api/quizzes/${quiz.id}/attempts/start`, {
      cookie: studentA.cookie,
    });
    assert.equal(retake.statusCode, 201);
    const retakeBody = responseJson<AttemptResponse>(retake);
    assert.equal(retakeBody.reusedExistingAttempt, false);
    assert.equal(retakeBody.attempt.id, firstAttempt.attempt.id);
    assert.equal(retakeBody.attempt.status, QuizAttemptStatus.IN_PROGRESS);
    assert.equal(retakeBody.attempt.correctAnswers, null);
    assert.equal(retakeBody.attempt.scorePercentage, null);
    assert.equal(retakeBody.attempt.passed, null);
    assert.equal(
      await prisma.quizAttemptAnswer.count({
        where: { attemptId: firstAttempt.attempt.id },
      }),
      0,
    );

    const passedSubmission = await inject(
      'POST',
      `/api/quiz-attempts/${firstAttempt.attempt.id}/submit`,
      { cookie: studentA.cookie, payload: { answers: validCorrectAnswers } },
    );
    assert.equal(passedSubmission.statusCode, 201);
    const passedBody = responseJson<QuizSubmissionResponse>(passedSubmission);
    assert.equal(passedBody.result.correctAnswers, 2);
    assert.equal(passedBody.result.scorePercentage, 100);
    assert.equal(passedBody.result.passed, true);
    assert.equal(passedBody.progress?.isCompleted, true);
    assert.equal(typeof passedBody.progress?.completedAt, 'string');

    const finalizedReplay = await inject(
      'POST',
      `/api/quiz-attempts/${firstAttempt.attempt.id}/submit`,
      { cookie: studentA.cookie, payload: { answers: validCorrectAnswers } },
    );
    const startAfterPass = await inject('POST', `/api/quizzes/${quiz.id}/attempts/start`, {
      cookie: studentA.cookie,
    });
    assert.equal(finalizedReplay.statusCode, 409);
    assert.equal(startAfterPass.statusCode, 409);
    assertPublicResponseIsSanitized(finalizedReplay);

    const persistedPass = await prisma.quizAttempt.findUniqueOrThrow({
      where: { id: firstAttempt.attempt.id },
      include: { answers: true },
    });
    assert.equal(persistedPass.scorePercentage, 100);
    assert.equal(persistedPass.passed, true);
    assert.equal(persistedPass.answers.length, 2);
    assert.equal(persistedPass.answers.every((answer) => answer.isCorrect), true);
    assert.equal(
      await prisma.quizAttempt.count({
        where: { userId: studentA.user.id, quizId: quiz.id },
      }),
      1,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: quiz.id,
          activityType: ActivityType.QUIZ_STARTED,
        },
      }),
      2,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: quiz.id,
          activityType: ActivityType.QUIZ_SUBMITTED,
        },
      }),
      2,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: quiz.id,
          activityType: ActivityType.QUIZ_PASSED,
        },
      }),
      1,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: lesson.id,
          activityType: ActivityType.LESSON_COMPLETED,
        },
      }),
      1,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentB.user.id,
          entityId: quiz.id,
        },
      }),
      0,
    );
  });

  it('protects challenge flags and per-student hints, activity, points, and achievements', async () => {
    const correctFlag = 'PF05F{Case-Sensitive-Flag}';
    const caseVariant = correctFlag.toLowerCase();
    const challenge = await createPublishedChallenge(correctFlag);
    const studentA = await createStudentSession('pf05f-challenge-a@example.invalid');
    const studentB = await createStudentSession('pf05f-challenge-b@example.invalid');

    const initialA = await inject('GET', `/api/challenges/${challenge.id}`, {
      cookie: studentA.cookie,
    });
    const initialB = await inject('GET', `/api/challenges/${challenge.id}`, {
      cookie: studentB.cookie,
    });
    assert.equal(initialA.statusCode, 200);
    assert.equal(initialB.statusCode, 200);
    const initialABody = responseJson<ChallengeDetailResponse>(initialA).challenge;
    const initialBBody = responseJson<ChallengeDetailResponse>(initialB).challenge;
    assert.equal(initialABody.studentStatus, 'not_started');
    assert.equal(initialABody.hints.every((hint) => hint.content === null), true);
    assert.equal(initialBBody.hints.every((hint) => hint.content === null), true);
    assertPublicResponseIsSanitized(initialA, [correctFlag, challenge.flagHash]);
    assertPublicResponseIsSanitized(initialB, [correctFlag, challenge.flagHash]);

    const hintTwo = await inject(
      'POST',
      `/api/challenges/${challenge.id}/hints/2/use`,
      { cookie: studentA.cookie },
    );
    assert.equal(hintTwo.statusCode, 201);
    const hintTwoBody = responseJson<HintResponse>(hintTwo);
    assert.equal(hintTwoBody.hint.position, 2);
    assert.equal(hintTwoBody.hint.content, 'PF-05F private hint two');
    assert.equal(hintTwoBody.alreadyUsed, false);

    const repeatedHintTwo = await inject(
      'POST',
      `/api/challenges/${challenge.id}/hints/2/use`,
      { cookie: studentA.cookie },
    );
    assert.equal(repeatedHintTwo.statusCode, 201);
    assert.equal(responseJson<HintResponse>(repeatedHintTwo).alreadyUsed, true);

    const invalidHint = await inject(
      'POST',
      `/api/challenges/${challenge.id}/hints/3/use`,
      { cookie: studentA.cookie },
    );
    assert.equal(invalidHint.statusCode, 404);
    assert.equal(
      await prisma.challengeHintUsage.count({
        where: { userId: studentA.user.id, challengeHint: { challengeId: challenge.id } },
      }),
      1,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: challenge.id,
          activityType: ActivityType.CHALLENGE_HINT_USED,
        },
      }),
      1,
    );

    const hintOneForB = await inject(
      'POST',
      `/api/challenges/${challenge.id}/hints/1/use`,
      { cookie: studentB.cookie },
    );
    assert.equal(hintOneForB.statusCode, 201);
    const afterHintsA = responseJson<ChallengeDetailResponse>(
      await inject('GET', `/api/challenges/${challenge.id}`, { cookie: studentA.cookie }),
    ).challenge;
    const afterHintsB = responseJson<ChallengeDetailResponse>(
      await inject('GET', `/api/challenges/${challenge.id}`, { cookie: studentB.cookie }),
    ).challenge;
    assert.equal(afterHintsA.hints.find((hint) => hint.position === 1)?.isUsed, false);
    assert.equal(afterHintsA.hints.find((hint) => hint.position === 2)?.isUsed, true);
    assert.equal(afterHintsB.hints.find((hint) => hint.position === 1)?.isUsed, true);
    assert.equal(afterHintsB.hints.find((hint) => hint.position === 2)?.isUsed, false);

    const forgedReward = await inject(
      'POST',
      `/api/challenges/${challenge.id}/flag-submissions`,
      {
        cookie: studentA.cookie,
        payload: { flag: correctFlag, pointsAwarded: 999_999, correct: true },
      },
    );
    assert.equal(forgedReward.statusCode, 400);
    assert.equal(
      await prisma.challengeAttempt.count({
        where: { userId: studentA.user.id, challengeId: challenge.id },
      }),
      0,
    );

    const wrongCase = await inject(
      'POST',
      `/api/challenges/${challenge.id}/flag-submissions`,
      { cookie: studentA.cookie, payload: { flag: caseVariant } },
    );
    assert.equal(wrongCase.statusCode, 201);
    const wrongCaseBody = responseJson<ChallengeSubmissionResponse>(wrongCase);
    assert.equal(wrongCaseBody.correct, false);
    assert.equal(wrongCaseBody.alreadySolved, false);
    assert.equal(wrongCaseBody.pointsAwarded, 0);
    assert.equal(wrongCaseBody.solvedAt, null);
    assertPublicResponseIsSanitized(wrongCase, [correctFlag, caseVariant]);

    const correctSubmission = await inject(
      'POST',
      `/api/challenges/${challenge.id}/flag-submissions`,
      { cookie: studentA.cookie, payload: { flag: correctFlag } },
    );
    assert.equal(correctSubmission.statusCode, 201);
    const correctBody = responseJson<ChallengeSubmissionResponse>(correctSubmission);
    assert.equal(correctBody.correct, true);
    assert.equal(correctBody.alreadySolved, false);
    assert.equal(correctBody.pointsAwarded, 240);
    assert.equal(typeof correctBody.solvedAt, 'string');
    assertPublicResponseIsSanitized(correctSubmission, [correctFlag]);

    const completions = await prisma.challengeCompletion.findMany({
      where: { challengeId: challenge.id },
    });
    assert.equal(completions.length, 1);
    assert.equal(completions[0]!.userId, studentA.user.id);
    assert.equal(completions[0]!.pointsAwarded, 240);
    assert.equal(
      await prisma.challengeAttempt.count({
        where: { userId: studentA.user.id, challengeId: challenge.id },
      }),
      2,
    );
    assert.equal(
      await prisma.challengeAttempt.count({
        where: { userId: studentB.user.id, challengeId: challenge.id },
      }),
      0,
    );

    const solvedA = await inject('GET', `/api/challenges/${challenge.id}`, {
      cookie: studentA.cookie,
    });
    const unsolvedB = await inject('GET', `/api/challenges/${challenge.id}`, {
      cookie: studentB.cookie,
    });
    const solvedABody = responseJson<ChallengeDetailResponse>(solvedA).challenge;
    const unsolvedBBody = responseJson<ChallengeDetailResponse>(unsolvedB).challenge;
    assert.equal(solvedABody.studentStatus, 'solved');
    assert.equal(solvedABody.attemptsCount, 2);
    assert.equal(solvedABody.pointsAwarded, 240);
    assert.equal(unsolvedBBody.studentStatus, 'not_started');
    assert.equal(unsolvedBBody.attemptsCount, 0);
    assert.equal(unsolvedBBody.pointsAwarded, 0);
    assertPublicResponseIsSanitized(solvedA, [correctFlag, challenge.flagHash]);
    assertPublicResponseIsSanitized(unsolvedB, [correctFlag, challenge.flagHash]);

    const listA = await inject('GET', '/api/student/challenges', {
      cookie: studentA.cookie,
    });
    const listB = await inject('GET', '/api/student/challenges', {
      cookie: studentB.cookie,
    });
    const listedA = responseJson<ChallengeListResponse>(listA).challenges.find(
      (item) => item.id === challenge.id,
    );
    const listedB = responseJson<ChallengeListResponse>(listB).challenges.find(
      (item) => item.id === challenge.id,
    );
    assert.equal(listedA?.studentStatus, 'solved');
    assert.equal(listedA?.pointsAwarded, 240);
    assert.equal(listedB?.studentStatus, 'not_started');
    assert.equal(listedB?.pointsAwarded, 0);

    const invalidChallenge = await inject('GET', `/api/challenges/${randomUUID()}`, {
      cookie: studentA.cookie,
    });
    assert.equal(invalidChallenge.statusCode, 404);
    assertPublicResponseIsSanitized(invalidChallenge);

    const download = await inject('GET', `/api/challenges/${challenge.id}/download`, {
      cookie: studentA.cookie,
    });
    assert.equal(download.statusCode, 200);
    assertPublicResponseIsSanitized(download, [challenge.downloadStorageKey!]);

    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: challenge.id,
          activityType: ActivityType.CHALLENGE_ATTEMPT,
        },
      }),
      2,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: studentA.user.id,
          entityId: challenge.id,
          activityType: ActivityType.CHALLENGE_SOLVED,
        },
      }),
      1,
    );

    const dashboardA = await inject('GET', '/api/student/dashboard', {
      cookie: studentA.cookie,
    });
    const dashboardB = await inject('GET', '/api/student/dashboard', {
      cookie: studentB.cookie,
    });
    assert.equal(dashboardA.statusCode, 200);
    assert.equal(dashboardB.statusCode, 200);
    const dashboardABody = responseJson<DashboardResponse>(dashboardA);
    const dashboardBBody = responseJson<DashboardResponse>(dashboardB);
    const achievementA = dashboardABody.achievements.find(
      (achievement) => achievement.id === 'phishing-defender',
    );
    const achievementB = dashboardBBody.achievements.find(
      (achievement) => achievement.id === 'phishing-defender',
    );
    assert.equal(dashboardABody.summary.totalChallengeScore, 240);
    assert.equal(dashboardABody.activeChallenge?.status, 'solved');
    assert.equal(achievementA?.unlocked, true);
    assert.equal(achievementA?.isEarned, true);
    assert.equal(dashboardBBody.summary.totalChallengeScore, 0);
    assert.equal(dashboardBBody.activeChallenge?.status, 'available');
    assert.equal(achievementB?.unlocked, false);
    assert.equal(achievementB?.isEarned, false);
    assertPublicResponseIsSanitized(dashboardA, [correctFlag, challenge.flagHash]);
    assertPublicResponseIsSanitized(dashboardB, [studentA.user.email]);

    const achievementTables = await prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name ILIKE '%achievement%'
    `;
    assert.deepEqual(achievementTables, []);

    const activityA = await inject('GET', '/api/student/activity?page=1&pageSize=10', {
      cookie: studentA.cookie,
    });
    const activityB = await inject('GET', '/api/student/activity?page=1&pageSize=10', {
      cookie: studentB.cookie,
    });
    const activityABody = responseJson<ActivityResponse>(activityA);
    const activityBBody = responseJson<ActivityResponse>(activityB);
    assert.ok(
      activityABody.activities.some(
        (activity) =>
          activity.activityType === ActivityType.CHALLENGE_ATTEMPT &&
          activity.referenceId === challenge.id &&
          activity.metadata.correct === true,
      ),
    );
    assert.ok(
      activityABody.activities.some(
        (activity) =>
          activity.activityType === ActivityType.CHALLENGE_SOLVED &&
          activity.referenceId === challenge.id &&
          activity.metadata.pointsAwarded === 240,
      ),
    );
    assert.equal(activityBBody.activities.length, 0);
    for (const forbiddenField of ['"attemptId"', '"hintPosition"']) {
      assert.equal(activityA.body.includes(forbiddenField), false);
    }
    assertPublicResponseIsSanitized(activityA, [correctFlag, challenge.flagHash]);
    assertPublicResponseIsSanitized(activityB, [studentA.user.email]);
  });
});
