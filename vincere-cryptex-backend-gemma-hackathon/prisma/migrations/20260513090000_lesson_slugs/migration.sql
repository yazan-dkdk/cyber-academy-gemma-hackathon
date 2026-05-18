ALTER TABLE "lessons" ADD COLUMN "slug" VARCHAR(200);

UPDATE "lessons" AS l
SET "slug" = COALESCE(
  NULLIF(
    TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(l."title"), '[^a-z0-9]+', '-', 'g')),
    ''
  ),
  'lesson-' || l."position"::text
);

UPDATE "lessons" AS l
SET "slug" = CASE
  WHEN c."slug" = 'network-defense-foundations' AND l."position" = 1 THEN 'ndf-traffic-map'
  WHEN c."slug" = 'network-defense-foundations' AND l."position" = 2 THEN 'ndf-packet-view'
  WHEN c."slug" = 'network-defense-foundations' AND l."position" = 3 THEN 'ndf-service-review'
  WHEN c."slug" = 'network-defense-foundations' AND l."position" = 4 THEN 'ndf-firewall-rules'
  WHEN c."slug" = 'web-application-attack-lab' AND l."position" = 1 THEN 'waa-surface-map'
  WHEN c."slug" = 'web-application-attack-lab' AND l."position" = 2 THEN 'waa-proxy-tour'
  WHEN c."slug" = 'web-application-attack-lab' AND l."position" = 3 THEN 'waa-injection'
  WHEN c."slug" = 'web-application-attack-lab' AND l."position" = 4 THEN 'waa-access-control'
  WHEN c."slug" = 'incident-response-operations' AND l."position" = 1 THEN 'iro-first-hour'
  WHEN c."slug" = 'incident-response-operations' AND l."position" = 2 THEN 'iro-evidence'
  WHEN c."slug" = 'incident-response-operations' AND l."position" = 3 THEN 'iro-isolation'
  WHEN c."slug" = 'incident-response-operations' AND l."position" = 4 THEN 'iro-communications'
  WHEN c."slug" = 'advanced-threat-hunting' AND l."position" = 1 THEN 'ath-hypothesis-writing'
  WHEN c."slug" = 'advanced-threat-hunting' AND l."position" = 2 THEN 'ath-telemetry-fit'
  WHEN c."slug" = 'advanced-threat-hunting' AND l."position" = 3 THEN 'ath-query-review'
  WHEN c."slug" = 'advanced-threat-hunting' AND l."position" = 4 THEN 'ath-findings'
  ELSE l."slug"
END
FROM "courses" AS c
WHERE l."course_id" = c."id";

WITH ranked_lessons AS (
  SELECT
    "id",
    "slug",
    ROW_NUMBER() OVER (
      PARTITION BY "course_id", "slug"
      ORDER BY "position", "id"
    ) AS slug_rank
  FROM "lessons"
)
UPDATE "lessons" AS l
SET "slug" = CASE
  WHEN LENGTH(r."slug") + 1 + LENGTH(r.slug_rank::text) <= 200
    THEN r."slug" || '-' || r.slug_rank::text
  ELSE LEFT(r."slug", 200 - 1 - LENGTH(r.slug_rank::text)) || '-' || r.slug_rank::text
END
FROM ranked_lessons AS r
WHERE l."id" = r."id"
  AND r.slug_rank > 1;

ALTER TABLE "lessons" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "lessons_course_id_slug_key" ON "lessons"("course_id", "slug");
CREATE INDEX "idx_lessons_slug" ON "lessons"("slug");
