import { db } from '../../config/db.js';
import {
  CourseStatuses,
  LessonStatuses,
  SectionStatuses
} from '../courses/course.constants.js';
import {
  QuizAttemptStatuses,
  QuizQuestionTypes,
  QuizStatuses,
  QuizTargetTypes
} from './quiz.constants.js';

const QUIZ_SELECT = `
  q.id,
  q.course_id,
  q.lesson_id,
  q.target_type,
  q.title,
  q.description,
  q.status,
  q.pass_percentage,
  q.published_at,
  q.created_at,
  q.updated_at
`;

const ATTEMPT_SELECT = `
  qa.id,
  qa.quiz_id,
  qa.course_id,
  qa.lesson_id,
  qa.enrollment_id,
  qa.user_id,
  qa.status,
  qa.pass_percentage,
  qa.total_questions,
  qa.answered_questions,
  qa.correct_answers,
  qa.score_percentage,
  qa.passed,
  qa.started_at,
  qa.submitted_at,
  qa.created_at,
  qa.updated_at
`;

const ATTEMPT_ANSWER_SELECT = `
  qaa.id,
  qaa.attempt_id,
  qaa.question_id,
  qaa.selected_choice_id,
  qaa.selected_choice_text,
  qaa.is_correct,
  qaa.created_at,
  qaa.updated_at
`;

const mapQuizQuestions = (rows, { includeCorrectAnswers = false } = {}) => {
  const questionsById = new Map();

  for (const row of rows) {
    const existingQuestion = questionsById.get(row.question_id);

    if (!existingQuestion) {
      questionsById.set(row.question_id, {
        id: row.question_id,
        type: row.question_type,
        prompt: row.prompt,
        position: row.question_position,
        choices: []
      });
    }

    const nextQuestion = questionsById.get(row.question_id);
    nextQuestion.choices.push({
      id: row.choice_id,
      choice_text: row.choice_text,
      position: row.choice_position,
      ...(includeCorrectAnswers ? { is_correct: row.is_correct } : {})
    });
  }

  return Array.from(questionsById.values());
};

const findQuizMetadataById = async (quizId, runner = db) => {
  const result = await runner.query(
    `SELECT
       ${QUIZ_SELECT},
       COALESCE(question_counts.total_questions, 0)::INT AS total_questions
     FROM quizzes q
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::INT AS total_questions
       FROM quiz_questions qq
       WHERE qq.quiz_id = q.id
     ) AS question_counts ON TRUE
     WHERE q.id = $1
     LIMIT 1`,
    [quizId]
  );

  return result.rows[0] ?? null;
};

const findQuizMetadataByTarget = async ({ courseId, lessonId = null }, runner = db) => {
  if (lessonId) {
    const result = await runner.query(
      `SELECT
         ${QUIZ_SELECT},
         COALESCE(question_counts.total_questions, 0)::INT AS total_questions
       FROM quizzes q
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS total_questions
         FROM quiz_questions qq
         WHERE qq.quiz_id = q.id
       ) AS question_counts ON TRUE
       WHERE q.course_id = $1
         AND q.lesson_id = $2
         AND q.target_type = $3
       LIMIT 1`,
      [courseId, lessonId, QuizTargetTypes.LESSON]
    );

    return result.rows[0] ?? null;
  }

  const result = await runner.query(
    `SELECT
       ${QUIZ_SELECT},
       COALESCE(question_counts.total_questions, 0)::INT AS total_questions
     FROM quizzes q
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::INT AS total_questions
       FROM quiz_questions qq
       WHERE qq.quiz_id = q.id
     ) AS question_counts ON TRUE
     WHERE q.course_id = $1
       AND q.lesson_id IS NULL
       AND q.target_type = $2
     LIMIT 1`,
    [courseId, QuizTargetTypes.COURSE]
  );

  return result.rows[0] ?? null;
};

const findStudentQuizMetadata = async ({ userId, courseId, lessonId = null }, runner = db) => {
  if (lessonId) {
    const result = await runner.query(
      `SELECT
         ${QUIZ_SELECT},
         COALESCE(question_counts.total_questions, 0)::INT AS total_questions
       FROM quizzes q
       INNER JOIN courses c
         ON c.id = q.course_id
        AND c.status = $4
       INNER JOIN lessons l
         ON l.id = q.lesson_id
        AND l.status = $5
       INNER JOIN sections s
         ON s.id = l.section_id
        AND s.status = $6
       INNER JOIN enrollments e
         ON e.course_id = q.course_id
        AND e.user_id = $1
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS total_questions
         FROM quiz_questions qq
         WHERE qq.quiz_id = q.id
       ) AS question_counts ON TRUE
       WHERE q.course_id = $2
         AND q.lesson_id = $3
         AND q.target_type = $7
         AND q.status = $8
       LIMIT 1`,
      [
        userId,
        courseId,
        lessonId,
        CourseStatuses.PUBLISHED,
        LessonStatuses.PUBLISHED,
        SectionStatuses.PUBLISHED,
        QuizTargetTypes.LESSON,
        QuizStatuses.PUBLISHED
      ]
    );

    return result.rows[0] ?? null;
  }

  const result = await runner.query(
    `SELECT
       ${QUIZ_SELECT},
       COALESCE(question_counts.total_questions, 0)::INT AS total_questions
     FROM quizzes q
     INNER JOIN courses c
       ON c.id = q.course_id
      AND c.status = $3
     INNER JOIN enrollments e
       ON e.course_id = q.course_id
      AND e.user_id = $1
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::INT AS total_questions
       FROM quiz_questions qq
       WHERE qq.quiz_id = q.id
     ) AS question_counts ON TRUE
     WHERE q.course_id = $2
       AND q.lesson_id IS NULL
       AND q.target_type = $4
       AND q.status = $5
     LIMIT 1`,
    [
      userId,
      courseId,
      CourseStatuses.PUBLISHED,
      QuizTargetTypes.COURSE,
      QuizStatuses.PUBLISHED
    ]
  );

  return result.rows[0] ?? null;
};

const findQuizQuestions = async (quizId, { includeCorrectAnswers = false } = {}, runner = db) => {
  const correctAnswerSelect = includeCorrectAnswers ? ', qc.is_correct' : '';
  const result = await runner.query(
    `SELECT
       qq.id AS question_id,
       qq.type AS question_type,
       qq.prompt,
       qq.position AS question_position,
       qc.id AS choice_id,
       qc.choice_text,
       qc.position AS choice_position
       ${correctAnswerSelect}
     FROM quiz_questions qq
     INNER JOIN quiz_choices qc
       ON qc.question_id = qq.id
     WHERE qq.quiz_id = $1
     ORDER BY qq.position ASC, qc.position ASC`,
    [quizId]
  );

  return mapQuizQuestions(result.rows, { includeCorrectAnswers });
};

export const quizzesRepository = {
  createQuiz: async (
    {
      courseId,
      lessonId = null,
      targetType,
      title,
      description = null,
      status = QuizStatuses.DRAFT,
      passPercentage = 70,
      publishedAt = null
    },
    runner = db
  ) => {
    if (targetType === QuizTargetTypes.LESSON) {
      const result = await runner.query(
        `INSERT INTO quizzes (
           course_id,
           lesson_id,
           target_type,
           title,
           description,
           status,
           pass_percentage,
           published_at
         )
         SELECT
           c.id,
           l.id,
           $3,
           $4,
           $5,
           $6,
           $7,
           CASE
             WHEN $6 = $8 THEN COALESCE($9::timestamptz, NOW())
             ELSE NULL
           END
         FROM courses c
         INNER JOIN lessons l
           ON l.id = $2
          AND l.course_id = c.id
         WHERE c.id = $1
         RETURNING ${QUIZ_SELECT}`,
        [
          courseId,
          lessonId,
          QuizTargetTypes.LESSON,
          title,
          description,
          status,
          passPercentage,
          QuizStatuses.PUBLISHED,
          publishedAt
        ]
      );

      return result.rows[0] ?? null;
    }

    if (targetType !== QuizTargetTypes.COURSE) {
      return null;
    }

    const result = await runner.query(
      `INSERT INTO quizzes (
         course_id,
         lesson_id,
         target_type,
         title,
         description,
         status,
         pass_percentage,
         published_at
       )
       SELECT
         c.id,
         NULL,
         $2,
         $3,
         $4,
         $5,
         $6,
         CASE
           WHEN $5 = $7 THEN COALESCE($8::timestamptz, NOW())
           ELSE NULL
         END
       FROM courses c
       WHERE c.id = $1
       RETURNING ${QUIZ_SELECT}`,
      [
        courseId,
        QuizTargetTypes.COURSE,
        title,
        description,
        status,
        passPercentage,
        QuizStatuses.PUBLISHED,
        publishedAt
      ]
    );

    return result.rows[0] ?? null;
  },

  createQuizQuestion: async ({ quizId, prompt, position }, runner = db) => {
    const result = await runner.query(
      `INSERT INTO quiz_questions (quiz_id, type, prompt, position)
       SELECT
         q.id,
         $2,
         $3,
         $4
       FROM quizzes q
       WHERE q.id = $1
       RETURNING id, quiz_id, type, prompt, position, created_at, updated_at`,
      [quizId, QuizQuestionTypes.MCQ, prompt, position]
    );

    return result.rows[0] ?? null;
  },

  createQuizChoice: async ({ questionId, choiceText, position, isCorrect = false }, runner = db) => {
    const result = await runner.query(
      `INSERT INTO quiz_choices (question_id, choice_text, position, is_correct)
       SELECT
         qq.id,
         $2,
         $3,
         $4
       FROM quiz_questions qq
       WHERE qq.id = $1
       RETURNING id, question_id, choice_text, position, is_correct, created_at, updated_at`,
      [questionId, choiceText, position, isCorrect]
    );

    return result.rows[0] ?? null;
  },

  findQuizById: async (quizId, runner = db) => findQuizMetadataById(quizId, runner),

  findQuizByTarget: async ({ courseId, lessonId = null }, runner = db) =>
    findQuizMetadataByTarget({ courseId, lessonId }, runner),

  findQuizForStudent: async ({ userId, courseId, lessonId = null }, runner = db) => {
    const quiz = await findStudentQuizMetadata({ userId, courseId, lessonId }, runner);
    if (!quiz) {
      return null;
    }

    const questions = await findQuizQuestions(quiz.id, { includeCorrectAnswers: false }, runner);
    return {
      quiz,
      questions
    };
  },

  findQuizWithCorrectAnswers: async ({ quizId }, runner = db) => {
    const quiz = await findQuizMetadataById(quizId, runner);
    if (!quiz) {
      return null;
    }

    const questions = await findQuizQuestions(quiz.id, { includeCorrectAnswers: true }, runner);
    return {
      quiz,
      questions
    };
  },

  findInProgressAttemptByUserAndQuiz: async ({ userId, quizId }, runner = db) => {
    const result = await runner.query(
      `SELECT ${ATTEMPT_SELECT}
       FROM quiz_attempts qa
       WHERE qa.user_id = $1
         AND qa.quiz_id = $2
         AND qa.status = $3
       ORDER BY qa.started_at DESC
       LIMIT 1`,
      [userId, quizId, QuizAttemptStatuses.IN_PROGRESS]
    );

    return result.rows[0] ?? null;
  },

  findSubmittedAttemptByUserAndQuiz: async ({ userId, quizId }, runner = db) => {
    const result = await runner.query(
      `SELECT ${ATTEMPT_SELECT}
       FROM quiz_attempts qa
       WHERE qa.user_id = $1
         AND qa.quiz_id = $2
         AND qa.status = $3
       ORDER BY qa.submitted_at DESC NULLS LAST, qa.created_at DESC
       LIMIT 1`,
      [userId, quizId, QuizAttemptStatuses.SUBMITTED]
    );

    return result.rows[0] ?? null;
  },

  createAttempt: async ({ userId, quizId }, runner = db) => {
    const result = await runner.query(
      `WITH eligible_quiz AS (
         SELECT
           q.id AS quiz_id,
           q.course_id,
           q.lesson_id,
           e.id AS enrollment_id,
           e.user_id,
           q.pass_percentage,
           COUNT(DISTINCT qq.id)::INT AS total_questions
         FROM quizzes q
         INNER JOIN courses c
           ON c.id = q.course_id
          AND c.status = $3
         INNER JOIN enrollments e
           ON e.course_id = q.course_id
          AND e.user_id = $1
         LEFT JOIN lessons l
           ON l.id = q.lesson_id
         LEFT JOIN sections s
           ON s.id = l.section_id
         LEFT JOIN quiz_questions qq
           ON qq.quiz_id = q.id
         WHERE q.id = $2
           AND q.status = $4
           AND (
             (q.target_type = $5 AND q.lesson_id IS NULL)
             OR
             (
               q.target_type = $6
               AND q.lesson_id IS NOT NULL
               AND l.status = $7
               AND s.status = $8
             )
           )
         GROUP BY
           q.id,
           q.course_id,
           q.lesson_id,
           e.id,
           e.user_id,
           q.pass_percentage
       )
       INSERT INTO quiz_attempts (
         quiz_id,
         course_id,
         lesson_id,
         enrollment_id,
         user_id,
         status,
         pass_percentage,
         total_questions
       )
       SELECT
         eligible_quiz.quiz_id,
         eligible_quiz.course_id,
         eligible_quiz.lesson_id,
         eligible_quiz.enrollment_id,
         eligible_quiz.user_id,
         $9,
         eligible_quiz.pass_percentage,
         eligible_quiz.total_questions
       FROM eligible_quiz
       WHERE eligible_quiz.total_questions > 0
         AND NOT EXISTS (
           SELECT 1
           FROM quiz_attempts existing_attempt
           WHERE existing_attempt.user_id = $1
             AND existing_attempt.quiz_id = $2
             AND existing_attempt.status = $9
         )
         AND NOT EXISTS (
           SELECT 1
           FROM quiz_attempts submitted_attempt
           WHERE submitted_attempt.user_id = $1
             AND submitted_attempt.quiz_id = $2
             AND submitted_attempt.status = $10
         )
       RETURNING ${ATTEMPT_SELECT}`,
      [
        userId,
        quizId,
        CourseStatuses.PUBLISHED,
        QuizStatuses.PUBLISHED,
        QuizTargetTypes.COURSE,
        QuizTargetTypes.LESSON,
        LessonStatuses.PUBLISHED,
        SectionStatuses.PUBLISHED,
        QuizAttemptStatuses.IN_PROGRESS,
        QuizAttemptStatuses.SUBMITTED
      ]
    );

    return result.rows[0] ?? null;
  },

  saveAttemptAnswers: async ({ attemptId, userId, answers }, runner = db) => {
    if (!Array.isArray(answers) || answers.length === 0) {
      return [];
    }

    const values = [attemptId, userId, QuizAttemptStatuses.IN_PROGRESS];
    const placeholders = [];

    for (const answer of answers) {
      const baseIndex = values.length + 1;
      values.push(answer.questionId, answer.choiceId);
      placeholders.push(`($${baseIndex}::uuid, $${baseIndex + 1}::uuid)`);
    }

    const result = await runner.query(
      `WITH raw_submitted_answers (question_id, choice_id, input_order) AS (
         VALUES ${placeholders.map((placeholder, index) => `${placeholder.slice(0, -1)}, ${index + 1})`).join(', ')}
       ),
       submitted_answers AS (
         SELECT DISTINCT ON (raw_submitted_answers.question_id)
           raw_submitted_answers.question_id,
           raw_submitted_answers.choice_id
         FROM raw_submitted_answers
         ORDER BY raw_submitted_answers.question_id, raw_submitted_answers.input_order DESC
       )
       INSERT INTO quiz_attempt_answers (
         attempt_id,
         question_id,
         selected_choice_id,
         selected_choice_text,
         is_correct
       )
       SELECT
         qa.id,
         submitted_answers.question_id,
         qc.id,
         qc.choice_text,
         qc.is_correct
       FROM submitted_answers
       INNER JOIN quiz_attempts qa
         ON qa.id = $1
        AND qa.user_id = $2
        AND qa.status = $3
       INNER JOIN quiz_questions qq
         ON qq.id = submitted_answers.question_id
        AND qq.quiz_id = qa.quiz_id
       INNER JOIN quiz_choices qc
         ON qc.id = submitted_answers.choice_id
        AND qc.question_id = qq.id
       ON CONFLICT (attempt_id, question_id)
       DO UPDATE SET
         selected_choice_id = EXCLUDED.selected_choice_id,
         selected_choice_text = EXCLUDED.selected_choice_text,
         is_correct = EXCLUDED.is_correct,
         updated_at = NOW()
       RETURNING ${ATTEMPT_ANSWER_SELECT}`,
      values
    );

    return result.rows;
  },

  submitAttempt: async (
    {
      attemptId,
      userId,
      answeredQuestions,
      correctAnswers,
      scorePercentage,
      passed
    },
    runner = db
  ) => {
    const result = await runner.query(
      `UPDATE quiz_attempts qa
       SET status = $3,
           answered_questions = $4,
           correct_answers = $5,
           score_percentage = $6,
           passed = $7,
           submitted_at = NOW(),
           updated_at = NOW()
       WHERE qa.id = $1
         AND qa.user_id = $2
         AND qa.status = $8
         AND NOT EXISTS (
           SELECT 1
           FROM quiz_attempts existing_submitted
           WHERE existing_submitted.user_id = $2
             AND existing_submitted.quiz_id = qa.quiz_id
             AND existing_submitted.status = $3
             AND existing_submitted.id <> $1
         )
       RETURNING ${ATTEMPT_SELECT}`,
      [
        attemptId,
        userId,
        QuizAttemptStatuses.SUBMITTED,
        answeredQuestions,
        correctAnswers,
        scorePercentage,
        passed,
        QuizAttemptStatuses.IN_PROGRESS
      ]
    );

    return result.rows[0] ?? null;
  },

  findAttemptByIdForUser: async ({ attemptId, userId }, runner = db) => {
    const result = await runner.query(
      `SELECT ${ATTEMPT_SELECT}
       FROM quiz_attempts qa
       WHERE qa.id = $1
         AND qa.user_id = $2
       LIMIT 1`,
      [attemptId, userId]
    );

    return result.rows[0] ?? null;
  },

  listAttemptAnswersByUser: async ({ attemptId, userId }, runner = db) => {
    const result = await runner.query(
      `SELECT ${ATTEMPT_ANSWER_SELECT}
       FROM quiz_attempt_answers qaa
       INNER JOIN quiz_attempts qa
         ON qa.id = qaa.attempt_id
       WHERE qaa.attempt_id = $1
         AND qa.user_id = $2
       ORDER BY qaa.created_at ASC`,
      [attemptId, userId]
    );

    return result.rows;
  }
};
