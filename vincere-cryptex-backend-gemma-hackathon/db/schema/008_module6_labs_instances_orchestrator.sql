DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lab_status') THEN
    CREATE TYPE lab_status AS ENUM ('draft', 'published');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lab_difficulty') THEN
    CREATE TYPE lab_difficulty AS ENUM ('easy', 'medium', 'hard');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lab_type') THEN
    CREATE TYPE lab_type AS ENUM ('container');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lab_instance_status') THEN
    CREATE TYPE lab_instance_status AS ENUM ('STARTING', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'ERROR');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty lab_difficulty NOT NULL,
  status lab_status NOT NULL DEFAULT 'draft',
  type lab_type NOT NULL DEFAULT 'container',
  image_reference TEXT,
  template_reference TEXT,
  ttl_minutes INTEGER NOT NULL DEFAULT 60 CHECK (ttl_minutes > 0 AND ttl_minutes <= 1440),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (image_reference IS NOT NULL OR template_reference IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_labs_status
  ON labs (status);

CREATE INDEX IF NOT EXISTS idx_labs_category
  ON labs (category);

CREATE INDEX IF NOT EXISTS idx_labs_difficulty
  ON labs (difficulty);

CREATE TABLE IF NOT EXISTS lab_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  container_id TEXT,
  network_id TEXT,
  proxy_token TEXT NOT NULL UNIQUE,
  status lab_instance_status NOT NULL DEFAULT 'STARTING',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  terminated_at TIMESTAMPTZ,
  reset_count INTEGER NOT NULL DEFAULT 0 CHECK (reset_count >= 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > started_at)
);

CREATE INDEX IF NOT EXISTS idx_lab_instances_user_lab
  ON lab_instances (user_id, lab_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_lab_instances_status_expires_at
  ON lab_instances (status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_instances_single_live_instance
  ON lab_instances (user_id, lab_id)
  WHERE status IN ('STARTING', 'ACTIVE');
