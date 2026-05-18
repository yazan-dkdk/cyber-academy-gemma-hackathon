DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'challenge_status') THEN
    CREATE TYPE challenge_status AS ENUM ('draft', 'published');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'challenge_difficulty') THEN
    CREATE TYPE challenge_difficulty AS ENUM ('easy', 'medium', 'hard');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty challenge_difficulty NOT NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  status challenge_status NOT NULL DEFAULT 'draft',
  flag_hash TEXT NOT NULL CHECK (char_length(flag_hash) = 64),
  download_name TEXT,
  download_storage_key TEXT,
  download_size_bytes INTEGER CHECK (download_size_bytes IS NULL OR download_size_bytes > 0),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (
      download_name IS NULL
      AND download_storage_key IS NULL
      AND download_size_bytes IS NULL
    )
    OR
    (
      download_name IS NOT NULL
      AND download_storage_key IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_challenges_status
  ON challenges (status);

CREATE INDEX IF NOT EXISTS idx_challenges_category
  ON challenges (category);

CREATE INDEX IF NOT EXISTS idx_challenges_difficulty
  ON challenges (difficulty);

CREATE TABLE IF NOT EXISTS challenge_hints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position IN (1, 2)),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, position)
);

CREATE INDEX IF NOT EXISTS idx_challenge_hints_challenge_id
  ON challenge_hints (challenge_id);

CREATE TABLE IF NOT EXISTS challenge_hint_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_hint_id UUID NOT NULL REFERENCES challenge_hints(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_hint_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_hint_usages_user_id
  ON challenge_hint_usages (user_id);

CREATE TABLE IF NOT EXISTS challenge_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_flag_hash TEXT NOT NULL CHECK (char_length(submitted_flag_hash) = 64),
  is_correct BOOLEAN NOT NULL,
  already_solved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge_user
  ON challenge_attempts (challenge_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenge_attempts_user_created_at
  ON challenge_attempts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS challenge_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_correct_attempt_id UUID REFERENCES challenge_attempts(id) ON DELETE SET NULL,
  points_awarded INTEGER NOT NULL CHECK (points_awarded >= 0),
  solved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_completions_user_id
  ON challenge_completions (user_id, solved_at DESC);
