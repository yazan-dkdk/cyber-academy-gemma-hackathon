ALTER TYPE "EnrollmentStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CHALLENGE_ATTEMPT';

ALTER TABLE "lesson_progress"
  ADD COLUMN "scroll_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "watch_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reading_time_seconds" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "lesson_progress"
  ADD CONSTRAINT "lesson_progress_scroll_percent_check" CHECK ("scroll_percent" >= 0 AND "scroll_percent" <= 100),
  ADD CONSTRAINT "lesson_progress_watch_percent_check" CHECK ("watch_percent" >= 0 AND "watch_percent" <= 100),
  ADD CONSTRAINT "lesson_progress_reading_time_seconds_check" CHECK ("reading_time_seconds" >= 0);
