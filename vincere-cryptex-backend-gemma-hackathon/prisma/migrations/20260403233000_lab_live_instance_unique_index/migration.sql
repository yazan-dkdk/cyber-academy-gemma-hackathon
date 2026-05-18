CREATE UNIQUE INDEX "idx_lab_instances_user_lab_live_unique"
  ON "lab_instances" ("user_id", "lab_id")
  WHERE "status" IN ('STARTING', 'ACTIVE');
