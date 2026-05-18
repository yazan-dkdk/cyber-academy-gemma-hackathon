import { db } from '../../config/db.js';

export const authRepository = {
  findUserByEmail: async (email) => {
    const result = await db.query(
      `SELECT id, email, password_hash, role, status, email_verified_at, last_login_at, created_at, updated_at
       FROM users
       WHERE email = LOWER($1)
       LIMIT 1`,
      [email]
    );

    return result.rows[0] ?? null;
  },

  findUserById: async (userId) => {
    const result = await db.query(
      `SELECT id, email, password_hash, role, status, email_verified_at, last_login_at, created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    return result.rows[0] ?? null;
  },

  createUser: async ({ email, passwordHash, role, status }) => {
    const result = await db.query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES (LOWER($1), $2, $3, $4)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, role, status, email_verified_at, last_login_at, created_at, updated_at`,
      [email, passwordHash, role, status]
    );

    return result.rows[0] ?? null;
  },

  updateLastLogin: async (userId) => {
    await db.query(
      `UPDATE users
       SET last_login_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
  },

  updateUserPassword: async (userId, passwordHash, runner = db) => {
    await runner.query(
      `UPDATE users
       SET password_hash = $2, updated_at = NOW()
       WHERE id = $1`,
      [userId, passwordHash]
    );
  },

  updateUserStatus: async (userId, status) => {
    await db.query(
      `UPDATE users
       SET status = $2, updated_at = NOW()
       WHERE id = $1`,
      [userId, status]
    );
  },

  updateUserRole: async (userId, role) => {
    await db.query(
      `UPDATE users
       SET role = $2, updated_at = NOW()
       WHERE id = $1`,
      [userId, role]
    );
  },

  createPasswordResetToken: async ({ userId, tokenHash, expiresAt }) => {
    await db.query(
      `WITH retired_tokens AS (
         UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = $1
           AND used_at IS NULL
       )
       INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  },

  consumePasswordResetToken: async (tokenHash, runner = db) => {
    const result = await runner.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       RETURNING id, user_id, token_hash, expires_at, used_at`,
      [tokenHash]
    );

    return result.rows[0] ?? null;
  },

  createEmailVerificationToken: async ({ userId, tokenHash, expiresAt }) => {
    await db.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  },

  upsertAdminMfaSecret: async ({ userId, ciphertext, iv, tag }) => {
    await db.query(
      `INSERT INTO admin_mfa_configs (user_id, secret_ciphertext, secret_iv, secret_tag, is_enabled)
       VALUES ($1, $2, $3, $4, FALSE)
       ON CONFLICT (user_id)
       DO UPDATE SET
         secret_ciphertext = EXCLUDED.secret_ciphertext,
         secret_iv = EXCLUDED.secret_iv,
         secret_tag = EXCLUDED.secret_tag,
         is_enabled = FALSE,
         updated_at = NOW()`,
      [userId, ciphertext, iv, tag]
    );
  },

  findAdminMfaByUserId: async (userId) => {
    const result = await db.query(
      `SELECT user_id, secret_ciphertext, secret_iv, secret_tag, is_enabled, enabled_at, last_verified_at, created_at, updated_at
       FROM admin_mfa_configs
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    return result.rows[0] ?? null;
  },

  enableAdminMfa: async (userId) => {
    await db.query(
      `UPDATE admin_mfa_configs
       SET is_enabled = TRUE, enabled_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  },

  touchAdminMfaVerification: async (userId) => {
    await db.query(
      `UPDATE admin_mfa_configs
       SET last_verified_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  },

  disableAdminMfa: async (userId) => {
    await db.query(
      `UPDATE admin_mfa_configs
       SET is_enabled = FALSE, updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  }
};
