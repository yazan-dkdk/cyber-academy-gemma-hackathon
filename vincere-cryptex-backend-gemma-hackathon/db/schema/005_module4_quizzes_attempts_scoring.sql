DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_target_type') THEN
    CREATE TYPE quiz_target_type AS ENUM ('course', 'lesson');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_status') THEN
    CREATE TYPE quiz_status AS ENUM ('draft', 'published');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_attempt_status') THEN
    CREATE TYPE quiz_attempt_status AS ENUM ('in_progress', 'submitted');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  target_type quiz_target_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status quiz_status NOT NULL DEFAULT 'draft',
  pass_percentage INTEGER NOT NULL DEFAULT 70 CHECK (pass_percentage >= 0 AND pass_percentage <= 100),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (target_type = 'course' AND lesson_id IS NULL)
    OR
    (target_type = 'lesson' AND lesson_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_quizzes_status
  ON quizzes (status);

CREATE INDEX IF NOT EXISTS idx_quizzes_course_id
  ON quizzes (course_id);

CREATE INDEX IF NOT EXISTS idx_quizzes_lesson_id
  ON quizzes (lesson_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_unique_course_target
  ON quizzes (course_id)
  WHERE target_type = 'course';

CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_unique_lesson_target
  ON quizzes (lesson_id)
  WHERE lesson_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'mcq' CHECK (type = 'mcq'),
  prompt TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quiz_id, position)
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id
  ON quiz_questions (quiz_id);

CREATE TABLE IF NOT EXISTS quiz_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  choice_text TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, position)
);

CREATE INDEX IF NOT EXISTS idx_quiz_choices_question_id
  ON quiz_choices (question_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_choices_one_correct
  ON quiz_choices (question_id)
  WHERE is_correct = TRUE;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status quiz_attempt_status NOT NULL DEFAULT 'in_progress',
  pass_percentage INTEGER NOT NULL CHECK (pass_percentage >= 0 AND pass_percentage <= 100),
  total_questions INTEGER NOT NULL CHECK (total_questions > 0),
  answered_questions INTEGER NOT NULL DEFAULT 0 CHECK (answered_questions >= 0),
  correct_answers INTEGER CHECK (correct_answers IS NULL OR correct_answers >= 0),
  score_percentage INTEGER CHECK (score_percentage IS NULL OR (score_percentage >= 0 AND score_percentage <= 100)),
  passed BOOLEAN,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (status = 'in_progress' AND submitted_at IS NULL)
    OR
    (status = 'submitted' AND submitted_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id
  ON quiz_attempts (quiz_id);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id
  ON quiz_attempts (user_id);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_enrollment_id
  ON quiz_attempts (enrollment_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempts_single_open_attempt
  ON quiz_attempts (user_id, quiz_id)
  WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_choice_id UUID NOT NULL REFERENCES quiz_choices(id) ON DELETE RESTRICT,
  selected_choice_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempt_answers_attempt_id
  ON quiz_attempt_answers (attempt_id);

CREATE INDEX IF NOT EXISTS idx_quiz_attempt_answers_question_id
  ON quiz_attempt_answers (question_id);
