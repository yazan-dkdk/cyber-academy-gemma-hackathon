CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_EMAIL_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "SectionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LessonContentMode" AS ENUM ('TEXT', 'VIDEO', 'HYBRID');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QuizTargetType" AS ENUM ('COURSE', 'LESSON');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "QuizQuestionType" AS ENUM ('MCQ');

-- CreateEnum
CREATE TYPE "QuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ChallengeDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "LabStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LabDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "LabType" AS ENUM ('CONTAINER');

-- CreateEnum
CREATE TYPE "LabInstanceStatus" AS ENUM ('STARTING', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'ERROR');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('COURSE_ENROLLED', 'LESSON_VIEWED', 'LESSON_COMPLETED', 'QUIZ_STARTED', 'QUIZ_SUBMITTED', 'QUIZ_PASSED', 'CHALLENGE_HINT_USED', 'CHALLENGE_SOLVED', 'LAB_STARTED', 'LAB_RESET', 'LAB_TERMINATED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('USER', 'COURSE', 'LESSON', 'QUIZ', 'CHALLENGE', 'LAB');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "email_verified_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_mfa_configs" (
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "secret_iv" TEXT NOT NULL,
    "secret_tag" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_at" TIMESTAMPTZ(6),
    "last_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_mfa_configs_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "target_user_id" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "activity_type" "ActivityType" NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "short_description" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "level" "CourseLevel" NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "SectionStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content_mode" "LessonContentMode" NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL,
    "text_content" TEXT,
    "video_provider" TEXT,
    "video_asset_id" TEXT,
    "video_duration_seconds" INTEGER,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "last_accessed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID,
    "target_type" "QuizTargetType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "pass_percentage" INTEGER NOT NULL DEFAULT 70,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "type" "QuizQuestionType" NOT NULL DEFAULT 'MCQ',
    "prompt" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_choices" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "choice_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quiz_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID,
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "QuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "pass_percentage" INTEGER NOT NULL,
    "total_questions" INTEGER NOT NULL,
    "answered_questions" INTEGER NOT NULL DEFAULT 0,
    "correct_answers" INTEGER,
    "score_percentage" INTEGER,
    "passed" BOOLEAN,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempt_answers" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_choice_id" UUID NOT NULL,
    "selected_choice_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quiz_attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" "ChallengeDifficulty" NOT NULL,
    "points" INTEGER NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'DRAFT',
    "flag_hash" CHAR(64) NOT NULL,
    "download_name" TEXT,
    "download_storage_key" TEXT,
    "download_size_bytes" INTEGER,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_hints" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "challenge_hints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_hint_usages" (
    "id" UUID NOT NULL,
    "challenge_hint_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "challenge_hint_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_attempts" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "submitted_flag_hash" CHAR(64) NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "already_solved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "challenge_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_completions" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_correct_attempt_id" UUID,
    "points_awarded" INTEGER NOT NULL,
    "solved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "challenge_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labs" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" "LabDifficulty" NOT NULL,
    "status" "LabStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "LabType" NOT NULL DEFAULT 'CONTAINER',
    "image_reference" TEXT,
    "template_reference" TEXT,
    "ttl_minutes" INTEGER NOT NULL DEFAULT 60,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "labs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_instances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lab_id" UUID NOT NULL,
    "container_id" TEXT,
    "network_id" TEXT,
    "proxy_token" TEXT NOT NULL,
    "status" "LabInstanceStatus" NOT NULL DEFAULT 'STARTING',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "terminated_at" TIMESTAMPTZ(6),
    "reset_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lab_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_user_id" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_expires_at" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_email_verification_tokens_user_id" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_email_verification_tokens_expires_at" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_audit_logs_actor_user_id" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_target_user_id" ON "audit_logs"("target_user_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_activity_logs_user_id" ON "activity_logs"("user_id");

-- CreateIndex
CREATE INDEX "idx_activity_logs_created_at" ON "activity_logs"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "idx_courses_status" ON "courses"("status");

-- CreateIndex
CREATE INDEX "idx_courses_level" ON "courses"("level");

-- CreateIndex
CREATE INDEX "idx_sections_course_id" ON "sections"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_course_id_position_key" ON "sections"("course_id", "position");

-- CreateIndex
CREATE INDEX "idx_lessons_course_id" ON "lessons"("course_id");

-- CreateIndex
CREATE INDEX "idx_lessons_section_id" ON "lessons"("section_id");

-- CreateIndex
CREATE INDEX "idx_lessons_status" ON "lessons"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_section_id_position_key" ON "lessons"("section_id", "position");

-- CreateIndex
CREATE INDEX "idx_enrollments_user_id" ON "enrollments"("user_id");

-- CreateIndex
CREATE INDEX "idx_enrollments_course_id" ON "enrollments"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_user_id_course_id_key" ON "enrollments"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "idx_lesson_progress_user_course" ON "lesson_progress"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "idx_lesson_progress_enrollment_id" ON "lesson_progress"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_user_id_lesson_id_key" ON "lesson_progress"("user_id", "lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_lesson_id_key" ON "quizzes"("lesson_id");

-- CreateIndex
CREATE INDEX "idx_quizzes_status" ON "quizzes"("status");

-- CreateIndex
CREATE INDEX "idx_quizzes_course_id" ON "quizzes"("course_id");

-- CreateIndex
CREATE INDEX "idx_quizzes_lesson_id" ON "quizzes"("lesson_id");

-- CreateIndex
CREATE INDEX "idx_quiz_questions_quiz_id" ON "quiz_questions"("quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_questions_quiz_id_position_key" ON "quiz_questions"("quiz_id", "position");

-- CreateIndex
CREATE INDEX "idx_quiz_choices_question_id" ON "quiz_choices"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_choices_question_id_position_key" ON "quiz_choices"("question_id", "position");

-- CreateIndex
CREATE INDEX "idx_quiz_attempts_quiz_id" ON "quiz_attempts"("quiz_id");

-- CreateIndex
CREATE INDEX "idx_quiz_attempts_user_id" ON "quiz_attempts"("user_id");

-- CreateIndex
CREATE INDEX "idx_quiz_attempts_enrollment_id" ON "quiz_attempts"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_user_quiz_status_key" ON "quiz_attempts"("user_id", "quiz_id", "status");

-- CreateIndex
CREATE INDEX "idx_quiz_attempt_answers_attempt_id" ON "quiz_attempt_answers"("attempt_id");

-- CreateIndex
CREATE INDEX "idx_quiz_attempt_answers_question_id" ON "quiz_attempt_answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempt_answers_attempt_id_question_id_key" ON "quiz_attempt_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "idx_challenges_status" ON "challenges"("status");

-- CreateIndex
CREATE INDEX "idx_challenges_category" ON "challenges"("category");

-- CreateIndex
CREATE INDEX "idx_challenges_difficulty" ON "challenges"("difficulty");

-- CreateIndex
CREATE INDEX "idx_challenge_hints_challenge_id" ON "challenge_hints"("challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_hints_challenge_id_position_key" ON "challenge_hints"("challenge_id", "position");

-- CreateIndex
CREATE INDEX "idx_challenge_hint_usages_user_id" ON "challenge_hint_usages"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_hint_usages_challenge_hint_id_user_id_key" ON "challenge_hint_usages"("challenge_hint_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_challenge_attempts_challenge_user" ON "challenge_attempts"("challenge_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_challenge_attempts_user_created_at" ON "challenge_attempts"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_challenge_completions_user_id" ON "challenge_completions"("user_id", "solved_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "challenge_completions_challenge_id_user_id_key" ON "challenge_completions"("challenge_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_labs_status" ON "labs"("status");

-- CreateIndex
CREATE INDEX "idx_labs_category" ON "labs"("category");

-- CreateIndex
CREATE INDEX "idx_labs_difficulty" ON "labs"("difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "lab_instances_proxy_token_key" ON "lab_instances"("proxy_token");

-- CreateIndex
CREATE INDEX "idx_lab_instances_user_lab" ON "lab_instances"("user_id", "lab_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_lab_instances_status_expires_at" ON "lab_instances"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "admin_mfa_configs" ADD CONSTRAINT "admin_mfa_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_choices" ADD CONSTRAINT "quiz_choices_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_selected_choice_id_fkey" FOREIGN KEY ("selected_choice_id") REFERENCES "quiz_choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_hints" ADD CONSTRAINT "challenge_hints_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_hint_usages" ADD CONSTRAINT "challenge_hint_usages_challenge_hint_id_fkey" FOREIGN KEY ("challenge_hint_id") REFERENCES "challenge_hints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_hint_usages" ADD CONSTRAINT "challenge_hint_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_completions" ADD CONSTRAINT "challenge_completions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_completions" ADD CONSTRAINT "challenge_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_completions" ADD CONSTRAINT "challenge_completions_first_correct_attempt_id_fkey" FOREIGN KEY ("first_correct_attempt_id") REFERENCES "challenge_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_instances" ADD CONSTRAINT "lab_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_instances" ADD CONSTRAINT "lab_instances_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "password_reset_tokens" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "email_verification_tokens" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "audit_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "activity_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "courses" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "sections" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "lessons" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "enrollments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "lesson_progress" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "quizzes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "quiz_questions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "quiz_choices" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "quiz_attempts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "quiz_attempt_answers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "challenges" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "challenge_hints" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "challenge_hint_usages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "challenge_attempts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "challenge_completions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "labs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "lab_instances" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "audit_logs" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;
ALTER TABLE "activity_logs" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE "sections"
  ADD CONSTRAINT "sections_position_check" CHECK ("position" > 0);

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_position_check" CHECK ("position" > 0),
  ADD CONSTRAINT "lessons_video_duration_check" CHECK ("video_duration_seconds" IS NULL OR "video_duration_seconds" > 0),
  ADD CONSTRAINT "lessons_content_mode_check" CHECK (
    (
      "content_mode" = 'TEXT'
      AND "text_content" IS NOT NULL
      AND "video_provider" IS NULL
      AND "video_asset_id" IS NULL
      AND "video_duration_seconds" IS NULL
    )
    OR
    (
      "content_mode" = 'VIDEO'
      AND "text_content" IS NULL
      AND "video_provider" IS NOT NULL
      AND "video_asset_id" IS NOT NULL
      AND "video_duration_seconds" IS NOT NULL
    )
    OR
    (
      "content_mode" = 'HYBRID'
      AND "text_content" IS NOT NULL
      AND "video_provider" IS NOT NULL
      AND "video_asset_id" IS NOT NULL
      AND "video_duration_seconds" IS NOT NULL
    )
  );

ALTER TABLE "quizzes"
  ADD CONSTRAINT "quizzes_pass_percentage_check" CHECK ("pass_percentage" >= 0 AND "pass_percentage" <= 100),
  ADD CONSTRAINT "quizzes_target_type_check" CHECK (
    (
      "target_type" = 'COURSE'
      AND "lesson_id" IS NULL
    )
    OR
    (
      "target_type" = 'LESSON'
      AND "lesson_id" IS NOT NULL
    )
  );

ALTER TABLE "quiz_choices"
  ADD CONSTRAINT "quiz_choices_position_check" CHECK ("position" > 0);

ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_pass_percentage_check" CHECK ("pass_percentage" >= 0 AND "pass_percentage" <= 100),
  ADD CONSTRAINT "quiz_attempts_total_questions_check" CHECK ("total_questions" > 0),
  ADD CONSTRAINT "quiz_attempts_answered_questions_check" CHECK ("answered_questions" >= 0),
  ADD CONSTRAINT "quiz_attempts_correct_answers_check" CHECK ("correct_answers" IS NULL OR "correct_answers" >= 0),
  ADD CONSTRAINT "quiz_attempts_score_percentage_check" CHECK ("score_percentage" IS NULL OR ("score_percentage" >= 0 AND "score_percentage" <= 100)),
  ADD CONSTRAINT "quiz_attempts_submission_state_check" CHECK (
    (
      "status" = 'IN_PROGRESS'
      AND "submitted_at" IS NULL
    )
    OR
    (
      "status" = 'SUBMITTED'
      AND "submitted_at" IS NOT NULL
    )
  );

ALTER TABLE "challenge_hints"
  ADD CONSTRAINT "challenge_hints_position_check" CHECK ("position" IN (1, 2));

ALTER TABLE "challenge_attempts"
  ADD CONSTRAINT "challenge_attempts_flag_hash_check" CHECK (char_length("submitted_flag_hash") = 64);

ALTER TABLE "challenge_completions"
  ADD CONSTRAINT "challenge_completions_points_awarded_check" CHECK ("points_awarded" >= 0);

ALTER TABLE "challenges"
  ADD CONSTRAINT "challenges_points_check" CHECK ("points" > 0),
  ADD CONSTRAINT "challenges_flag_hash_check" CHECK (char_length("flag_hash") = 64),
  ADD CONSTRAINT "challenges_download_size_check" CHECK ("download_size_bytes" IS NULL OR "download_size_bytes" > 0),
  ADD CONSTRAINT "challenges_download_contract_check" CHECK (
    (
      "download_name" IS NULL
      AND "download_storage_key" IS NULL
      AND "download_size_bytes" IS NULL
    )
    OR
    (
      "download_name" IS NOT NULL
      AND "download_storage_key" IS NOT NULL
    )
  );

ALTER TABLE "labs"
  ADD CONSTRAINT "labs_ttl_minutes_check" CHECK ("ttl_minutes" > 0 AND "ttl_minutes" <= 1440),
  ADD CONSTRAINT "labs_image_or_template_check" CHECK ("image_reference" IS NOT NULL OR "template_reference" IS NOT NULL);

ALTER TABLE "lab_instances"
  ADD CONSTRAINT "lab_instances_expiry_check" CHECK ("expires_at" > "started_at"),
  ADD CONSTRAINT "lab_instances_reset_count_check" CHECK ("reset_count" >= 0);

CREATE UNIQUE INDEX "idx_quizzes_unique_course_target"
  ON "quizzes" ("course_id")
  WHERE "target_type" = 'COURSE';

CREATE UNIQUE INDEX "idx_quiz_choices_one_correct"
  ON "quiz_choices" ("question_id")
  WHERE "is_correct" = TRUE;

CREATE UNIQUE INDEX "idx_lab_instances_single_live_instance"
  ON "lab_instances" ("user_id", "lab_id")
  WHERE "status" IN ('STARTING', 'ACTIVE');

