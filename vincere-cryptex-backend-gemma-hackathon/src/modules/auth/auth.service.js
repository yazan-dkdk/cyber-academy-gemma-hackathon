import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { Roles, UserStatuses } from '../../shared/constants/roles.js';
import { AppError } from '../../shared/errors/app-error.js';
import { withMinimumDuration } from '../../shared/utils/timing.js';
import { decrypt, encrypt, sha256 } from '../../shared/utils/crypto.js';
import { normalizeEmail, validateEmail } from '../../shared/utils/validation.js';
import { authRepository } from './auth.repository.js';
import { MfaAttemptActions, mfaAttemptService } from './mfa-attempt.service.js';
import { sessionService } from './session.service.js';

authenticator.options = {
  window: 1,
  step: 30
};

const MFA_CODE_PATTERN = /^\d{6}$/;
const REGISTRATION_RESPONSE = Object.freeze({
  message: 'If the email can be used, verification instructions will be sent'
});

const validatePassword = (password) =>
  typeof password === 'string' && password.length >= 12 && password.length <= 128;

const sanitizeUser = (user) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerifiedAt: user.email_verified_at,
  createdAt: user.created_at,
  updatedAt: user.updated_at
});

const assertEligibleStatus = (user) => {
  if (user.status === UserStatuses.SUSPENDED) {
    throw new AppError('Account suspended', 403);
  }

  if (user.status === UserStatuses.BANNED) {
    throw new AppError('Account banned', 403);
  }
};

const assertSessionRegenerated = (session) => {
  if (!session) {
    throw new AppError('Session expired', 401);
  }

  return session;
};

const throwInvalidMfaCode = async ({ action, userId }) => {
  await mfaAttemptService.recordFailure({ action, userId });
  throw new AppError('Invalid MFA code', 401);
};

export const authService = {
  register: async ({ email, password }) => {
    const normalizedEmail = normalizeEmail(email);

    if (!validateEmail(normalizedEmail)) {
      throw new AppError('Valid email is required', 400);
    }

    if (!validatePassword(password)) {
      throw new AppError('Password must be between 12 and 128 characters', 400);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await authRepository.createUser({
      email: normalizedEmail,
      passwordHash,
      role: Roles.STUDENT,
      status: UserStatuses.PENDING_EMAIL_VERIFICATION
    });

    if (!user) {
      return REGISTRATION_RESPONSE;
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await authRepository.createEmailVerificationToken({
      userId: user.id,
      tokenHash: sha256(verificationToken),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
    });

    return REGISTRATION_RESPONSE;
  },

  login: async ({ email, password }) => {
    const normalizedEmail = normalizeEmail(email);

    if (!validateEmail(normalizedEmail) || typeof password !== 'string') {
      throw new AppError('Invalid credentials', 401);
    }

    const user = await authRepository.findUserByEmail(normalizedEmail);
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401);
    }

    assertEligibleStatus(user);

    const mfaConfig = await authRepository.findAdminMfaByUserId(user.id);
    const requiresAdminMfa = user.role === Roles.ADMIN;
    const session = await sessionService.createSession({
      userId: user.id,
      role: user.role,
      userStatus: user.status,
      mfaVerified: requiresAdminMfa ? false : true
    });

    await authRepository.updateLastLogin(user.id);

    return {
      session,
      response: {
        user: sanitizeUser(user),
        mfaRequired: requiresAdminMfa,
        mfaConfigured: Boolean(mfaConfig?.is_enabled),
        mfaVerified: session.mfaVerified
      }
    };
  },

  logout: async (sessionId) => {
    await sessionService.destroySession(sessionId);
  },

  getCurrentUser: async (userId) => {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    return sanitizeUser(user);
  },

  createPasswordReset: async ({ email }) => {
    const normalizedEmail = normalizeEmail(email);

    return withMinimumDuration(async () => {
      if (!validateEmail(normalizedEmail)) {
        return null;
      }

      const user = await authRepository.findUserByEmail(normalizedEmail);
      if (!user) {
        return null;
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      await authRepository.createPasswordResetToken({
        userId: user.id,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 1000 * 60 * 15)
      });

      return rawToken;
    }, env.forgotPasswordMinDurationMs);
  },

  resetPassword: async ({ token, password }) => {
    if (typeof token !== 'string' || token.length < 32) {
      throw new AppError('Invalid reset token', 400);
    }

    if (!validatePassword(password)) {
      throw new AppError('Password must be between 12 and 128 characters', 400);
    }

    const tokenHash = sha256(token);
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await db.connect();
    let consumedResetToken = null;

    try {
      await client.query('BEGIN');
      consumedResetToken = await authRepository.consumePasswordResetToken(tokenHash, client);

      if (!consumedResetToken) {
        throw new AppError('Invalid or expired reset token', 400);
      }

      await authRepository.updateUserPassword(consumedResetToken.user_id, passwordHash, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await sessionService.destroyUserSessions(consumedResetToken.user_id);
  },

  setupAdminMfa: async ({ userId, session }) => {
    const user = await authRepository.findUserById(userId);
    if (!user || user.role !== Roles.ADMIN) {
      throw new AppError('Admin account required', 403);
    }

    const currentMfaConfig = await authRepository.findAdminMfaByUserId(userId);
    if (currentMfaConfig?.is_enabled && !session?.mfaVerified) {
      throw new AppError('Admin MFA verification required', 403);
    }

    const secret = authenticator.generateSecret();
    const encryptedSecret = encrypt(secret);
    const otpauthUrl = authenticator.keyuri(user.email, 'Cyber Academy', secret);

    await authRepository.upsertAdminMfaSecret({
      userId,
      ...encryptedSecret
    });

    return {
      otpauthUrl,
      manualEntryKey: secret
    };
  },

  verifyAdminMfa: async ({ userId, sessionId, code }) => {
    const action = MfaAttemptActions.VERIFY;
    await mfaAttemptService.assertAllowed({ action, userId });

    if (!MFA_CODE_PATTERN.test(code ?? '')) {
      await throwInvalidMfaCode({ action, userId });
    }

    const mfaConfig = await authRepository.findAdminMfaByUserId(userId);
    if (!mfaConfig) {
      throw new AppError('Admin MFA is not configured', 400);
    }

    const secret = decrypt({
      ciphertext: mfaConfig.secret_ciphertext,
      iv: mfaConfig.secret_iv,
      tag: mfaConfig.secret_tag
    });

    const isValid = authenticator.check(code, secret);
    if (!isValid) {
      await throwInvalidMfaCode({ action, userId });
    }

    await authRepository.enableAdminMfa(userId);
    await authRepository.touchAdminMfaVerification(userId);
    await mfaAttemptService.clearFailures({ action, userId });

    const session = assertSessionRegenerated(
      await sessionService.regenerateSession(sessionId, {
        mfaVerified: true
      })
    );

    return {
      session,
      response: {
        mfaVerified: true
      }
    };
  },

  disableAdminMfa: async ({ userId, sessionId, code }) => {
    const action = MfaAttemptActions.DISABLE;
    await mfaAttemptService.assertAllowed({ action, userId });

    if (!MFA_CODE_PATTERN.test(code ?? '')) {
      await throwInvalidMfaCode({ action, userId });
    }

    const mfaConfig = await authRepository.findAdminMfaByUserId(userId);
    if (!mfaConfig || !mfaConfig.is_enabled) {
      throw new AppError('Admin MFA is not enabled', 400);
    }

    const secret = decrypt({
      ciphertext: mfaConfig.secret_ciphertext,
      iv: mfaConfig.secret_iv,
      tag: mfaConfig.secret_tag
    });

    const isValid = authenticator.check(code, secret);
    if (!isValid) {
      await throwInvalidMfaCode({ action, userId });
    }

    await authRepository.disableAdminMfa(userId);
    await mfaAttemptService.clearFailures({ action, userId });

    const session = assertSessionRegenerated(
      await sessionService.regenerateSession(sessionId, {
        mfaVerified: false
      })
    );

    return {
      session
    };
  },

  revokeAllSessions: async (userId) => {
    await sessionService.destroyUserSessions(userId);
  },

  suspendUser: async (targetUserId) => {
    await authRepository.updateUserStatus(targetUserId, UserStatuses.SUSPENDED);
    await sessionService.destroyUserSessions(targetUserId);
  },

  banUser: async (targetUserId) => {
    await authRepository.updateUserStatus(targetUserId, UserStatuses.BANNED);
    await sessionService.destroyUserSessions(targetUserId);
  },

  changeUserRole: async (targetUserId, role) => {
    if (!Object.values(Roles).includes(role)) {
      throw new AppError('Invalid role', 400);
    }

    await authRepository.updateUserRole(targetUserId, role);
    await sessionService.reissueUserSessions(targetUserId, { role });
  }
};
