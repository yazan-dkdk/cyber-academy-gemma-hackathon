ALTER TABLE "users"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_users_deleted_at"
  ON "users" ("deleted_at");
