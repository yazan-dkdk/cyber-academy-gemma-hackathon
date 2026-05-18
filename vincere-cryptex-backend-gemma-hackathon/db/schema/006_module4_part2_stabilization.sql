CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempts_single_submitted_attempt
  ON quiz_attempts (user_id, quiz_id)
  WHERE status = 'submitted';
