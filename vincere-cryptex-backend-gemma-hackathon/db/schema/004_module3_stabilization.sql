DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'section_status') THEN
    CREATE TYPE section_status AS ENUM ('draft', 'published');
  END IF;
END $$;

ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS status section_status;

UPDATE sections
SET status = 'published'
WHERE status IS NULL;

ALTER TABLE sections
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE sections
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'lesson_type'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'lesson_type'::regtype
      AND enumlabel = 'mixed'
  ) THEN
    ALTER TYPE lesson_type ADD VALUE 'mixed';
  END IF;
END $$;

ALTER TABLE lessons
  DROP CONSTRAINT IF EXISTS lessons_check;

ALTER TABLE lessons
  DROP CONSTRAINT IF EXISTS lessons_content_payload_check;

ALTER TABLE lessons
  ADD CONSTRAINT lessons_content_payload_check
  CHECK (
    (
      type = 'text'
      AND text_content IS NOT NULL
      AND video_provider IS NULL
      AND video_asset_id IS NULL
      AND video_duration_seconds IS NULL
    )
    OR
    (
      type = 'video'
      AND text_content IS NULL
      AND video_provider IS NOT NULL
      AND video_asset_id IS NOT NULL
      AND video_duration_seconds IS NOT NULL
    )
    OR
    (
      type = 'mixed'
      AND text_content IS NOT NULL
      AND video_provider IS NOT NULL
      AND video_asset_id IS NOT NULL
      AND video_duration_seconds IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_sections_course_id_status
  ON sections (course_id, status);
