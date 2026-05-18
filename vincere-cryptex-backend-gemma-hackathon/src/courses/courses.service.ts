import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  ChallengeStatus,
  CourseStatus,
  EnrollmentStatus,
  LabInstanceStatus,
  LabStatus,
  LessonStatus,
  Prisma,
  QuizStatus,
  QuizTargetType,
} from '@prisma/client';

import { ActivityService } from '../activity/activity.service';
import { buildPagination } from '../common/utils/pagination.util';
import { PrismaRunner } from '../common/types/prisma-runner.type';
import { PrismaService } from '../prisma/prisma.service';
import { ListCoursesQueryDto } from './dto/list-courses-query.dto';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';

const LESSON_SCROLL_COMPLETION_PERCENT = 90;
const LESSON_WATCH_COMPLETION_PERCENT = 85;
const DEFAULT_LESSON_READING_COMPLETION_SECONDS = 10;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LESSON_SLUG_ALIASES_BY_COURSE_SLUG: Record<string, Record<string, string>> = {
  'advanced-threat-hunting': {
    'building-hunt-hypotheses': 'ath-hypothesis-writing',
    'endpoint-telemetry-joins': 'ath-telemetry-fit',
    'converting-hunts-to-detections': 'ath-findings',
  },
  'incident-response-operations': {
    'incident-intake-and-severity': 'iro-first-hour',
    'evidence-preservation': 'iro-evidence',
    'containment-decision-records': 'iro-isolation',
    'recovery-and-lessons-learned': 'iro-communications',
  },
  'network-defense-foundations': {
    'firewall-rule-hygiene': 'ndf-firewall-rules',
    'network-segmentation-basics': 'ndf-traffic-map',
    'secure-remote-access': 'ndf-packet-view',
    'logging-useful-network-events': 'ndf-service-review',
  },
  'web-application-attack-lab': {
    'mapping-application-surfaces': 'waa-surface-map',
    'injection-risk-patterns': 'waa-injection',
    'broken-access-control-checks': 'waa-access-control',
    'reporting-web-findings': 'waa-reporting',
  },
};

type LessonContentModeValue = 'TEXT' | 'VIDEO' | 'HYBRID';

type StudentEnrollmentStatus = 'NOT_ENROLLED' | 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED';

interface LessonEngagementInput {
  scrollPercent?: number;
  watchPercent?: number;
  readingTimeSeconds?: number;
}

interface PublishedLessonSummary {
  id: string;
  slug: string;
  title: string;
  position: number;
}

interface LessonProgressSummary {
  enrollmentId?: string;
  lessonId: string;
  completedAt: Date | null;
  lastViewedAt?: Date | null;
}

interface StudentEnrollmentRecord {
  id: string;
  status: EnrollmentStatus;
  enrolledAt?: Date;
  completedAt?: Date | null;
  lastAccessedAt?: Date | null;
}

interface DashboardCourseProgressState {
  enrollmentId: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  skill: string;
  level: string;
  enrollmentStatus: StudentEnrollmentStatus;
  enrolledAt: Date;
  completedAt: Date | null;
  lastAccessedAt: Date | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  nextLessonId: string | null;
  nextLessonSlug: string | null;
  firstCompletedAt: Date | null;
  lastCompletedAt: Date | null;
}

interface LessonModeSerializationInput {
  slug: string;
  contentMode: LessonContentModeValue;
  textContent: string | null;
  videoProvider: string | null;
  videoAssetId: string | null;
  videoDurationSeconds: number | null;
}

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
  ) {}

  async listPublishedCourses(query: ListCoursesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CourseWhereInput = {
      status: CourseStatus.PUBLISHED,
      publishedAt: {
        not: null,
      },
      ...(query.level ? { level: query.level } : {}),
      ...(query.search
        ? {
            OR: [
              {
                title: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                shortDescription: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [total, courses] = await this.prisma.$transaction([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          sections: {
            where: {
              status: 'PUBLISHED',
              publishedAt: {
                not: null,
              },
            },
            include: {
              lessons: {
                where: {
                  status: 'PUBLISHED',
                  publishedAt: {
                    not: null,
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        slug: course.slug,
        shortDescription: course.shortDescription,
        level: course.level,
        publishedAt: course.publishedAt,
        sectionCount: course.sections.length,
        lessonCount: course.sections.reduce((sum, section) => sum + section.lessons.length, 0),
      })),
      pagination: buildPagination(page, pageSize, total),
    };
  }

  async getPublishedCourseById(courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: this.buildPublishedCourseLookupWhere(courseId),
      include: {
        quizzes: {
          where: {
            targetType: QuizTargetType.COURSE,
            lessonId: null,
            status: QuizStatus.PUBLISHED,
            publishedAt: {
              not: null,
            },
          },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: {
            status: true,
            publishedAt: true,
            targetType: true,
          },
        },
        sections: {
          where: {
            status: 'PUBLISHED',
            publishedAt: {
              not: null,
            },
          },
          orderBy: {
            position: 'asc',
          },
          include: {
            lessons: {
              where: {
                status: LessonStatus.PUBLISHED,
                publishedAt: {
                  not: null,
                },
              },
              orderBy: {
                position: 'asc',
              },
              include: {
                quiz: {
                  select: {
                    status: true,
                    publishedAt: true,
                    targetType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return {
      course: {
        id: course.id,
        title: course.title,
        slug: course.slug,
        shortDescription: course.shortDescription,
        description: course.description,
        level: course.level,
        publishedAt: course.publishedAt,
        courseQuiz: this.serializeQuizPresence(course.quizzes[0]),
        sections: course.sections.map((section) => ({
          id: section.id,
          title: section.title,
          position: section.position,
          publishedAt: section.publishedAt,
          lessons: section.lessons.map((lesson) => ({
            id: lesson.id,
            slug: lesson.slug,
            title: lesson.title,
            summary: lesson.summary,
            position: lesson.position,
            ...this.serializeLessonModeFields(lesson),
            publishedAt: lesson.publishedAt,
            ...this.serializeQuizPresence(lesson.quiz),
          })),
        })),
      },
    };
  }

  async listStudentPublishedCourses(userId: string, query: ListCoursesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CourseWhereInput = {
      status: CourseStatus.PUBLISHED,
      publishedAt: {
        not: null,
      },
      ...(query.level ? { level: query.level } : {}),
      ...(query.search
        ? {
            OR: [
              {
                title: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                shortDescription: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [total, courses] = await this.prisma.$transaction([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          enrollments: {
            where: { userId },
            take: 1,
          },
          lessonProgress: {
            where: { userId },
            select: {
              enrollmentId: true,
              lessonId: true,
              completedAt: true,
              lastViewedAt: true,
            },
          },
          sections: {
            where: {
              status: 'PUBLISHED',
              publishedAt: {
                not: null,
              },
            },
            orderBy: {
              position: 'asc',
            },
            include: {
              lessons: {
                where: {
                  status: LessonStatus.PUBLISHED,
                  publishedAt: {
                    not: null,
                  },
                },
                orderBy: {
                  position: 'asc',
                },
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  position: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      courses: courses.map((course) => {
        const publishedLessons = this.flattenPublishedLessons(course.sections);
        const state = this.buildStudentCourseState(
          course.enrollments[0] ?? null,
          publishedLessons,
          course.lessonProgress,
        );

        return {
          id: course.id,
          courseId: course.id,
          title: course.title,
          slug: course.slug,
          shortDescription: course.shortDescription,
          description: course.description,
          level: course.level,
          publishedAt: course.publishedAt,
          enrollmentStatus: state.enrollmentStatus,
          progressPercent: state.progressPercent,
          completedLessons: state.completedLessons,
          totalLessons: state.totalLessons,
          currentLessonId: state.currentLessonId,
          currentLessonSlug: state.currentLessonSlug,
          nextLessonId: state.nextLessonId,
          nextLessonSlug: state.nextLessonSlug,
        };
      }),
      pagination: buildPagination(page, pageSize, total),
    };
  }

  async getStudentCourseDetail(userId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: this.buildPublishedCourseLookupWhere(courseId),
      include: {
        enrollments: {
          where: { userId },
          take: 1,
        },
        lessonProgress: {
          where: { userId },
          select: {
            enrollmentId: true,
            lessonId: true,
            completedAt: true,
            lastViewedAt: true,
          },
        },
        quizzes: {
          where: {
            targetType: QuizTargetType.COURSE,
            lessonId: null,
            status: QuizStatus.PUBLISHED,
            publishedAt: {
              not: null,
            },
          },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: {
            id: true,
            status: true,
            publishedAt: true,
            targetType: true,
          },
        },
        sections: {
          where: {
            status: 'PUBLISHED',
            publishedAt: {
              not: null,
            },
          },
          orderBy: {
            position: 'asc',
          },
          include: {
            lessons: {
              where: {
                status: LessonStatus.PUBLISHED,
                publishedAt: {
                  not: null,
                },
              },
              orderBy: {
                position: 'asc',
              },
              include: {
                quiz: {
                  select: {
                    id: true,
                    status: true,
                    publishedAt: true,
                    targetType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const publishedLessons = this.flattenPublishedLessons(course.sections);
    const enrollment = course.enrollments[0] ?? null;
    const state = this.buildStudentCourseState(
      enrollment,
      publishedLessons,
      course.lessonProgress,
    );
    const completedLessonIds = new Set(
      course.lessonProgress
        .filter(
          (progress) =>
            progress.completedAt !== null &&
            (!enrollment || progress.enrollmentId === enrollment.id),
        )
        .map((progress) => progress.lessonId),
    );

    return {
      course: {
        id: course.id,
        title: course.title,
        slug: course.slug,
        shortDescription: course.shortDescription,
        description: course.description,
        level: course.level,
        publishedAt: course.publishedAt,
        courseQuiz: this.serializeQuizPresence(course.quizzes[0]),
        enrollmentStatus: state.enrollmentStatus,
        progressPercent: state.progressPercent,
        completedLessons: state.completedLessons,
        totalLessons: state.totalLessons,
        currentLessonId: state.currentLessonId,
        currentLessonSlug: state.currentLessonSlug,
        nextLessonId: state.nextLessonId,
        nextLessonSlug: state.nextLessonSlug,
        sections: course.sections.map((section) => ({
          id: section.id,
          title: section.title,
          order: section.position,
          position: section.position,
          publishedAt: section.publishedAt,
          lessons: section.lessons.map((lesson) => ({
            id: lesson.id,
            slug: lesson.slug,
            title: lesson.title,
            summary: lesson.summary,
            ...this.serializeLessonModeFields(lesson),
            order: lesson.position,
            position: lesson.position,
            locked: !state.isEnrolled,
            unlocked: state.isEnrolled,
            completed: completedLessonIds.has(lesson.id),
            publishedAt: lesson.publishedAt,
            ...this.serializeQuizPresence(lesson.quiz),
          })),
        })),
      },
    };
  }

  async enroll(userId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: this.buildPublishedCourseLookupWhere(courseId),
      include: {
        sections: {
          where: {
            status: 'PUBLISHED',
            publishedAt: {
              not: null,
            },
          },
          orderBy: {
            position: 'asc',
          },
          include: {
            lessons: {
              where: {
                status: LessonStatus.PUBLISHED,
                publishedAt: {
                  not: null,
                },
              },
              orderBy: {
                position: 'asc',
              },
              select: {
                id: true,
                slug: true,
                title: true,
                position: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const resolvedCourseId = course.id;
    const publishedLessons = this.flattenPublishedLessons(course.sections);
    const firstLesson = publishedLessons[0] ?? null;

    const existing = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: resolvedCourseId,
        },
      },
    });

    if (existing) {
      const continueTarget = await this.resolveContinueTargetForCourse(
        userId,
        resolvedCourseId,
        course.slug,
        publishedLessons,
        existing.id,
      );
      const lessonTarget = continueTarget ?? this.serializeLessonTarget(
        resolvedCourseId,
        course.slug,
        firstLesson,
      );

      return {
        enrollment: this.serializeEnrollment(existing),
        enrolled: false,
        courseId: resolvedCourseId,
        courseSlug: course.slug,
        lessonId: lessonTarget?.lessonId ?? null,
        lessonSlug: lessonTarget?.lessonSlug ?? null,
        lessonTitle: lessonTarget?.lessonTitle ?? null,
        firstLessonId: firstLesson?.id ?? null,
        firstLessonSlug: firstLesson?.slug ?? null,
        continueTarget,
      };
    }

    try {
      const enrollment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.enrollment.create({
          data: {
            userId,
            courseId: resolvedCourseId,
            status: EnrollmentStatus.ACTIVE,
            lastAccessedAt: new Date(),
          },
        });

        await this.activityService.log({
          userId,
          activityType: ActivityType.COURSE_ENROLLED,
          entityType: 'COURSE',
          entityId: resolvedCourseId,
          metadata: {},
          runner: tx,
        });

        return created;
      });
      const lessonTarget = this.serializeLessonTarget(
        resolvedCourseId,
        course.slug,
        firstLesson,
      );

      return {
        enrollment: this.serializeEnrollment(enrollment),
        enrolled: true,
        courseId: resolvedCourseId,
        courseSlug: course.slug,
        lessonId: lessonTarget?.lessonId ?? null,
        lessonSlug: lessonTarget?.lessonSlug ?? null,
        lessonTitle: lessonTarget?.lessonTitle ?? null,
        firstLessonId: firstLesson?.id ?? null,
        firstLessonSlug: firstLesson?.slug ?? null,
        continueTarget: lessonTarget,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrentEnrollment = await this.prisma.enrollment.findUniqueOrThrow({
          where: {
            userId_courseId: {
              userId,
              courseId: resolvedCourseId,
            },
          },
        });
        const continueTarget = await this.resolveContinueTargetForCourse(
          userId,
          resolvedCourseId,
          course.slug,
          publishedLessons,
          concurrentEnrollment.id,
        );
        const lessonTarget = continueTarget ?? this.serializeLessonTarget(
          resolvedCourseId,
          course.slug,
          firstLesson,
        );

        return {
          enrollment: this.serializeEnrollment(concurrentEnrollment),
          enrolled: false,
          courseId: resolvedCourseId,
          courseSlug: course.slug,
          lessonId: lessonTarget?.lessonId ?? null,
          lessonSlug: lessonTarget?.lessonSlug ?? null,
          lessonTitle: lessonTarget?.lessonTitle ?? null,
          firstLessonId: firstLesson?.id ?? null,
          firstLessonSlug: firstLesson?.slug ?? null,
          continueTarget,
        };
      }

      throw error;
    }
  }

  async getLessonForStudent(
    userId: string,
    courseId: string,
    lessonId: string,
    watermarkEmail?: string,
  ) {
    const course = await this.getPublishedCourseIdentity(courseId);
    const lesson = await this.getPublishedLesson(course.id, course.slug, lessonId);
    const enrollment = await this.requireEnrollment(userId, course.id);
    const progress = await this.upsertLessonViewProgress({
      enrollmentId: enrollment.id,
      userId,
      courseId: course.id,
      lessonId: lesson.id,
    });
    const serializedProgress = this.serializeProgress(progress);
    const serializedLessonProgress = this.serializeLessonProgress(progress);

    return {
      lesson: {
        ...this.serializeLesson(lesson),
        progress: serializedLessonProgress,
      },
      watermark: {
        identity: watermarkEmail ?? null,
      },
      progress: serializedProgress,
      lessonProgress: serializedLessonProgress,
      courseProgress: await this.getCourseProgressSummary(userId, course.id),
    };
  }

  async updateLessonProgress(
    userId: string,
    courseId: string,
    lessonId: string,
    progressInput: UpdateLessonProgressDto = {},
  ) {
    const course = await this.getPublishedCourseIdentity(courseId);
    const lesson = await this.getPublishedLesson(course.id, course.slug, lessonId);
    const resolvedCourseId = course.id;
    const resolvedLessonId = lesson.id;
    const enrollment = await this.requireEnrollment(userId, resolvedCourseId);
    const engagement = this.extractEngagement(progressInput);
    const completionRequested = this.resolveCompletionRequested(progressInput);
    const lessonContentMode = this.resolveSerializedLessonContentMode(lesson);

    this.logProgressDebug('received lesson progress dto', {
      courseId: resolvedCourseId,
      lessonId: resolvedLessonId,
      dbContentMode: lesson.contentMode,
      contentMode: lessonContentMode,
      scrollPercent: progressInput.scrollPercent ?? null,
      readingTimeSeconds: progressInput.readingTimeSeconds ?? null,
      watchPercent: progressInput.watchPercent ?? null,
      completed: progressInput.completed ?? null,
      completionRequested: progressInput.completionRequested ?? null,
      markComplete: progressInput.markComplete ?? null,
      normalizedCompletionRequested: completionRequested,
    });

    this.logProgressDebug('normalized lesson engagement', {
      courseId: resolvedCourseId,
      lessonId: resolvedLessonId,
      scrollPercent: engagement.scrollPercent ?? null,
      watchPercent: engagement.watchPercent ?? null,
      readingTimeSeconds: engagement.readingTimeSeconds ?? null,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      let progress = await this.upsertLessonViewProgress(
        {
          enrollmentId: enrollment.id,
          userId,
          courseId: resolvedCourseId,
          lessonId: resolvedLessonId,
          engagement,
        },
        tx,
      );

      const publishedQuiz = this.resolvePublishedQuiz(lesson.quiz);
      const alreadyCompleted = Boolean(progress.completedAt);
      const completionRequirementsMet =
        !publishedQuiz && this.isCompletionThresholdMet(lessonContentMode, progress);
      const shouldComplete =
        alreadyCompleted ||
        (completionRequested &&
          (completionRequirementsMet || Boolean(publishedQuiz)));

      this.logProgressDebug('computed lesson completion decision', {
        courseId: resolvedCourseId,
        lessonId: resolvedLessonId,
        dbContentMode: lesson.contentMode,
        contentMode: lessonContentMode,
        hasPublishedQuiz: Boolean(publishedQuiz),
        requiredReadingTimeSeconds: this.lessonHasTextContent(lessonContentMode)
          ? DEFAULT_LESSON_READING_COMPLETION_SECONDS
          : null,
        completionRequirementsMet,
        completionRequested,
        alreadyCompleted,
        shouldComplete,
        completed: Boolean(progress.completedAt) || shouldComplete,
      });

      if (shouldComplete) {
        if (!alreadyCompleted && publishedQuiz) {
          const passedAttempt = await tx.quizAttempt.findFirst({
            where: {
              quizId: publishedQuiz.id,
              userId,
              status: 'SUBMITTED',
              passed: true,
            },
          });

          if (!passedAttempt) {
            throw new BadRequestException('This lesson requires a passed quiz before completion');
          }
        }

        progress = await this.completeLessonProgress(
          {
            enrollmentId: enrollment.id,
            userId,
            courseId: resolvedCourseId,
            lessonId: resolvedLessonId,
            engagement,
          },
          tx,
        );
      }

      return {
        progress,
        courseProgress: await this.getCourseProgressSummary(userId, resolvedCourseId, tx),
      };
    });

    const serializedProgress = this.serializeProgress(result.progress);
    const serializedLessonProgress = this.serializeLessonProgress(result.progress);

    return {
      lessonProgress: serializedLessonProgress,
      progress: serializedProgress,
      courseProgress: result.courseProgress,
    };
  }

  async getStudentDashboardSummary(userId: string) {
    const now = new Date();
    const [
      enrollments,
      solvedChallengesCount,
      totalChallengeScore,
      activeLabsCount,
      continueLearning,
      recentActivity,
      phishingChallenge,
    ] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          userId,
          course: {
            status: CourseStatus.PUBLISHED,
            publishedAt: {
              not: null,
            },
          },
        },
        orderBy: [{ lastAccessedAt: 'desc' }, { enrolledAt: 'desc' }],
        include: {
          course: {
            include: {
              lessonProgress: {
                where: { userId },
                select: {
                  enrollmentId: true,
                  lessonId: true,
                  completedAt: true,
                  lastViewedAt: true,
                },
              },
              sections: {
                where: {
                  status: 'PUBLISHED',
                  publishedAt: {
                    not: null,
                  },
                },
                orderBy: {
                  position: 'asc',
                },
                include: {
                  lessons: {
                    where: {
                      status: LessonStatus.PUBLISHED,
                      publishedAt: {
                        not: null,
                      },
                    },
                    orderBy: {
                      position: 'asc',
                    },
                    select: {
                      id: true,
                      slug: true,
                      title: true,
                      position: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.challengeCompletion.count({
        where: {
          userId,
          challenge: {
            status: ChallengeStatus.PUBLISHED,
            publishedAt: {
              not: null,
            },
          },
        },
      }),
      this.prisma.challengeCompletion.aggregate({
        where: {
          userId,
          challenge: {
            status: ChallengeStatus.PUBLISHED,
            publishedAt: {
              not: null,
            },
          },
        },
        _sum: {
          pointsAwarded: true,
        },
      }),
      this.prisma.labInstance.count({
        where: {
          userId,
          status: {
            in: [LabInstanceStatus.STARTING, LabInstanceStatus.ACTIVE],
          },
          expiresAt: {
            gt: now,
          },
          lab: {
            status: LabStatus.PUBLISHED,
            publishedAt: {
              not: null,
            },
          },
        },
      }),
      this.getContinueLearning(userId),
      this.activityService.listRecentActivities(userId, 1, 10),
      this.prisma.challenge.findFirst({
        where: {
          slug: 'phishing-awareness',
          status: ChallengeStatus.PUBLISHED,
          publishedAt: {
            not: null,
          },
        },
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          difficulty: true,
          points: true,
          publishedAt: true,
          completions: {
            where: {
              userId,
            },
            take: 1,
            select: {
              solvedAt: true,
              pointsAwarded: true,
            },
          },
          attempts: {
            where: {
              userId,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            select: {
              createdAt: true,
              isCorrect: true,
            },
          },
          _count: {
            select: {
              attempts: {
                where: {
                  userId,
                },
              },
            },
          },
        },
      }),
    ]);
    const courseStates = enrollments.map<DashboardCourseProgressState>((enrollment) => {
      const publishedLessons = this.flattenPublishedLessons(enrollment.course.sections);
      const state = this.buildStudentCourseState(
        enrollment,
        publishedLessons,
        enrollment.course.lessonProgress,
      );

      return {
        enrollmentId: enrollment.id,
        courseId: enrollment.courseId,
        courseSlug: enrollment.course.slug,
        courseTitle: enrollment.course.title,
        skill: this.resolveSkillForCourse(enrollment.course.slug),
        level: enrollment.course.level,
        enrollmentStatus: state.enrollmentStatus,
        enrolledAt: enrollment.enrolledAt,
        completedAt:
          state.enrollmentStatus === 'COMPLETED'
            ? enrollment.completedAt ?? state.lastCompletedAt
            : null,
        lastAccessedAt: enrollment.lastAccessedAt,
        progressPercent: state.progressPercent,
        completedLessons: state.completedLessons,
        totalLessons: state.totalLessons,
        nextLessonId: state.nextLessonId,
        nextLessonSlug: state.nextLessonSlug,
        firstCompletedAt: state.firstCompletedAt,
        lastCompletedAt: state.lastCompletedAt,
      };
    });
    const enrolledCoursesCount = courseStates.length;
    const completedCoursesCount = courseStates.filter(
      (course) => course.enrollmentStatus === 'COMPLETED',
    ).length;
    const completedLessonsCount = courseStates.reduce(
      (sum, course) => sum + course.completedLessons,
      0,
    );
    const completedLessonsTotal = courseStates.reduce(
      (sum, course) => sum + course.totalLessons,
      0,
    );
    const averageProgress =
      enrolledCoursesCount > 0
        ? Math.round(
            courseStates.reduce((sum, course) => sum + course.progressPercent, 0) /
              enrolledCoursesCount,
          )
        : 0;
    const phishingCompletion = phishingChallenge?.completions[0] ?? null;
    const phishingAttempt = phishingChallenge?.attempts[0] ?? null;
    const phishingDefenderBadge = {
      id: 'phishing-defender',
      type: 'challenge',
      title: 'Phishing Defender',
      description:
        'Recognized suspicious phishing indicators and completed the defensive challenge.',
      unlocked: Boolean(phishingCompletion),
      isEarned: Boolean(phishingCompletion),
      earnedAt: phishingCompletion?.solvedAt ?? null,
      unlockedAt: phishingCompletion?.solvedAt ?? null,
      progress: this.buildProgressMeter(phishingCompletion ? 1 : 0, 1),
    };
    const achievements = [phishingDefenderBadge];
    const nextBadge = phishingDefenderBadge.unlocked ? null : phishingDefenderBadge;
    const activeChallenge = phishingChallenge
      ? {
          id: phishingChallenge.id,
          slug: phishingChallenge.slug,
          title: phishingChallenge.title,
          category: phishingChallenge.category,
          difficulty: phishingChallenge.difficulty,
          points: phishingChallenge.points,
          status: phishingCompletion ? 'solved' : phishingAttempt ? 'attempted' : 'available',
          attemptsCount: phishingChallenge._count.attempts,
          solvedAt: phishingCompletion?.solvedAt ?? null,
          pointsAwarded: phishingCompletion?.pointsAwarded ?? 0,
          href: '/challenges',
      }
      : null;
    const continueLearningCourseSlug =
      'courseSlug' in continueLearning && typeof continueLearning.courseSlug === 'string'
        ? continueLearning.courseSlug
        : null;
    const continueLearningLessonSlug =
      'lessonSlug' in continueLearning && typeof continueLearning.lessonSlug === 'string'
        ? continueLearning.lessonSlug
        : null;
    const aiTutorHref =
      continueLearning.hasEnrollment && continueLearningCourseSlug
        ? `/courses/${continueLearningCourseSlug}${
            continueLearningLessonSlug ? `/lessons/${continueLearningLessonSlug}` : ''
          }`
        : '/courses';
    const aiTutorCard = {
      title: 'AI Tutor Guidance',
      status: 'available',
      description: 'Safe explanations, guided hints, and next-step help.',
      href: aiTutorHref,
    };
    const learningPathProgress = {
      enrolledCoursesCount,
      completedCoursesCount,
      completedLessonsCount,
      completedLessonsTotal,
      averageProgressPercent: averageProgress,
    };
    const enrolledCourseSummaries = courseStates.map((course) => ({
      enrollmentId: course.enrollmentId,
      courseId: course.courseId,
      courseSlug: course.courseSlug,
      title: course.courseTitle,
      skill: course.skill,
      level: course.level,
      enrollmentStatus: course.enrollmentStatus,
      progressPercent: course.progressPercent,
      completedLessons: course.completedLessons,
      totalLessons: course.totalLessons,
      nextLessonId: course.nextLessonId,
      nextLessonSlug: course.nextLessonSlug,
      enrolledAt: course.enrolledAt,
      completedAt: course.completedAt,
      lastAccessedAt: course.lastAccessedAt,
    }));

    return {
      summary: {
        enrolledCoursesCount,
        enrolledCourses: enrolledCoursesCount,
        averageProgress,
        averageProgressPercent: averageProgress,
        completedCoursesCount,
        completedLessonsCount,
        completedLessonsTotal,
        completedLessons: {
          completed: completedLessonsCount,
          total: completedLessonsTotal,
        },
        solvedChallengesCount,
        totalChallengeScore: totalChallengeScore._sum.pointsAwarded ?? 0,
        activeLabsCount,
        nextBadge,
      },
      enrolledCoursesCount,
      enrolledCourses: {
        count: enrolledCoursesCount,
        courses: enrolledCourseSummaries,
      },
      averageProgress,
      averageProgressPercent: averageProgress,
      completedLessons: completedLessonsCount,
      completedLessonsCount,
      completedLessonsTotal,
      totalLessons: completedLessonsTotal,
      lessonCompletion: {
        completed: completedLessonsCount,
        total: completedLessonsTotal,
      },
      continueLearning,
      skillMatrix: this.buildSkillMatrix(courseStates),
      activityFeed: recentActivity.activities,
      activity: recentActivity.activities,
      recentActivity,
      activeChallenge,
      aiTutorCard,
      learningPathProgress,
      achievements,
      nextBadge,
    };
  }

  async listStudentCourses(userId: string, page = 1, pageSize = 20) {
    const where = {
      userId,
      course: {
        status: CourseStatus.PUBLISHED,
        publishedAt: {
          not: null,
        },
      },
    } satisfies Prisma.EnrollmentWhereInput;

    const [total, enrollments] = await this.prisma.$transaction([
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ lastAccessedAt: 'desc' }, { enrolledAt: 'desc' }],
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              shortDescription: true,
              level: true,
              lessonProgress: {
                where: {
                  userId,
                },
                select: {
                  enrollmentId: true,
                  lessonId: true,
                  completedAt: true,
                },
              },
              sections: {
                where: {
                  status: 'PUBLISHED',
                  publishedAt: {
                    not: null,
                  },
                },
                orderBy: {
                  position: 'asc',
                },
                select: {
                  lessons: {
                    where: {
                      status: LessonStatus.PUBLISHED,
                      publishedAt: {
                        not: null,
                      },
                    },
                    orderBy: {
                      position: 'asc',
                    },
                    select: {
                      id: true,
                      slug: true,
                      title: true,
                      position: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      courses: enrollments.map((enrollment) => {
        const publishedLessons = enrollment.course.sections.flatMap((section) => section.lessons);
        const state = this.buildStudentCourseState(
          enrollment,
          publishedLessons,
          enrollment.course.lessonProgress,
        );
        const nextLesson =
          publishedLessons.find((lesson) => lesson.id === state.nextLessonId) ?? null;

        return {
          enrollmentId: enrollment.id,
          courseId: enrollment.course.id,
          title: enrollment.course.title,
          slug: enrollment.course.slug,
          shortDescription: enrollment.course.shortDescription,
          level: enrollment.course.level,
          enrollmentStatus: state.enrollmentStatus,
          enrolledAt: enrollment.enrolledAt,
          completedAt: enrollment.completedAt,
          lastAccessedAt: enrollment.lastAccessedAt,
          progress: {
            totalPublishedLessons: state.totalLessons,
            completedLessons: state.completedLessons,
            progressPercentage: state.progressPercent,
          },
          nextLesson: nextLesson
            ? {
                id: nextLesson.id,
                slug: nextLesson.slug,
                title: nextLesson.title,
              }
            : null,
        };
      }),
      pagination: buildPagination(page, pageSize, total),
    };
  }

  async getContinueLearning(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        userId,
        course: {
          status: CourseStatus.PUBLISHED,
          publishedAt: {
            not: null,
          },
        },
      },
      orderBy: [{ lastAccessedAt: 'desc' }, { enrolledAt: 'desc' }],
      include: {
        course: {
          include: {
            lessonProgress: {
              where: { userId },
              select: {
                enrollmentId: true,
                lessonId: true,
                completedAt: true,
                lastViewedAt: true,
              },
            },
            sections: {
              where: {
                status: 'PUBLISHED',
                publishedAt: {
                  not: null,
                },
              },
              orderBy: {
                position: 'asc',
              },
              include: {
                lessons: {
                  where: {
                    status: LessonStatus.PUBLISHED,
                    publishedAt: {
                      not: null,
                    },
                  },
                  orderBy: {
                    position: 'asc',
                  },
                  select: {
                    id: true,
                    slug: true,
                    title: true,
                    position: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    for (const enrollment of enrollments) {
      const lessons = this.flattenPublishedLessons(enrollment.course.sections);
      const state = this.buildStudentCourseState(
        enrollment,
        lessons,
        enrollment.course.lessonProgress,
      );
      const lesson = lessons.find((item) => item.id === state.nextLessonId);

      if (lesson && state.enrollmentStatus !== 'COMPLETED') {
        return {
          courseId: enrollment.courseId,
          courseSlug: enrollment.course.slug,
          lessonId: lesson.id,
          lessonSlug: lesson.slug,
          courseTitle: enrollment.course.title,
          lessonTitle: lesson.title,
          progressPercent: state.progressPercent,
          hasEnrollment: true,
          emptyState: null,
        };
      }
    }

    const starterCourse = await this.prisma.course.findFirst({
      where: {
        status: CourseStatus.PUBLISHED,
        publishedAt: {
          not: null,
        },
      },
      orderBy: [{ publishedAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        sections: {
          where: {
            status: 'PUBLISHED',
            publishedAt: {
              not: null,
            },
          },
          orderBy: {
            position: 'asc',
          },
          include: {
            lessons: {
              where: {
                status: LessonStatus.PUBLISHED,
                publishedAt: {
                  not: null,
                },
              },
              orderBy: {
                position: 'asc',
              },
              select: {
                id: true,
                slug: true,
                title: true,
                position: true,
              },
            },
          },
        },
      },
    });
    const starterLesson = starterCourse
      ? this.flattenPublishedLessons(starterCourse.sections)[0] ?? null
      : null;

    return {
      courseId: null,
      lessonId: null,
      courseTitle: null,
      lessonTitle: null,
      progressPercent: 0,
      hasEnrollment: false,
      emptyState: {
        reason: enrollments.length > 0 ? 'no_incomplete_lessons' : 'no_enrollment',
        recommendedCourse:
          starterCourse && starterLesson
            ? {
                courseId: starterCourse.id,
                courseSlug: starterCourse.slug,
                lessonId: starterLesson.id,
                lessonSlug: starterLesson.slug,
                courseTitle: starterCourse.title,
                lessonTitle: starterLesson.title,
              }
            : null,
      },
    };
  }

  async touchEnrollmentLastAccessed(
    enrollmentId: string,
    runner: PrismaRunner = this.prisma,
    markInProgress = false,
  ) {
    const now = new Date();
    if (markInProgress) {
      await runner.enrollment.updateMany({
        where: {
          id: enrollmentId,
          status: {
            not: EnrollmentStatus.COMPLETED,
          },
        },
        data: {
          status: EnrollmentStatus.IN_PROGRESS,
          lastAccessedAt: now,
          completedAt: null,
        },
      });

      return runner.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
      });
    }

    return runner.enrollment.update({
      where: { id: enrollmentId },
      data: {
        lastAccessedAt: now,
      },
    });
  }

  async upsertLessonViewProgress(
    input: {
      enrollmentId: string;
      userId: string;
      courseId: string;
      lessonId: string;
      engagement?: LessonEngagementInput;
    },
    runner: PrismaRunner = this.prisma,
  ) {
    const existing = await runner.lessonProgress.findUnique({
      where: {
        userId_lessonId: {
          userId: input.userId,
          lessonId: input.lessonId,
        },
      },
    });
    const now = new Date();

    const progress = existing
      ? await runner.lessonProgress.update({
          where: { id: existing.id },
          data: {
            lastViewedAt: now,
            ...this.mergeEngagement(existing, input.engagement),
          },
        })
      : await runner.lessonProgress.create({
          data: {
            enrollmentId: input.enrollmentId,
            userId: input.userId,
            courseId: input.courseId,
            lessonId: input.lessonId,
            startedAt: now,
            lastViewedAt: now,
            scrollPercent: input.engagement?.scrollPercent ?? 0,
            watchPercent: input.engagement?.watchPercent ?? 0,
            readingTimeSeconds: input.engagement?.readingTimeSeconds ?? 0,
          },
        });

    await this.touchEnrollmentLastAccessed(input.enrollmentId, runner, true);

    await this.activityService.logOnce({
      userId: input.userId,
      activityType: ActivityType.LESSON_VIEWED,
      entityType: 'LESSON',
      entityId: input.lessonId,
      metadata: {
        courseId: input.courseId,
      },
      runner,
    });

    return progress;
  }

  async completeLessonProgress(
    input: {
      enrollmentId: string;
      userId: string;
      courseId: string;
      lessonId: string;
      engagement?: LessonEngagementInput;
    },
    runner: PrismaRunner = this.prisma,
  ) {
    const now = new Date();
    const existing = await runner.lessonProgress.findUnique({
      where: {
        userId_lessonId: {
          userId: input.userId,
          lessonId: input.lessonId,
        },
      },
    });

    const progress = existing
      ? await runner.lessonProgress.update({
          where: { id: existing.id },
          data: {
            lastViewedAt: now,
            ...this.mergeEngagement(existing, input.engagement),
            completedAt: existing.completedAt ?? now,
          },
        })
      : await runner.lessonProgress.create({
          data: {
            enrollmentId: input.enrollmentId,
            userId: input.userId,
            courseId: input.courseId,
            lessonId: input.lessonId,
            startedAt: now,
            lastViewedAt: now,
            scrollPercent: input.engagement?.scrollPercent ?? 0,
            watchPercent: input.engagement?.watchPercent ?? 0,
            readingTimeSeconds: input.engagement?.readingTimeSeconds ?? 0,
            completedAt: now,
          },
        });

    await this.touchEnrollmentLastAccessed(input.enrollmentId, runner);

    if (!existing?.completedAt) {
      await this.activityService.logOnce({
        userId: input.userId,
        activityType: ActivityType.LESSON_COMPLETED,
        entityType: 'LESSON',
        entityId: input.lessonId,
        metadata: {
          courseId: input.courseId,
        },
        runner,
      });
    }

    await this.syncEnrollmentCompletion(input.enrollmentId, input.courseId, input.userId, runner);
    return progress;
  }

  private async getCourseProgressSummary(
    userId: string,
    courseId: string,
    runner: PrismaRunner = this.prisma,
  ) {
    const [course, enrollment, progress] = await Promise.all([
      runner.course.findFirst({
        where: {
          id: courseId,
          status: CourseStatus.PUBLISHED,
          publishedAt: {
            not: null,
          },
        },
        include: {
          sections: {
            where: {
              status: 'PUBLISHED',
              publishedAt: {
                not: null,
              },
            },
            orderBy: {
              position: 'asc',
            },
            include: {
              lessons: {
                where: {
                  status: LessonStatus.PUBLISHED,
                  publishedAt: {
                    not: null,
                  },
                },
                orderBy: {
                  position: 'asc',
                },
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  position: true,
                },
              },
            },
          },
        },
      }),
      runner.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
      }),
      runner.lessonProgress.findMany({
        where: {
          userId,
          courseId,
        },
        select: {
          enrollmentId: true,
          lessonId: true,
          completedAt: true,
          lastViewedAt: true,
        },
      }),
    ]);

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const state = this.buildStudentCourseState(
      enrollment,
      this.flattenPublishedLessons(course.sections),
      progress,
    );

    return {
      enrollmentStatus: state.enrollmentStatus,
      progressPercent: state.progressPercent,
      completedLessons: state.completedLessons,
      totalLessons: state.totalLessons,
      currentLessonId: state.currentLessonId,
      currentLessonSlug: state.currentLessonSlug,
      nextLessonId: state.nextLessonId,
      nextLessonSlug: state.nextLessonSlug,
    };
  }

  private async resolveContinueTargetForCourse(
    userId: string,
    courseId: string,
    courseSlug: string,
    publishedLessons: PublishedLessonSummary[],
    enrollmentId?: string,
  ) {
    const progress = await this.prisma.lessonProgress.findMany({
      where: {
        userId,
        courseId,
        ...(enrollmentId ? { enrollmentId } : {}),
      },
      select: {
        enrollmentId: true,
        lessonId: true,
        completedAt: true,
        lastViewedAt: true,
      },
    });
    const completedLessonIds = new Set(
      progress
        .filter((item) => item.completedAt !== null)
        .map((item) => item.lessonId),
    );
    const lesson = publishedLessons.find((item) => !completedLessonIds.has(item.id))
      ?? publishedLessons[0]
      ?? null;

    return this.serializeLessonTarget(courseId, courseSlug, lesson);
  }

  private serializeLessonTarget(
    courseId: string,
    courseSlug: string,
    lesson: PublishedLessonSummary | null,
  ) {
    return lesson
      ? {
          courseId,
          courseSlug,
          lessonId: lesson.id,
          lessonSlug: lesson.slug,
          lessonTitle: lesson.title,
        }
      : null;
  }

  private flattenPublishedLessons<T extends { lessons: PublishedLessonSummary[] }>(
    sections: T[],
  ) {
    return sections.flatMap((section) => section.lessons);
  }

  private buildStudentCourseState(
    enrollment: StudentEnrollmentRecord | null,
    publishedLessons: PublishedLessonSummary[],
    progress: LessonProgressSummary[],
  ) {
    const publishedLessonIds = new Set(publishedLessons.map((lesson) => lesson.id));
    const relevantProgress = progress.filter(
      (item) =>
        publishedLessonIds.has(item.lessonId) &&
        (!enrollment || !item.enrollmentId || item.enrollmentId === enrollment.id),
    );
    const completedProgressRows = relevantProgress.filter((item) => item.completedAt !== null);
    const completedLessonIds = new Set(completedProgressRows.map((item) => item.lessonId));
    const totalLessons = publishedLessons.length;
    const completedLessons = completedProgressRows.length;
    const progressPercent =
      totalLessons > 0 && completedLessons >= totalLessons
        ? 100
        : totalLessons > 0
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0;
    const nextLesson =
      publishedLessons.find((lesson) => !completedLessonIds.has(lesson.id)) ?? null;
    const isEnrolled = Boolean(enrollment);
    const enrollmentStatus = this.resolveStudentEnrollmentStatus({
      enrollment,
      completedLessons,
      totalLessons,
      hasProgress: relevantProgress.length > 0,
    });

    return {
      isEnrolled,
      enrollmentStatus,
      progressPercent,
      completedLessons,
      totalLessons,
      currentLessonId: isEnrolled ? nextLesson?.id ?? null : null,
      currentLessonSlug: isEnrolled ? nextLesson?.slug ?? null : null,
      nextLessonId: nextLesson?.id ?? null,
      nextLessonSlug: nextLesson?.slug ?? null,
      firstCompletedAt: this.resolveEarliestDate(
        completedProgressRows.map((item) => item.completedAt),
      ),
      lastCompletedAt: this.resolveLatestDate(
        completedProgressRows.map((item) => item.completedAt),
      ),
    };
  }

  private buildDashboardAchievements(courseStates: DashboardCourseProgressState[]) {
    const completedLessons = courseStates.reduce(
      (sum, course) => sum + course.completedLessons,
      0,
    );
    const completedCourses = courseStates.filter(
      (course) => course.enrollmentStatus === 'COMPLETED',
    );
    const threatHuntingCourse =
      courseStates.find((course) => course.courseSlug === 'advanced-threat-hunting') ?? null;
    const incidentResponseCourse =
      courseStates.find((course) => course.courseSlug === 'incident-response-operations') ?? null;

    return [
      {
        id: 'first-lesson-completed',
        title: 'First Lesson Completed',
        unlocked: completedLessons > 0,
        unlockedAt: this.resolveEarliestDate(
          courseStates.map((course) => course.firstCompletedAt),
        ),
        progress: this.buildProgressMeter(Math.min(completedLessons, 1), 1),
      },
      {
        id: 'first-course-completed',
        title: 'First Course Completed',
        unlocked: completedCourses.length > 0,
        unlockedAt: this.resolveEarliestDate(
          completedCourses.map((course) => course.completedAt),
        ),
        progress: this.buildProgressMeter(Math.min(completedCourses.length, 1), 1),
      },
      {
        id: 'threat-hunting-progress',
        title: 'Threat Hunting Progress',
        unlocked: (threatHuntingCourse?.completedLessons ?? 0) > 0,
        unlockedAt: threatHuntingCourse?.firstCompletedAt ?? null,
        progress: this.buildProgressMeter(
          threatHuntingCourse?.completedLessons ?? 0,
          threatHuntingCourse?.totalLessons ?? 1,
        ),
      },
      {
        id: 'incident-response-completed',
        title: 'Incident Response Completed',
        unlocked: incidentResponseCourse?.enrollmentStatus === 'COMPLETED',
        unlockedAt:
          incidentResponseCourse?.enrollmentStatus === 'COMPLETED'
            ? incidentResponseCourse.completedAt
            : null,
        progress: this.buildProgressMeter(
          incidentResponseCourse?.completedLessons ?? 0,
          incidentResponseCourse?.totalLessons ?? 1,
        ),
      },
    ];
  }

  private buildNextBadge(courseStates: DashboardCourseProgressState[]) {
    const completedLessons = courseStates.reduce(
      (sum, course) => sum + course.completedLessons,
      0,
    );
    const completedCourses = courseStates.filter(
      (course) => course.enrollmentStatus === 'COMPLETED',
    ).length;

    if (completedLessons === 0) {
      return {
        id: 'first-lesson',
        title: 'First Lesson',
        progress: this.buildProgressMeter(0, 1),
      };
    }

    if (completedCourses > 0) {
      return {
        id: 'next-path-starter',
        title: 'Next Path Starter',
        progress: this.buildProgressMeter(completedCourses, completedCourses + 1),
      };
    }

    const activeCourse = [...courseStates]
      .filter((course) => course.totalLessons > 0)
      .sort((left, right) => right.progressPercent - left.progressPercent)[0] ?? null;

    return {
      id: 'course-finisher',
      title: 'Course Finisher',
      progress: this.buildProgressMeter(
        activeCourse?.completedLessons ?? completedLessons,
        activeCourse?.totalLessons ?? Math.max(completedLessons, 1),
      ),
    };
  }

  private buildSkillMatrix(courseStates: DashboardCourseProgressState[]) {
    return courseStates.map((course) => ({
      skill: course.skill,
      courseId: course.courseId,
      courseSlug: course.courseSlug,
      courseTitle: course.courseTitle,
      level: course.level,
      progressPercent: course.progressPercent,
      completedLessons: course.completedLessons,
      totalLessons: course.totalLessons,
      enrollmentStatus: course.enrollmentStatus,
    }));
  }

  private resolveSkillForCourse(courseSlug: string) {
    switch (courseSlug) {
      case 'advanced-threat-hunting':
        return 'Threat Hunting';
      case 'incident-response-operations':
        return 'Incident Response';
      case 'web-application-attack-lab':
        return 'Web Application Security';
      case 'network-defense-foundations':
        return 'Network Defense';
      default:
        return 'Cybersecurity';
    }
  }

  private buildProgressMeter(current: number, target: number) {
    const safeTarget = Math.max(target, 1);
    const safeCurrent = Math.min(Math.max(current, 0), safeTarget);

    return {
      current: safeCurrent,
      target: safeTarget,
      percent: Math.round((safeCurrent / safeTarget) * 100),
    };
  }

  private resolveEarliestDate(dates: Array<Date | null | undefined>) {
    const timestamps = dates
      .filter((date): date is Date => date instanceof Date)
      .map((date) => date.getTime());

    return timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
  }

  private resolveLatestDate(dates: Array<Date | null | undefined>) {
    const timestamps = dates
      .filter((date): date is Date => date instanceof Date)
      .map((date) => date.getTime());

    return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
  }

  private resolveStudentEnrollmentStatus(input: {
    enrollment: StudentEnrollmentRecord | null;
    completedLessons: number;
    totalLessons: number;
    hasProgress: boolean;
  }): StudentEnrollmentStatus {
    if (!input.enrollment) {
      return 'NOT_ENROLLED';
    }

    if (input.totalLessons > 0 && input.completedLessons >= input.totalLessons) {
      return 'COMPLETED';
    }

    if (input.enrollment.status === EnrollmentStatus.IN_PROGRESS || input.hasProgress) {
      return 'IN_PROGRESS';
    }

    return 'ENROLLED';
  }

  private resolveCompletionRequested(progressInput: UpdateLessonProgressDto) {
    return (
      progressInput.completed === true ||
      progressInput.completionRequested === true ||
      progressInput.markComplete === true
    );
  }

  private extractEngagement(progressInput: UpdateLessonProgressDto): LessonEngagementInput {
    return {
      ...(progressInput.scrollPercent !== undefined
        ? { scrollPercent: this.clamp(progressInput.scrollPercent, 0, 100) }
        : {}),
      ...(progressInput.watchPercent !== undefined
        ? { watchPercent: this.clamp(progressInput.watchPercent, 0, 100) }
        : {}),
      ...(progressInput.readingTimeSeconds !== undefined
        ? { readingTimeSeconds: Math.max(0, progressInput.readingTimeSeconds) }
        : {}),
    };
  }

  private mergeEngagement(
    existing: {
      scrollPercent: number;
      watchPercent: number;
      readingTimeSeconds: number;
    },
    engagement: LessonEngagementInput | undefined,
  ) {
    return {
      ...(engagement?.scrollPercent !== undefined
        ? { scrollPercent: Math.max(existing.scrollPercent, engagement.scrollPercent) }
        : {}),
      ...(engagement?.watchPercent !== undefined
        ? { watchPercent: Math.max(existing.watchPercent, engagement.watchPercent) }
        : {}),
      ...(engagement?.readingTimeSeconds !== undefined
        ? {
            readingTimeSeconds: Math.max(
              existing.readingTimeSeconds,
              engagement.readingTimeSeconds,
            ),
          }
        : {}),
    };
  }

  private isCompletionThresholdMet(
    contentMode: LessonContentModeValue,
    progress: {
      scrollPercent: number;
      watchPercent: number;
      readingTimeSeconds: number;
    },
  ) {
    if (contentMode === 'VIDEO') {
      return progress.watchPercent >= LESSON_WATCH_COMPLETION_PERCENT;
    }

    if (contentMode === 'TEXT') {
      return (
        progress.scrollPercent >= LESSON_SCROLL_COMPLETION_PERCENT &&
        progress.readingTimeSeconds >= DEFAULT_LESSON_READING_COMPLETION_SECONDS
      );
    }

    return (
      progress.watchPercent >= LESSON_WATCH_COMPLETION_PERCENT &&
      progress.scrollPercent >= LESSON_SCROLL_COMPLETION_PERCENT &&
      progress.readingTimeSeconds >= DEFAULT_LESSON_READING_COMPLETION_SECONDS
    );
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  private async syncEnrollmentCompletion(
    enrollmentId: string,
    courseId: string,
    userId: string,
    runner: PrismaRunner,
  ) {
    const [enrollment, totalPublishedLessons, completedLessons] = await Promise.all([
      runner.enrollment.findUnique({
        where: {
          id: enrollmentId,
        },
        select: {
          completedAt: true,
        },
      }),
      runner.lesson.count({
        where: {
          courseId,
          status: LessonStatus.PUBLISHED,
          publishedAt: {
            not: null,
          },
          section: {
            status: 'PUBLISHED',
            publishedAt: {
              not: null,
            },
          },
        },
      }),
      runner.lessonProgress.count({
        where: {
          enrollmentId,
          userId,
          completedAt: {
            not: null,
          },
          lesson: {
            courseId,
            status: LessonStatus.PUBLISHED,
            publishedAt: {
              not: null,
            },
            section: {
              status: 'PUBLISHED',
              publishedAt: {
                not: null,
              },
            },
          },
        },
      }),
    ]);

    const shouldComplete = totalPublishedLessons > 0 && completedLessons >= totalPublishedLessons;
    const completedAt = shouldComplete ? enrollment?.completedAt ?? new Date() : null;
    await runner.enrollment.update({
      where: { id: enrollmentId },
      data: shouldComplete
        ? {
            status: EnrollmentStatus.COMPLETED,
            completedAt,
          }
        : {
            status: EnrollmentStatus.IN_PROGRESS,
            completedAt: null,
          },
    });
  }

  private buildPublishedCourseLookupWhere(courseIdentifier: string): Prisma.CourseWhereInput {
    return {
      ...this.buildCourseIdentifierWhere(courseIdentifier),
      status: CourseStatus.PUBLISHED,
      publishedAt: {
        not: null,
      },
    };
  }

  private buildCourseIdentifierWhere(courseIdentifier: string): Prisma.CourseWhereInput {
    const normalizedIdentifier = courseIdentifier.trim();

    if (UUID_PATTERN.test(normalizedIdentifier)) {
      return {
        OR: [
          { id: normalizedIdentifier },
          { slug: normalizedIdentifier },
        ],
      };
    }

    return { slug: normalizedIdentifier };
  }

  private resolveLessonSlugCandidates(courseSlug: string, lessonIdentifier: string) {
    const normalizedIdentifier = lessonIdentifier.trim();
    const aliasedSlug =
      LESSON_SLUG_ALIASES_BY_COURSE_SLUG[courseSlug]?.[normalizedIdentifier] ?? null;

    return Array.from(
      new Set(
        [normalizedIdentifier, aliasedSlug].filter(
          (candidate): candidate is string => Boolean(candidate),
        ),
      ),
    );
  }

  private buildLessonIdentifierWhere(
    lessonIdentifier: string,
    courseSlug: string,
  ): Prisma.LessonWhereInput {
    const normalizedIdentifier = lessonIdentifier.trim();
    const slugCandidates = this.resolveLessonSlugCandidates(courseSlug, normalizedIdentifier);

    if (UUID_PATTERN.test(normalizedIdentifier)) {
      return {
        OR: [
          { id: normalizedIdentifier },
          ...slugCandidates.map((slug) => ({ slug })),
        ],
      };
    }

    return {
      OR: slugCandidates.map((slug) => ({ slug })),
    };
  }

  private async getPublishedCourseIdentity(courseIdentifier: string) {
    const course = await this.prisma.course.findFirst({
      where: this.buildPublishedCourseLookupWhere(courseIdentifier),
      select: {
        id: true,
        slug: true,
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  private async getPublishedLesson(
    courseId: string,
    courseSlug: string,
    lessonIdentifier: string,
  ) {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        courseId,
        ...this.buildLessonIdentifierWhere(lessonIdentifier, courseSlug),
        status: LessonStatus.PUBLISHED,
        publishedAt: {
          not: null,
        },
        section: {
          status: 'PUBLISHED',
          publishedAt: {
            not: null,
          },
        },
        course: {
          status: CourseStatus.PUBLISHED,
          publishedAt: {
            not: null,
          },
        },
      },
      include: {
        section: true,
        quiz: {
          select: {
            id: true,
            status: true,
            publishedAt: true,
            targetType: true,
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    return lesson;
  }

  private async requireEnrollment(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    if (!enrollment) {
      throw new ForbiddenException('Enrollment required');
    }

    return enrollment;
  }

  private serializeEnrollment(enrollment: {
    id: string;
    courseId: string;
    status: EnrollmentStatus;
    enrolledAt: Date;
    completedAt: Date | null;
    lastAccessedAt: Date | null;
  }) {
    return {
      id: enrollment.id,
      courseId: enrollment.courseId,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      completedAt: enrollment.completedAt,
      lastAccessedAt: enrollment.lastAccessedAt,
    };
  }

  private serializeLesson(lesson: {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    contentMode: LessonContentModeValue;
    textContent: string | null;
    videoProvider: string | null;
    videoAssetId: string | null;
    videoDurationSeconds: number | null;
    publishedAt: Date | null;
    quiz?: {
      id: string;
      status: QuizStatus;
      publishedAt: Date | null;
      targetType: QuizTargetType;
    } | null;
  }) {
    const modeFields = this.serializeLessonModeFields(lesson);
    const video = this.serializeLessonVideo({
      ...lesson,
      contentMode: modeFields.contentMode,
    });

    return {
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      summary: lesson.summary,
      ...modeFields,
      textContent: this.lessonHasTextContent(modeFields.contentMode) ? lesson.textContent : null,
      video,
      protectedMedia: video,
      media: {
        video,
      },
      completionRequirements: this.serializeCompletionRequirements(modeFields.contentMode),
      publishedAt: lesson.publishedAt,
      ...this.serializeStudentQuizLink(lesson.quiz),
    };
  }

  private serializeLessonModeFields(lesson: LessonModeSerializationInput) {
    const resolvedMode = this.resolveSerializedLessonContentMode(lesson);
    const response = {
      type: resolvedMode,
      contentMode: resolvedMode,
    };

    this.logger.log(
      `[BACKEND_LESSON_MODE_FINAL] ${JSON.stringify({
        lessonSlug: lesson.slug,
        dbContentMode: lesson.contentMode,
        hasVideo: this.lessonHasProtectedVideoMetadata(lesson),
        hasText: this.lessonHasTextBody(lesson),
        resolvedMode,
        responseType: response.type,
        responseContentMode: response.contentMode,
      })}`,
    );

    return response;
  }

  private resolveSerializedLessonContentMode(
    lesson: LessonModeSerializationInput,
  ): LessonContentModeValue {
    if (lesson.contentMode === 'VIDEO' || lesson.contentMode === 'HYBRID') {
      return lesson.contentMode;
    }

    if (this.lessonHasProtectedVideoMetadata(lesson)) {
      return this.lessonHasTextBody(lesson) ? 'HYBRID' : 'VIDEO';
    }

    return 'TEXT';
  }

  private lessonHasProtectedVideoMetadata(lesson: {
    videoProvider: string | null;
    videoAssetId: string | null;
  }) {
    return Boolean(lesson.videoProvider && lesson.videoAssetId);
  }

  private lessonHasTextBody(lesson: { textContent: string | null }) {
    return Boolean(lesson.textContent?.trim());
  }

  private lessonHasTextContent(contentMode: LessonContentModeValue) {
    return contentMode === 'TEXT' || contentMode === 'HYBRID';
  }

  private lessonHasVideoContent(contentMode: LessonContentModeValue) {
    return contentMode === 'VIDEO' || contentMode === 'HYBRID';
  }

  private serializeLessonVideo(lesson: {
    contentMode: LessonContentModeValue;
    videoProvider: string | null;
    videoAssetId: string | null;
    videoDurationSeconds: number | null;
  }) {
    if (!this.lessonHasVideoContent(lesson.contentMode)) {
      return null;
    }

    if (!lesson.videoProvider || !lesson.videoAssetId) {
      return {
        type: 'VIDEO',
        protected: true,
        downloadable: false,
        durationSeconds: lesson.videoDurationSeconds,
        access: {
          isReady: false,
          reason: 'media_not_configured',
        },
      };
    }

    return {
      type: 'VIDEO',
      provider: lesson.videoProvider,
      durationSeconds: lesson.videoDurationSeconds,
      protected: true,
      downloadable: false,
      access: {
        isReady: false,
        reason: 'delivery_not_configured',
      },
    };
  }

  private serializeCompletionRequirements(contentMode: LessonContentModeValue) {
    return {
      scrollPercent: this.lessonHasTextContent(contentMode)
        ? LESSON_SCROLL_COMPLETION_PERCENT
        : null,
      watchPercent: this.lessonHasVideoContent(contentMode)
        ? LESSON_WATCH_COMPLETION_PERCENT
        : null,
      readingTimeSeconds: this.lessonHasTextContent(contentMode)
        ? DEFAULT_LESSON_READING_COMPLETION_SECONDS
        : null,
    };
  }

  private serializeQuizPresence(
    quiz:
      | {
          id?: string;
          status?: QuizStatus;
          publishedAt?: Date | null;
          targetType?: QuizTargetType;
        }
      | null
      | undefined,
  ) {
    return {
      hasQuiz: this.resolvePublishedQuiz(quiz) !== null,
    };
  }

  private serializeStudentQuizLink(
    quiz:
      | {
          id?: string;
          status?: QuizStatus;
          publishedAt?: Date | null;
          targetType?: QuizTargetType;
        }
      | null
      | undefined,
  ) {
    const publishedQuiz = this.resolvePublishedQuiz(quiz);

    return {
      hasQuiz: Boolean(publishedQuiz),
      quizId: publishedQuiz?.id ?? null,
    };
  }

  private resolvePublishedQuiz(
    quiz:
      | {
          id?: string;
          status?: QuizStatus;
          publishedAt?: Date | null;
          targetType?: QuizTargetType;
        }
      | null
      | undefined,
  ) {
    return quiz &&
      quiz.status === QuizStatus.PUBLISHED &&
      quiz.publishedAt &&
      (quiz.targetType === undefined ||
        quiz.targetType === QuizTargetType.LESSON ||
        quiz.targetType === QuizTargetType.COURSE)
      ? quiz
      : null;
  }

  private serializeProgress(progress: {
    startedAt: Date;
    lastViewedAt: Date;
    scrollPercent: number;
    watchPercent: number;
    readingTimeSeconds: number;
    completedAt: Date | null;
  }) {
    return {
      startedAt: progress.startedAt,
      lastViewedAt: progress.lastViewedAt,
      scrollPercent: progress.scrollPercent,
      watchPercent: progress.watchPercent,
      readingTimeSeconds: progress.readingTimeSeconds,
      completedAt: progress.completedAt,
      completed: Boolean(progress.completedAt),
      isCompleted: Boolean(progress.completedAt),
    };
  }

  private serializeLessonProgress(progress: {
    lessonId: string;
    courseId: string;
    scrollPercent: number;
    watchPercent: number;
    readingTimeSeconds: number;
    completedAt: Date | null;
  }) {
    return {
      lessonId: progress.lessonId,
      courseId: progress.courseId,
      scrollPercent: progress.scrollPercent,
      watchPercent: progress.watchPercent,
      readingTimeSeconds: progress.readingTimeSeconds,
      completed: Boolean(progress.completedAt),
      completedAt: progress.completedAt,
    };
  }

  private logProgressDebug(message: string, metadata: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug({
        event: message,
        ...metadata,
      });
    }
  }
}
