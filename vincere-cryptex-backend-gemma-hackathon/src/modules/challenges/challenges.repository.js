import { db } from '../../config/db.js';
import { ChallengeStatuses, ChallengeStudentStatuses } from './challenge.constants.js';

const CHALLENGE_SAFE_SELECT = `
  c.id,
  c.title,
  c.description,
  c.category,
  c.difficulty,
  c.points,
  c.download_name,
  c.download_storage_key,
  c.download_size_bytes,
  c.published_at,
  c.created_at,
  c.updated_at
`;

const buildChallengeFilters = ({ search, category, difficulty }) => {
  const values = [ChallengeStatuses.PUBLISHED];
  const conditions = ['c.status = $1', 'hint_counts.total_hints = 2'];

  if (search) {
    values.push(search);
    const param = `$${values.length}`;
    conditions.push(`(LOWER(c.title) LIKE '%' || LOWER(${param}) || '%' OR LOWER(c.category) LIKE '%' || LOWER(${param}) || '%')`);
  }

  if (category) {
    values.push(category);
    conditions.push(`LOWER(c.category) = LOWER($${values.length})`);
  }

  if (difficulty) {
    values.push(difficulty);
    conditions.push(`c.difficulty = $${values.length}`);
  }

  return {
    values,
    whereClause: `WHERE ${conditions.join(' AND ')}`
  };
};

export const challengesRepository = {
  listPublishedChallengesForStudent: async (
    { userId, search, category, difficulty, limit, offset },
    runner = db
  ) => {
    const { values, whereClause } = buildChallengeFilters({ search, category, difficulty });
    const rowValues = [
      ...values,
      ChallengeStudentStatuses.SOLVED,
      ChallengeStudentStatuses.ATTEMPTED,
      ChallengeStudentStatuses.NOT_STARTED,
      userId,
      limit,
      offset
    ];

    const [rowsResult, countResult] = await Promise.all([
      runner.query(
        `SELECT
           ${CHALLENGE_SAFE_SELECT},
           COALESCE(hint_counts.total_hints, 0)::INT AS total_hints,
           COALESCE(attempt_counts.total_attempts, 0)::INT AS total_attempts,
           completion.points_awarded,
           completion.solved_at,
           CASE
             WHEN completion.id IS NOT NULL THEN $${values.length + 1}
             WHEN COALESCE(attempt_counts.total_attempts, 0) > 0 THEN $${values.length + 2}
             ELSE $${values.length + 3}
           END AS student_status
         FROM challenges c
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::INT AS total_hints
           FROM challenge_hints challenge_hint
           WHERE challenge_hint.challenge_id = c.id
         ) AS hint_counts ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::INT AS total_attempts
           FROM challenge_attempts challenge_attempt
           WHERE challenge_attempt.challenge_id = c.id
             AND challenge_attempt.user_id = $${values.length + 4}
         ) AS attempt_counts ON TRUE
         LEFT JOIN challenge_completions completion
           ON completion.challenge_id = c.id
          AND completion.user_id = $${values.length + 4}
         ${whereClause}
         ORDER BY c.points DESC, c.title ASC
         LIMIT $${values.length + 5}
         OFFSET $${values.length + 6}`,
        rowValues
      ),
      runner.query(
        `SELECT COUNT(*)::INT AS total
         FROM challenges c
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::INT AS total_hints
           FROM challenge_hints challenge_hint
           WHERE challenge_hint.challenge_id = c.id
         ) AS hint_counts ON TRUE
         ${whereClause}`,
        values
      )
    ]);

    return {
      challenges: rowsResult.rows,
      total: countResult.rows[0]?.total ?? 0
    };
  },

  findPublishedChallengeForStudentById: async ({ userId, challengeId }, runner = db) => {
    const result = await runner.query(
      `SELECT
         ${CHALLENGE_SAFE_SELECT},
         COALESCE(hint_counts.total_hints, 0)::INT AS total_hints,
         COALESCE(attempt_counts.total_attempts, 0)::INT AS total_attempts,
         completion.points_awarded,
         completion.solved_at,
         CASE
           WHEN completion.id IS NOT NULL THEN $3
           WHEN COALESCE(attempt_counts.total_attempts, 0) > 0 THEN $4
           ELSE $5
         END AS student_status
       FROM challenges c
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS total_hints
         FROM challenge_hints challenge_hint
         WHERE challenge_hint.challenge_id = c.id
       ) AS hint_counts ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS total_attempts
         FROM challenge_attempts challenge_attempt
         WHERE challenge_attempt.challenge_id = c.id
           AND challenge_attempt.user_id = $1
       ) AS attempt_counts ON TRUE
       LEFT JOIN challenge_completions completion
         ON completion.challenge_id = c.id
        AND completion.user_id = $1
       WHERE c.id = $2
         AND c.status = $6
         AND hint_counts.total_hints = 2
       LIMIT 1`,
      [
        userId,
        challengeId,
        ChallengeStudentStatuses.SOLVED,
        ChallengeStudentStatuses.ATTEMPTED,
        ChallengeStudentStatuses.NOT_STARTED,
        ChallengeStatuses.PUBLISHED
      ]
    );

    return result.rows[0] ?? null;
  },

  listChallengeHintsForStudent: async ({ userId, challengeId }, runner = db) => {
    const result = await runner.query(
      `SELECT
         challenge_hint.id,
         challenge_hint.challenge_id,
         challenge_hint.position,
         challenge_hint.title,
         challenge_hint.content,
         challenge_hint.created_at,
         challenge_hint.updated_at,
         challenge_hint_usage.used_at
       FROM challenge_hints challenge_hint
       INNER JOIN challenges c
         ON c.id = challenge_hint.challenge_id
        AND c.status = $2
       INNER JOIN (
         SELECT challenge_id
         FROM challenge_hints
         GROUP BY challenge_id
         HAVING COUNT(*) = 2
       ) AS valid_hints
         ON valid_hints.challenge_id = c.id
       LEFT JOIN challenge_hint_usages challenge_hint_usage
         ON challenge_hint_usage.challenge_hint_id = challenge_hint.id
        AND challenge_hint_usage.user_id = $1
       WHERE challenge_hint.challenge_id = $3
       ORDER BY challenge_hint.position ASC`,
      [userId, ChallengeStatuses.PUBLISHED, challengeId]
    );

    return result.rows;
  },

  findChallengeHintForStudent: async ({ userId, challengeId, position }, runner = db) => {
    const result = await runner.query(
      `SELECT
         challenge_hint.id,
         challenge_hint.challenge_id,
         challenge_hint.position,
         challenge_hint.title,
         challenge_hint.content,
         challenge_hint.created_at,
         challenge_hint.updated_at,
         challenge_hint_usage.used_at
       FROM challenge_hints challenge_hint
       INNER JOIN challenges c
         ON c.id = challenge_hint.challenge_id
        AND c.status = $2
       INNER JOIN (
         SELECT challenge_id
         FROM challenge_hints
         GROUP BY challenge_id
         HAVING COUNT(*) = 2
       ) AS valid_hints
         ON valid_hints.challenge_id = c.id
       LEFT JOIN challenge_hint_usages challenge_hint_usage
         ON challenge_hint_usage.challenge_hint_id = challenge_hint.id
        AND challenge_hint_usage.user_id = $1
       WHERE challenge_hint.challenge_id = $3
         AND challenge_hint.position = $4
       LIMIT 1`,
      [userId, ChallengeStatuses.PUBLISHED, challengeId, position]
    );

    return result.rows[0] ?? null;
  },

  upsertChallengeHintUsage: async ({ userId, challengeHintId }, runner = db) => {
    const result = await runner.query(
      `WITH inserted_usage AS (
         INSERT INTO challenge_hint_usages (challenge_hint_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (challenge_hint_id, user_id) DO NOTHING
         RETURNING id, challenge_hint_id, user_id, used_at, created_at, updated_at, TRUE AS inserted
       )
       SELECT *
       FROM inserted_usage
       UNION ALL
       SELECT
         existing_usage.id,
         existing_usage.challenge_hint_id,
         existing_usage.user_id,
         existing_usage.used_at,
         existing_usage.created_at,
         existing_usage.updated_at,
         FALSE AS inserted
       FROM challenge_hint_usages existing_usage
       WHERE existing_usage.challenge_hint_id = $1
         AND existing_usage.user_id = $2
         AND NOT EXISTS (SELECT 1 FROM inserted_usage)
       LIMIT 1`,
      [challengeHintId, userId]
    );

    return result.rows[0] ?? null;
  },

  findPublishedChallengeWithFlagById: async ({ userId, challengeId }, runner = db) => {
    const result = await runner.query(
      `SELECT
         c.id,
         c.title,
         c.description,
         c.category,
         c.difficulty,
         c.points,
         c.flag_hash,
         c.download_name,
         c.download_storage_key,
         c.download_size_bytes,
         c.published_at,
         c.created_at,
         c.updated_at,
         COALESCE(hint_counts.total_hints, 0)::INT AS total_hints,
         COALESCE(attempt_counts.total_attempts, 0)::INT AS total_attempts,
         completion.id AS completion_id,
         completion.points_awarded,
         completion.solved_at,
         CASE
           WHEN completion.id IS NOT NULL THEN $3
           WHEN COALESCE(attempt_counts.total_attempts, 0) > 0 THEN $4
           ELSE $5
         END AS student_status
       FROM challenges c
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS total_hints
         FROM challenge_hints challenge_hint
         WHERE challenge_hint.challenge_id = c.id
       ) AS hint_counts ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS total_attempts
         FROM challenge_attempts challenge_attempt
         WHERE challenge_attempt.challenge_id = c.id
           AND challenge_attempt.user_id = $1
       ) AS attempt_counts ON TRUE
       LEFT JOIN challenge_completions completion
         ON completion.challenge_id = c.id
        AND completion.user_id = $1
       WHERE c.id = $2
         AND c.status = $6
         AND hint_counts.total_hints = 2
       LIMIT 1`,
      [
        userId,
        challengeId,
        ChallengeStudentStatuses.SOLVED,
        ChallengeStudentStatuses.ATTEMPTED,
        ChallengeStudentStatuses.NOT_STARTED,
        ChallengeStatuses.PUBLISHED
      ]
    );

    return result.rows[0] ?? null;
  },

  createChallengeAttempt: async (
    {
      challengeId,
      userId,
      submittedFlagHash,
      isCorrect,
      alreadySolved
    },
    runner = db
  ) => {
    const result = await runner.query(
      `INSERT INTO challenge_attempts (
         challenge_id,
         user_id,
         submitted_flag_hash,
         is_correct,
         already_solved
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, challenge_id, user_id, submitted_flag_hash, is_correct, already_solved, created_at, updated_at`,
      [challengeId, userId, submittedFlagHash, isCorrect, alreadySolved]
    );

    return result.rows[0] ?? null;
  },

  createChallengeCompletion: async (
    {
      challengeId,
      userId,
      firstCorrectAttemptId,
      pointsAwarded
    },
    runner = db
  ) => {
    const result = await runner.query(
      `INSERT INTO challenge_completions (
         challenge_id,
         user_id,
         first_correct_attempt_id,
         points_awarded
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (challenge_id, user_id) DO NOTHING
       RETURNING id, challenge_id, user_id, first_correct_attempt_id, points_awarded, solved_at, created_at, updated_at`,
      [challengeId, userId, firstCorrectAttemptId, pointsAwarded]
    );

    return result.rows[0] ?? null;
  },

  findChallengeCompletionByUser: async ({ challengeId, userId }, runner = db) => {
    const result = await runner.query(
      `SELECT
         id,
         challenge_id,
         user_id,
         first_correct_attempt_id,
         points_awarded,
         solved_at,
         created_at,
         updated_at
       FROM challenge_completions
       WHERE challenge_id = $1
         AND user_id = $2
       LIMIT 1`,
      [challengeId, userId]
    );

    return result.rows[0] ?? null;
  },

  getStudentChallengeScore: async ({ userId }, runner = db) => {
    const result = await runner.query(
      `SELECT COALESCE(SUM(points_awarded), 0)::INT AS total_score
       FROM challenge_completions
       WHERE user_id = $1`,
      [userId]
    );

    return result.rows[0]?.total_score ?? 0;
  }
};
