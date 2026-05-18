ALTER TABLE "challenges" ADD COLUMN "slug" VARCHAR(200);

UPDATE "challenges"
SET "slug" = CONCAT('challenge-', REPLACE("id"::text, '-', ''))
WHERE "slug" IS NULL;

ALTER TABLE "challenges" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "challenges_slug_key" ON "challenges"("slug");
