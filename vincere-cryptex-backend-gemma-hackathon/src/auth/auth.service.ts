import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { randomBytes } from 'node:crypto';

import { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret, sha256Hex } from '../common/utils/crypto.util';
import { normalizeEmail } from '../common/utils/email.util';
import { waitForMinimumDuration } from '../common/utils/timing.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RequestAuthContext } from '../common/interfaces/authenticated-user.interface';
import { AuthStateService } from './auth-state.service';
import { EmailService } from './email.service';
import { MfaAttemptAction, MfaAttemptService } from './mfa-attempt.service';

authenticator.options = {
  step: 30,
  window: 1,
};

const GENERIC_REGISTER_RESPONSE = {
  message: 'If the registration was accepted, check your email for verification instructions.',
};

const GENERIC_RESEND_VERIFICATION_RESPONSE = {
  message: 'If an account requires verification, a new verification email has been sent.',
};

const GENERIC_FORGOT_PASSWORD_RESPONSE = {
  message: 'If the account exists, reset instructions will be sent',
};

const GENERIC_LOGIN_ERROR_MESSAGE = 'Invalid email or password';
const PASSWORD_HASH_ROUNDS = 12;
const DUMMY_BCRYPT_HASH = '$2a$10$7EqJtq98hPqEX7fNZaFWoOHi1s7C6KDAdM8X1sC3yRlmE4s46HoP.';

interface LockedOneTimeTokenRow {
  id: string;
  user_id: string;
}

interface LockedEmailVerificationTokenRow extends LockedOneTimeTokenRow {
  role: UserRole;
}

interface DevelopmentEmailVerificationToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly developmentEmailVerificationTokens = new Map<
    string,
    DevelopmentEmailVerificationToken
  >();

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(SessionService)
    private readonly sessionService: SessionService,
    @Inject(AuthStateService)
    private readonly authStateService: AuthStateService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
    @Inject(EmailService)
    private readonly emailService: EmailService,
    @Inject(MfaAttemptService)
    private readonly mfaAttemptService: MfaAttemptService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async register(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        role: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!existingUser) {
      const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
      const user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: UserRole.STUDENT,
          status: UserStatus.PENDING_EMAIL_VERIFICATION,
        },
      });

      await this.createEmailVerificationToken(user.id, user.email);
      return GENERIC_REGISTER_RESPONSE;
    }

    if (existingUser.deletedAt) {
      // Soft-deleted emails remain intentionally reserved. We keep the generic
      // registration response here so the client never learns whether the email
      // is already blocked by an active account or a soft-deleted one.
      return GENERIC_REGISTER_RESPONSE;
    }

    if (
      existingUser.role === UserRole.STUDENT &&
      existingUser.status === UserStatus.PENDING_EMAIL_VERIFICATION
    ) {
      await this.createEmailVerificationToken(existingUser.id, normalizedEmail);
    }

    return GENERIC_REGISTER_RESPONSE;
  }

  async verifyEmail(token: string) {
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const tokenHash = sha256Hex(token);
    const verifiedUser = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<LockedEmailVerificationTokenRow[]>`
        SELECT evt.id, evt.user_id, u.role
        FROM email_verification_tokens AS evt
        INNER JOIN users AS u ON u.id = evt.user_id
        WHERE evt.token_hash = ${tokenHash}
          AND evt.used_at IS NULL
          AND evt.expires_at > NOW()
          AND u.deleted_at IS NULL
          AND u.status = 'PENDING_EMAIL_VERIFICATION'
        LIMIT 1
        FOR UPDATE OF evt, u
      `;

      const lockedToken = lockedRows[0];
      if (!lockedToken) {
        throw new BadRequestException('Invalid or expired verification token');
      }

      const claimedAt = new Date();
      const claimedToken = await tx.emailVerificationToken.updateMany({
        where: {
          id: lockedToken.id,
          usedAt: null,
          expiresAt: {
            gt: claimedAt,
          },
          user: {
            is: {
              deletedAt: null,
              status: UserStatus.PENDING_EMAIL_VERIFICATION,
            },
          },
        },
        data: {
          usedAt: claimedAt,
        },
      });

      if (claimedToken.count !== 1) {
        throw new BadRequestException('Invalid or expired verification token');
      }

      await tx.emailVerificationToken.updateMany({
        where: {
          userId: lockedToken.user_id,
          usedAt: null,
          id: {
            not: lockedToken.id,
          },
        },
        data: {
          usedAt: claimedAt,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: lockedToken.user_id },
        data: {
          emailVerifiedAt: claimedAt,
          ...(lockedToken.role === UserRole.STUDENT
            ? {
                status: UserStatus.ACTIVE,
              }
            : {}),
        },
        include: {
          adminMfaConfig: true,
        },
      });

      await this.auditService.log({
        actorUserId: updatedUser.id,
        targetUserId: updatedUser.id,
        action: 'auth.email_verification.completed',
        metadata: {
          role: updatedUser.role,
          status: updatedUser.status,
        },
        runner: tx,
      });

      return updatedUser;
    });
    await this.authStateService.cacheUserRecord(verifiedUser);

    return {
      message: 'Email verified successfully',
    };
  }

  async resendVerification(email: string) {
    await waitForMinimumDuration(async () => {
      const normalizedEmail = normalizeEmail(email);
      const user = await this.prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          deletedAt: null,
          status: UserStatus.PENDING_EMAIL_VERIFICATION,
          emailVerifiedAt: null,
        },
        select: {
          id: true,
          email: true,
        },
      });

      if (!user) {
        return;
      }

      await this.createEmailVerificationToken(user.id, user.email);
    }, this.configService.forgotPasswordMinDurationMs);

    return GENERIC_RESEND_VERIFICATION_RESPONSE;
  }

  async getDevelopmentEmailVerificationToken(email: string) {
    if (this.configService.isProduction) {
      throw new NotFoundException('Not found');
    }

    if (!email?.trim()) {
      throw new BadRequestException('Email is required');
    }

    const now = new Date();
    const normalizedEmail = normalizeEmail(email);
    const latestToken = await this.prisma.emailVerificationToken.findFirst({
      where: {
        usedAt: null,
        expiresAt: {
          gt: now,
        },
        user: {
          is: {
            email: normalizedEmail,
            deletedAt: null,
            status: UserStatus.PENDING_EMAIL_VERIFICATION,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
      },
    });

    if (!latestToken) {
      throw new NotFoundException('Email verification token not found');
    }

    const developmentToken = this.developmentEmailVerificationTokens.get(latestToken.id);
    if (!developmentToken || developmentToken.expiresAt <= now) {
      this.developmentEmailVerificationTokens.delete(latestToken.id);
      throw new NotFoundException('Raw email verification token is not available');
    }

    return {
      token: developmentToken.token,
    };
  }

  async login(email: string, password: string, request: AuthenticatedRequest) {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
      include: {
        adminMfaConfig: true,
      },
    });

    const passwordHash = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const passwordValid = await bcrypt.compare(password, passwordHash);

    // Sign-in is intentionally generic so the endpoint does not reveal whether
    // the email exists, the password was wrong, or the account is not eligible
    // to authenticate yet. Only ACTIVE accounts are allowed to start sessions.
    if (!user || !passwordValid || user.status !== UserStatus.ACTIVE || !user.emailVerifiedAt) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR_MESSAGE);
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const userAuthState = this.authStateService.buildUserAuthState(user);
    const session = await this.sessionService.createSession({
      user: userAuthState,
      request,
      authLevel: isAdmin ? 'PASSWORD' : 'MFA',
      adminMfaVerifiedAt: isAdmin ? null : new Date().toISOString(),
    });
    await this.authStateService.cacheUserAuthState(userAuthState);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return {
      session,
      response: {
        user: this.serializeUser(user),
        ...this.serializeSessionState({
          role: user.role,
          adminMfaEnabled: userAuthState.adminMfaEnabled,
          authLevel: session.authLevel,
        }),
      },
    };
  }

  async logout(sessionId?: string | null) {
    if (sessionId) {
      await this.sessionService.destroySession(sessionId);
    }

    return {
      message: 'Logged out successfully',
    };
  }

  async getCurrentUser(auth: RequestAuthContext) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: auth.user.id,
        deletedAt: null,
      },
      include: {
        adminMfaConfig: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      user: this.serializeUser(user),
      session: this.serializeSessionState({
        role: user.role,
        adminMfaEnabled: Boolean(user.adminMfaConfig?.isEnabled),
        authLevel: auth.session.authLevel,
      }),
    };
  }

  async createPasswordReset(email: string) {
    await waitForMinimumDuration(async () => {
      const normalizedEmail = normalizeEmail(email);
      const user = await this.prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        return;
      }

      const rawToken = this.generateToken();
      const issuedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        // Password reset links are one-time credentials. Reissuing a link first
        // retires any older unused reset tokens so only the latest flow remains valid.
        await tx.passwordResetToken.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
          },
          data: {
            usedAt: issuedAt,
          },
        });

        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: sha256Hex(rawToken),
            expiresAt: new Date(
              issuedAt.getTime() + this.configService.passwordResetTokenTtlMinutes * 60 * 1000,
            ),
          },
        });
      });
    }, this.configService.forgotPasswordMinDurationMs);

    return GENERIC_FORGOT_PASSWORD_RESPONSE;
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = sha256Hex(token);
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      // Password reset consumption stays aligned with issuance policy: only
      // ACTIVE accounts can consume reset links.
      const lockedRows = await tx.$queryRaw<LockedOneTimeTokenRow[]>`
        SELECT prt.id, prt.user_id
        FROM password_reset_tokens AS prt
        INNER JOIN users AS u ON u.id = prt.user_id
        WHERE prt.token_hash = ${tokenHash}
          AND prt.used_at IS NULL
          AND prt.expires_at > NOW()
          AND u.deleted_at IS NULL
          AND u.status = 'ACTIVE'
        LIMIT 1
        FOR UPDATE OF prt, u
      `;

      const lockedToken = lockedRows[0];
      if (!lockedToken) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      const claimedAt = new Date();
      const claimedToken = await tx.passwordResetToken.updateMany({
        where: {
          id: lockedToken.id,
          usedAt: null,
          expiresAt: {
            gt: claimedAt,
          },
          user: {
            is: {
              deletedAt: null,
              status: UserStatus.ACTIVE,
            },
          },
        },
        data: {
          usedAt: claimedAt,
        },
      });

      if (claimedToken.count !== 1) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      await tx.passwordResetToken.updateMany({
        where: {
          userId: lockedToken.user_id,
          usedAt: null,
          id: {
            not: lockedToken.id,
          },
        },
        data: {
          usedAt: claimedAt,
        },
      });

      return tx.user.update({
        where: { id: lockedToken.user_id },
        data: {
          passwordHash,
          // Rotating sessionVersion invalidates every existing session on the
          // next authenticated request without needing a user-to-session index.
          sessionVersion: {
            increment: 1,
          },
        },
        include: {
          adminMfaConfig: true,
        },
      });
    });

    await this.auditService.log({
      actorUserId: updatedUser.id,
      targetUserId: updatedUser.id,
      action: 'auth.password_reset.completed',
      metadata: {},
    });
    await this.authStateService.cacheUserRecord(updatedUser);

    return {
      message: 'Password reset successfully',
    };
  }

  async setupAdminMfa(auth: RequestAuthContext) {
    if (auth.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin account required');
    }

    if (auth.user.adminMfaEnabled && auth.session.authLevel !== 'MFA') {
      throw new ForbiddenException('Admin MFA verification required');
    }

    const secret = authenticator.generateSecret();
    const encryptedSecret = encryptSecret(secret, this.configService.mfaEncryptionKey);
    const otpauthUrl = authenticator.keyuri(auth.user.email, this.configService.mfaIssuer, secret);

    await this.prisma.adminMfaConfig.upsert({
      where: { userId: auth.user.id },
      update: {
        secretCiphertext: encryptedSecret.ciphertext,
        secretIv: encryptedSecret.iv,
        secretTag: encryptedSecret.tag,
        isEnabled: false,
        enabledAt: null,
        lastVerifiedAt: null,
      },
      create: {
        userId: auth.user.id,
        secretCiphertext: encryptedSecret.ciphertext,
        secretIv: encryptedSecret.iv,
        secretTag: encryptedSecret.tag,
        isEnabled: false,
      },
    });

    return {
      otpauthUrl,
      manualEntryKey: secret,
    };
  }

  async verifyAdminMfa(auth: RequestAuthContext, code: string) {
    await this.mfaAttemptService.assertAllowed(auth.user.id, MfaAttemptAction.VERIFY);

    const mfaConfig = await this.prisma.adminMfaConfig.findUnique({
      where: { userId: auth.user.id },
    });

    if (!mfaConfig) {
      throw new BadRequestException('Admin MFA is not configured');
    }

    const secret = decryptSecret(
      {
        ciphertext: mfaConfig.secretCiphertext,
        iv: mfaConfig.secretIv,
        tag: mfaConfig.secretTag,
      },
      this.configService.mfaEncryptionKey,
    );

    if (!authenticator.check(code, secret)) {
      await this.mfaAttemptService.recordFailure(auth.user.id, MfaAttemptAction.VERIFY);
      throw new UnauthorizedException('Invalid MFA code');
    }

    const now = new Date();
    await this.prisma.adminMfaConfig.update({
      where: { userId: auth.user.id },
      data: {
        isEnabled: true,
        enabledAt: mfaConfig.isEnabled ? mfaConfig.enabledAt : now,
        lastVerifiedAt: now,
      },
    });

    await this.mfaAttemptService.clearFailures(auth.user.id, MfaAttemptAction.VERIFY);
    const refreshedAuthState = await this.authStateService.hydrateUserAuthState(auth.user.id);
    if (!refreshedAuthState) {
      throw new UnauthorizedException('User not found');
    }

    const regeneratedSession = await this.sessionService.regenerateSession(auth.sessionId, {
      user: {
        email: refreshedAuthState.email,
        role: refreshedAuthState.role,
        userStatus: refreshedAuthState.userStatus,
        emailVerifiedAt: refreshedAuthState.emailVerifiedAt,
        sessionVersion: refreshedAuthState.sessionVersion,
        adminMfaEnabled: refreshedAuthState.adminMfaEnabled,
        deletedAt: refreshedAuthState.deletedAt,
      },
      authLevel: 'MFA',
      adminMfaVerifiedAt: now.toISOString(),
    });

    if (!regeneratedSession) {
      throw new UnauthorizedException('Session expired');
    }

    return {
      session: regeneratedSession,
      response: {
        mfaConfigured: true,
        mfaVerified: true,
      },
    };
  }

  async disableAdminMfa(auth: RequestAuthContext, code: string) {
    await this.mfaAttemptService.assertAllowed(auth.user.id, MfaAttemptAction.DISABLE);

    const mfaConfig = await this.prisma.adminMfaConfig.findUnique({
      where: { userId: auth.user.id },
    });

    if (!mfaConfig?.isEnabled) {
      throw new BadRequestException('Admin MFA is not enabled');
    }

    const secret = decryptSecret(
      {
        ciphertext: mfaConfig.secretCiphertext,
        iv: mfaConfig.secretIv,
        tag: mfaConfig.secretTag,
      },
      this.configService.mfaEncryptionKey,
    );

    if (!authenticator.check(code, secret)) {
      await this.mfaAttemptService.recordFailure(auth.user.id, MfaAttemptAction.DISABLE);
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.adminMfaConfig.update({
        where: { userId: auth.user.id },
        data: {
          isEnabled: false,
          enabledAt: null,
          lastVerifiedAt: null,
        },
      });

      await tx.user.update({
        where: { id: auth.user.id },
        data: {
          sessionVersion: {
            increment: 1,
          },
        },
      });
    });

    await this.mfaAttemptService.clearFailures(auth.user.id, MfaAttemptAction.DISABLE);
    const refreshedAuthState = await this.authStateService.hydrateUserAuthState(auth.user.id);
    if (!refreshedAuthState) {
      throw new UnauthorizedException('User not found');
    }

    const regeneratedSession = await this.sessionService.regenerateSession(auth.sessionId, {
      user: {
        email: refreshedAuthState.email,
        role: refreshedAuthState.role,
        userStatus: refreshedAuthState.userStatus,
        emailVerifiedAt: refreshedAuthState.emailVerifiedAt,
        sessionVersion: refreshedAuthState.sessionVersion,
        adminMfaEnabled: refreshedAuthState.adminMfaEnabled,
        deletedAt: refreshedAuthState.deletedAt,
      },
      authLevel: 'PASSWORD',
      adminMfaVerifiedAt: null,
    });

    if (!regeneratedSession) {
      throw new UnauthorizedException('Session expired');
    }

    return {
      session: regeneratedSession,
      response: {
        mfaConfigured: false,
        mfaVerified: false,
      },
    };
  }

  private async createEmailVerificationToken(userId: string, email: string) {
    const rawToken = this.generateToken();
    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + this.configService.emailVerificationTokenTtlHours * 60 * 60 * 1000,
    );
    const createdToken = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: {
          userId,
          usedAt: null,
        },
        data: {
          usedAt: issuedAt,
        },
      });

      return tx.emailVerificationToken.create({
        data: {
          userId,
          tokenHash: sha256Hex(rawToken),
          expiresAt,
        },
        select: {
          id: true,
          expiresAt: true,
        },
      });
    });

    if (!this.configService.isProduction) {
      this.pruneDevelopmentEmailVerificationTokens();
      this.developmentEmailVerificationTokens.set(createdToken.id, {
        token: rawToken,
        expiresAt: createdToken.expiresAt,
      });
    }

    void this.emailService.sendEmailVerification({
      to: email,
      token: rawToken,
      expiresAt: createdToken.expiresAt,
    });
  }

  private generateToken() {
    return randomBytes(32).toString('hex');
  }

  private pruneDevelopmentEmailVerificationTokens() {
    const now = Date.now();
    for (const [tokenId, token] of this.developmentEmailVerificationTokens.entries()) {
      if (token.expiresAt.getTime() <= now) {
        this.developmentEmailVerificationTokens.delete(tokenId);
      }
    }
  }

  private serializeUser(user: {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    emailVerifiedAt: Date | null;
    deletedAt?: Date | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.emailVerifiedAt),
    };
  }

  private serializeSessionState(input: {
    role: UserRole;
    adminMfaEnabled: boolean;
    authLevel: 'PASSWORD' | 'MFA';
  }) {
    return {
      mfaRequired: input.role === UserRole.ADMIN,
      mfaConfigured: input.adminMfaEnabled,
      mfaVerified: input.authLevel === 'MFA',
    };
  }

}
