import { Inject, Injectable } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';

import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UserAuthState } from '../session/session.types';

const AUTH_STATE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  sessionVersion: true,
  deletedAt: true,
  adminMfaConfig: {
    select: {
      isEnabled: true,
    },
  },
} satisfies Prisma.UserSelect;

export type AuthStateUserRecord = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  sessionVersion: number;
  deletedAt?: Date | null;
  adminMfaConfig?: {
    isEnabled: boolean;
  } | null;
};

@Injectable()
export class AuthStateService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(RedisService)
    private readonly redisService: RedisService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  buildUserAuthState(user: AuthStateUserRecord): UserAuthState {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      userStatus: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      sessionVersion: user.sessionVersion,
      adminMfaEnabled: Boolean(user.adminMfaConfig?.isEnabled),
      deletedAt: user.deletedAt?.toISOString() ?? null,
    };
  }

  async cacheUserAuthState(userAuthState: UserAuthState) {
    // Auth state cache is not a long-term source of truth. It is only a
    // short-lived performance layer, so cache misses must always hydrate from DB.
    await this.redisService.setJson(
      this.userAuthStateKey(userAuthState.userId),
      userAuthState,
      this.configService.authStateCacheTtlSeconds,
    );

    return userAuthState;
  }

  async cacheUserRecord(user: AuthStateUserRecord) {
    return this.cacheUserAuthState(this.buildUserAuthState(user));
  }

  async getCachedUserAuthState(userId: string) {
    return this.redisService.getJson<UserAuthState>(this.userAuthStateKey(userId));
  }

  async clearUserAuthState(userId: string) {
    await this.redisService.del(this.userAuthStateKey(userId));
  }

  async hydrateUserAuthState(userId: string) {
    // Soft-deleted users stay in the auth snapshot model so archived accounts
    // immediately invalidate any still-open sessions without weakening checks.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: AUTH_STATE_USER_SELECT,
    });

    if (!user) {
      await this.clearUserAuthState(userId);
      return null;
    }

    return this.cacheUserRecord(user);
  }

  async getOrHydrateUserAuthState(userId: string) {
    // Auth state cache is not a long-term source of truth.
    const cached = await this.getCachedUserAuthState(userId);
    if (cached) {
      return cached;
    }

    return this.hydrateUserAuthState(userId);
  }

  private userAuthStateKey(userId: string) {
    return `user-auth-state:${userId}`;
  }
}
