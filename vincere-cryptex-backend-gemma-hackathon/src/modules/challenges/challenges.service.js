import crypto from 'crypto';
import { Roles } from '../../shared/constants/roles.js';
import { AppError } from '../../shared/errors/app-error.js';
import { sha256 } from '../../shared/utils/crypto.js';
import { ActivityTypes, EntityTypes, activityService } from '../activity/activity.service.js';
import {
  ChallengeDifficulties,
  ChallengeHintPositions,
  ChallengeStudentStatuses
} from './challenge.constants.js';
import { challengesRepository } from './challenges.repository.js';
import { db } from '../../config/db.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, fieldName) => {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError(`Valid ${fieldName} is required`, 400);
  }
};

const assertStudentUser = (user) => {
  if (!user || user.role !== Roles.STUDENT) {
    throw new AppError('Student account required', 403);
  }
};

const normalizeSearch = (value) => (typeof value === 'string' ? value.trim().slice(0, 100) : '');

const normalizeCategory = (value) => (typeof value === 'string' ? value.trim().slice(0, 100) : '');

const parsePositiveInteger = (value, fallback, fieldName) => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(`${fieldName} must be a positive integer`, 400);
  }

  return parsed;
};

const normalizeDifficulty = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalizedDifficulty = String(value).trim().toLowerCase();
  if (!Object.values(ChallengeDifficulties).includes(normalizedDifficulty)) {
    throw new AppError('Invalid challenge difficulty filter', 400);
  }

  return normalizedDifficulty;
};

const parseHintPosition = (value) => {
  const position = Number.parseInt(String(value), 10);
  if (![ChallengeHintPositions.FIRST, ChallengeHintPositions.SECOND].includes(position)) {
    throw new AppError('Hint position must be 1 or 2', 400);
  }

  return position;
};

const trimOuterSpaces = (value) => value.replace(/^ +| +$/g, '');

const normalizeSubmittedFlag = (flag) => {
  if (typeof flag !== 'string') {
    throw new AppError('Flag is required', 400);
  }

  // Flag submissions are intentionally case-sensitive.
  // We only forgive accidental outer spaces and preserve internal spacing exactly as submitted.
  const normalizedFlag = trimOuterSpaces(flag);
  if (!normalizedFlag) {
    throw new AppError('Flag is required', 400);
  }

  if (normalizedFlag.length > 512) {
    throw new AppError('Flag is too long', 400);
  }

  return normalizedFlag;
};

const compareFlagHashes = (submittedFlagHash, storedFlagHash) => {
  // Hash comparison stays timing-safe after the explicit normalization policy above is applied.
  const submittedBuffer = Buffer.from(submittedFlagHash, 'hex');
  const storedBuffer = Buffer.from(storedFlagHash, 'hex');

  if (submittedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(submittedBuffer, storedBuffer);
};

const buildPagination = ({ page, pageSize, total }) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
});

const sanitizeChallengeSummary = (challenge) => ({
  id: challenge.id,
  title: challenge.title,
  category: challenge.category,
  difficulty: challenge.difficulty,
  points: challenge.points,
  hasDownload: Boolean(challenge.download_storage_key),
  studentStatus: challenge.student_status,
  pointsAwarded: challenge.points_awarded ?? 0,
  solvedAt: challenge.solved_at,
  publishedAt: challenge.published_at
});

const sanitizeHint = (hint) => ({
  id: hint.id,
  position: hint.position,
  title: hint.title,
  content: hint.used_at ? hint.content : null,
  isUsed: Boolean(hint.used_at),
  usedAt: hint.used_at
});

const sanitizeChallengeDetail = (challenge, hints) => ({
  id: challenge.id,
  title: challenge.title,
  description: challenge.description,
  category: challenge.category,
  difficulty: challenge.difficulty,
  points: challenge.points,
  studentStatus: challenge.student_status,
  pointsAwarded: challenge.points_awarded ?? 0,
  solvedAt: challenge.solved_at,
  publishedAt: challenge.published_at,
  downloadableFile: challenge.download_storage_key
    ? {
        name: challenge.download_name,
        sizeBytes: challenge.download_size_bytes
      }
    : null,
  hints: hints.map(sanitizeHint)
});

const sanitizeHintUsage = (hint, inserted) => ({
  hint: {
    id: hint.id,
    position: hint.position,
    title: hint.title,
    content: hint.content,
    isUsed: true,
    usedAt: hint.used_at
  },
  alreadyUsed: !inserted
});

const sanitizeFlagSubmissionResult = ({
  challengeId,
  correct,
  alreadySolved,
  awardedPoints,
  totalScore,
  solvedAt,
  studentStatus,
  submittedAt
}) => ({
  challengeId,
  correct,
  alreadySolved,
  awardedPoints,
  totalScore,
  solvedAt,
  studentStatus,
  submittedAt
});

export const challengesService = {
  listPublishedChallenges: async ({ user, search, category, difficulty, page, pageSize }) => {
    assertStudentUser(user);

    const currentPage = parsePositiveInteger(page, DEFAULT_PAGE, 'page');
    const currentPageSize = parsePositiveInteger(pageSize, DEFAULT_PAGE_SIZE, 'pageSize');
    if (currentPageSize > MAX_PAGE_SIZE) {
      throw new AppError(`pageSize must be ${MAX_PAGE_SIZE} or fewer`, 400);
    }

    const offset = (currentPage - 1) * currentPageSize;
    const { challenges, total } = await challengesRepository.listPublishedChallengesForStudent({
      userId: user.id,
      search: normalizeSearch(search),
      category: normalizeCategory(category),
      difficulty: normalizeDifficulty(difficulty),
      limit: currentPageSize,
      offset
    });

    return {
      challenges: challenges.map(sanitizeChallengeSummary),
      pagination: buildPagination({
        page: currentPage,
        pageSize: currentPageSize,
        total
      })
    };
  },

  getChallengeDetails: async ({ user, challengeId }) => {
    assertStudentUser(user);
    assertUuid(challengeId, 'challenge id');

    const challenge = await challengesRepository.findPublishedChallengeForStudentById({
      userId: user.id,
      challengeId
    });

    if (!challenge) {
      throw new AppError('Challenge not found', 404);
    }

    const hints = await challengesRepository.listChallengeHintsForStudent({
      userId: user.id,
      challengeId
    });

    if (hints.length !== 2) {
      throw new AppError('Challenge is not available yet', 409);
    }

    return {
      challenge: sanitizeChallengeDetail(challenge, hints)
    };
  },

  useHint: async ({ user, challengeId, hintPosition }) => {
    assertStudentUser(user);
    assertUuid(challengeId, 'challenge id');

    const position = parseHintPosition(hintPosition);
    const hint = await challengesRepository.findChallengeHintForStudent({
      userId: user.id,
      challengeId,
      position
    });

    if (!hint) {
      throw new AppError('Hint not found', 404);
    }

    const client = await db.connect();
    let usage = null;

    try {
      await client.query('BEGIN');
      usage = await challengesRepository.upsertChallengeHintUsage(
        {
          userId: user.id,
          challengeHintId: hint.id
        },
        client
      );

      if (!usage) {
        throw new AppError('Hint usage could not be recorded', 500);
      }

      if (usage.inserted) {
        await activityService.logActivity({
          userId: user.id,
          activityType: ActivityTypes.CHALLENGE_HINT_USED,
          entityType: EntityTypes.CHALLENGE,
          entityId: challengeId,
          metadata: {
            hintPosition: hint.position
          },
          runner: client
        });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return sanitizeHintUsage(
      {
        ...hint,
        used_at: usage.used_at
      },
      usage.inserted
    );
  },

  submitFlag: async ({ user, challengeId, flag }) => {
    assertStudentUser(user);
    assertUuid(challengeId, 'challenge id');

    const normalizedFlag = normalizeSubmittedFlag(flag);
    const submittedFlagHash = sha256(normalizedFlag);

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const challenge = await challengesRepository.findPublishedChallengeWithFlagById(
        {
          userId: user.id,
          challengeId
        },
        client
      );

      if (!challenge) {
        throw new AppError('Challenge not found', 404);
      }

      const isCorrect = compareFlagHashes(submittedFlagHash, challenge.flag_hash);
      const wasAlreadySolved = Boolean(challenge.completion_id);

      const attempt = await challengesRepository.createChallengeAttempt(
        {
          challengeId,
          userId: user.id,
          submittedFlagHash,
          isCorrect,
          alreadySolved: wasAlreadySolved
        },
        client
      );

      if (!attempt) {
        throw new AppError('Challenge attempt could not be recorded', 500);
      }

      let awardedPoints = 0;
      let solvedAt = challenge.solved_at;
      let studentStatus = challenge.student_status;

      if (isCorrect) {
        const completion = wasAlreadySolved
          ? null
          : await challengesRepository.createChallengeCompletion(
              {
                challengeId,
                userId: user.id,
                firstCorrectAttemptId: attempt.id,
                pointsAwarded: challenge.points
              },
              client
            );

        if (completion) {
          awardedPoints = completion.points_awarded;
          solvedAt = completion.solved_at;
          studentStatus = ChallengeStudentStatuses.SOLVED;

          await activityService.logActivity({
            userId: user.id,
            activityType: ActivityTypes.CHALLENGE_SOLVED,
            entityType: EntityTypes.CHALLENGE,
            entityId: challengeId,
            metadata: {
              pointsAwarded: completion.points_awarded
            },
            runner: client
          });
        } else if (!wasAlreadySolved) {
          const existingCompletion = await challengesRepository.findChallengeCompletionByUser(
            {
              challengeId,
              userId: user.id
            },
            client
          );

          if (existingCompletion) {
            solvedAt = existingCompletion.solved_at;
            studentStatus = ChallengeStudentStatuses.SOLVED;
          }
        } else {
          studentStatus = ChallengeStudentStatuses.SOLVED;
        }
      } else if (!wasAlreadySolved) {
        studentStatus = ChallengeStudentStatuses.ATTEMPTED;
      }

      const totalScore = await challengesRepository.getStudentChallengeScore(
        {
          userId: user.id
        },
        client
      );

      await client.query('COMMIT');

      return {
        result: sanitizeFlagSubmissionResult({
          challengeId,
          correct: isCorrect,
          alreadySolved: wasAlreadySolved,
          awardedPoints,
          totalScore,
          solvedAt,
          studentStatus,
          submittedAt: attempt.created_at
        })
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};
