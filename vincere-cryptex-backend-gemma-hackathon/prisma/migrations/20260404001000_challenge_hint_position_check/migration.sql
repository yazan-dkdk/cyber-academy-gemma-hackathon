DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'challenge_hints_position_allowed'
  ) THEN
    ALTER TABLE "challenge_hints"
      ADD CONSTRAINT "challenge_hints_position_allowed"
      CHECK ("position" IN (1, 2));
  END IF;
END $$;
