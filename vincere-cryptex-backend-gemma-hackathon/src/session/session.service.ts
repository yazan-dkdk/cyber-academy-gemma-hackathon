import { Inject, Injectable } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { isIP } from 'node:net';
import { randomBytes } from 'node:crypto';

import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { sha256Hex } from '../common/utils/crypto.util';
import { AppConfigService } from '../config/app-config.service';
import { RedisService } from '../redis/redis.service';
import {
  CreateSessionInput,
  RegenerateSessionPatch,
  SessionClientBinding,
  SessionRecord,
} from './session.types';

interface ClientBindingValidationResult {
  valid: boolean;
  nextBinding: SessionClientBinding;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(RedisService)
    private readonly redisService: RedisService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const sessionId = this.generateSessionId();
    const now = new Date().toISOString();
    const session: SessionRecord = {
      sessionId,
      userId: input.user.userId,
      email: input.user.email,
      role: input.user.role,
      userStatus: input.user.userStatus,
      emailVerifiedAt: input.user.emailVerifiedAt,
      sessionVersion: input.user.sessionVersion,
      adminMfaEnabled: input.user.adminMfaEnabled,
      authLevel: input.authLevel,
      adminMfaVerifiedAt: input.adminMfaVerifiedAt ?? null,
      deletedAt: input.user.deletedAt,
      clientBinding: this.buildClientBinding(input.request),
      createdAt: now,
      lastSeenAt: now,
    };

    await this.redisService.setJson(this.redisKey(sessionId), session, this.resolveTtl(session));
    return session;
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const session = await this.redisService.getJson<SessionRecord>(this.redisKey(sessionId));
    if (!session) {
      return null;
    }

    if (this.resolveTtl(session) <= 0) {
      await this.destroySession(sessionId);
      return null;
    }

    return session;
  }

  async refreshSession(
    sessionId: string,
    session: SessionRecord,
    request?: AuthenticatedRequest,
  ): Promise<SessionRecord | null> {
    const binding = request
      ? this.validateClientBinding(session.clientBinding, request)
      : {
          valid: true,
          nextBinding: session.clientBinding,
        };

    if (!binding.valid) {
      await this.destroySession(sessionId);
      return null;
    }

    const refreshedSession: SessionRecord = {
      ...session,
      clientBinding: binding.nextBinding,
      lastSeenAt: new Date().toISOString(),
    };
    const ttl = this.resolveTtl(refreshedSession);
    if (ttl <= 0) {
      await this.destroySession(sessionId);
      return null;
    }

    await this.redisService.setJson(this.redisKey(sessionId), refreshedSession, ttl);
    return refreshedSession;
  }

  async regenerateSession(sessionId: string, patch: RegenerateSessionPatch) {
    const existingSession = await this.getSession(sessionId);
    if (!existingSession) {
      return null;
    }

    const nextSession: SessionRecord = {
      ...existingSession,
      sessionId: this.generateSessionId(),
      email: patch.user?.email ?? existingSession.email,
      role: patch.user?.role ?? existingSession.role,
      userStatus: patch.user?.userStatus ?? existingSession.userStatus,
      emailVerifiedAt: patch.user?.emailVerifiedAt ?? existingSession.emailVerifiedAt ?? null,
      sessionVersion: patch.user?.sessionVersion ?? existingSession.sessionVersion,
      adminMfaEnabled: patch.user?.adminMfaEnabled ?? existingSession.adminMfaEnabled,
      deletedAt: patch.user?.deletedAt ?? existingSession.deletedAt,
      authLevel: patch.authLevel ?? existingSession.authLevel,
      adminMfaVerifiedAt: patch.adminMfaVerifiedAt ?? existingSession.adminMfaVerifiedAt,
      lastSeenAt: new Date().toISOString(),
    };

    await this.redisService.setJson(
      this.redisKey(nextSession.sessionId),
      nextSession,
      this.resolveTtl(nextSession),
    );
    await this.destroySession(sessionId);
    return nextSession;
  }

  async destroySession(sessionId: string) {
    await this.redisService.del(this.redisKey(sessionId));
  }

  validateClientBinding(
    binding: SessionClientBinding | undefined,
    request: AuthenticatedRequest,
  ): ClientBindingValidationResult {
    if (!binding) {
      return {
        valid: false,
        nextBinding: this.buildClientBinding(request),
      };
    }

    const currentBinding = this.buildClientBinding(request);

    if (binding.userAgentHash !== currentBinding.userAgentHash) {
      return {
        valid: false,
        nextBinding: currentBinding,
      };
    }

    if (!binding.ipHash || !currentBinding.ipHash) {
      return {
        valid: true,
        nextBinding: currentBinding,
      };
    }

    if (binding.ipHash === currentBinding.ipHash) {
      return {
        valid: true,
        nextBinding: currentBinding,
      };
    }

    if (
      binding.ipSubnetHash &&
      currentBinding.ipSubnetHash &&
      binding.ipSubnetHash === currentBinding.ipSubnetHash
    ) {
      return {
        valid: true,
        nextBinding: currentBinding,
      };
    }

    return {
      valid: false,
      nextBinding: currentBinding,
    };
  }

  extractSignedSessionId(request: AuthenticatedRequest) {
    const signedCookie = request.cookies?.[this.configService.sessionCookieName];
    if (!signedCookie) {
      return null;
    }

    const unsigned = request.unsignCookie(signedCookie);
    return unsigned.valid ? unsigned.value : null;
  }

  setSessionCookie(reply: FastifyReply, sessionId: string) {
    reply.setCookie(this.configService.sessionCookieName, sessionId, {
      path: '/',
      httpOnly: true,
      secure: this.configService.isProduction,
      sameSite: 'lax',
      signed: true,
      maxAge: this.configService.sessionTtlSeconds,
    });
  }

  clearSessionCookie(reply: FastifyReply) {
    reply.clearCookie(this.configService.sessionCookieName, {
      path: '/',
      httpOnly: true,
      secure: this.configService.isProduction,
      sameSite: 'lax',
      signed: true,
    });
  }

  private generateSessionId() {
    return randomBytes(32).toString('base64url');
  }

  private redisKey(sessionId: string) {
    return `session:${sessionId}`;
  }

  private resolveTtl(session: SessionRecord) {
    const createdAtMs = new Date(session.createdAt).getTime();
    const lastSeenAtMs = new Date(session.lastSeenAt).getTime();
    const now = Date.now();

    const absoluteRemaining =
      this.configService.sessionTtlSeconds - Math.floor((now - createdAtMs) / 1000);
    const idleRemaining =
      this.configService.sessionIdleTtlSeconds - Math.floor((now - lastSeenAtMs) / 1000);

    return Math.min(absoluteRemaining, idleRemaining);
  }

  private buildClientBinding(request: AuthenticatedRequest): SessionClientBinding {
    const normalizedIp = this.normalizeIp(request.ip);
    const userAgent = this.normalizeUserAgent(request.headers['user-agent']);

    return {
      ipHash: normalizedIp ? sha256Hex(normalizedIp) : null,
      ipSubnetHash: normalizedIp ? sha256Hex(this.toNetworkFingerprint(normalizedIp)) : null,
      userAgentHash: userAgent ? sha256Hex(userAgent) : null,
    };
  }
  private normalizeIp(rawIp: string | undefined) {
    if (!rawIp) {
      return null;
    }

    const candidate = rawIp.split(',')[0]!.trim().replace(/^::ffff:/i, '');
    return isIP(candidate) ? candidate.toLowerCase() : null;
  }

  private normalizeUserAgent(rawUserAgent: string | string[] | undefined) {
    const value = Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent;
    if (!value) {
      return null;
    }

    const normalized = value.trim().slice(0, 512);
    return normalized.length > 0 ? normalized : null;
  }

  private toNetworkFingerprint(ipAddress: string) {
    if (isIP(ipAddress) === 4) {
      const octets = ipAddress.split('.');
      return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }

    const expandedIpv6 = this.expandIpv6(ipAddress);
    return `${expandedIpv6.slice(0, 4).join(':')}::/64`;
  }

  private expandIpv6(ipAddress: string) {
    const [baseAddress] = ipAddress.split('%');
    const [left = '', right = ''] = baseAddress.split('::');
    const leftParts = left.length > 0 ? left.split(':') : [];
    const rightParts = right.length > 0 ? right.split(':') : [];
    const missingGroups = 8 - (leftParts.length + rightParts.length);

    return [
      ...leftParts,
      ...Array.from({ length: Math.max(missingGroups, 0) }, () => '0'),
      ...rightParts,
    ].map((segment) => segment.padStart(4, '0').toLowerCase());
  }
}
