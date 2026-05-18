import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';

import { AuthStateService } from '../../auth/auth-state.service';
import { SessionService } from '../../session/session.service';
import { SessionRecord, UserAuthState } from '../../session/session.types';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  private readonly logger = new Logger(AuthenticatedGuard.name);

  constructor(
    @Inject(AuthStateService)
    private readonly authStateService: AuthStateService,
    @Inject(SessionService)
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    try {
      const sessionId = this.sessionService.extractSignedSessionId(request);
      if (!sessionId) {
        throw new UnauthorizedException('Authentication required');
      }

      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        throw new UnauthorizedException('Session expired');
      }

      const clientBinding = this.sessionService.validateClientBinding(session.clientBinding, request);
      if (!clientBinding.valid) {
        this.logger.warn(
          JSON.stringify({
            event: 'auth.session_binding_mismatch',
            userId: session.userId,
            path: request.url,
          }),
        );
        await this.sessionService.destroySession(sessionId);
        throw new UnauthorizedException('Session binding mismatch');
      }

      const user = await this.authStateService.getOrHydrateUserAuthState(session.userId);

      if (!user) {
        await this.authStateService.clearUserAuthState(session.userId);
        await this.sessionService.destroySession(sessionId);
        throw new UnauthorizedException('User not found');
      }

      const authStateMismatches = this.collectAuthStateMismatches(session, user);
      if (authStateMismatches.length > 0) {
        this.logger.warn(
          JSON.stringify({
            event: 'auth.session_invalidated',
            userId: session.userId,
            path: request.url,
            mismatches: authStateMismatches,
          }),
        );
        await this.sessionService.destroySession(sessionId);
        throw new UnauthorizedException('Session is no longer valid');
      }

      if (user.deletedAt) {
        this.logger.warn(
          JSON.stringify({
            event: 'auth.session_deleted_user_blocked',
            userId: session.userId,
            path: request.url,
          }),
        );
        await this.sessionService.destroySession(sessionId);
        throw new UnauthorizedException('User not found');
      }

      if (user.userStatus === UserStatus.SUSPENDED) {
        await this.sessionService.destroySession(sessionId);
        throw new ForbiddenException('Account suspended');
      }

      if (user.userStatus === UserStatus.BANNED) {
        await this.sessionService.destroySession(sessionId);
        throw new ForbiddenException('Account banned');
      }

      if (!user.emailVerifiedAt) {
        await this.sessionService.destroySession(sessionId);
        throw new UnauthorizedException('Session is no longer valid');
      }

      const refreshedSession = await this.sessionService.refreshSession(
        sessionId,
        {
          ...session,
          clientBinding: clientBinding.nextBinding,
        },
        request,
      );
      if (!refreshedSession) {
        throw new UnauthorizedException('Session expired');
      }

      request.auth = {
        sessionId,
        session: refreshedSession,
        user: {
          id: user.userId,
          email: user.email,
          role: user.role,
          status: user.userStatus,
          sessionVersion: user.sessionVersion,
          adminMfaEnabled: user.adminMfaEnabled,
        },
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        JSON.stringify({
          event: 'auth.session_validation_failed',
          path: request.url,
        }),
        error instanceof Error ? error.stack : undefined,
      );
      throw new UnauthorizedException('Authentication unavailable');
    }
  }

  private collectAuthStateMismatches(session: SessionRecord, user: UserAuthState) {
    const mismatches: string[] = [];

    if (user.sessionVersion !== session.sessionVersion) {
      mismatches.push('sessionVersion');
    }

    if (user.role !== session.role) {
      mismatches.push('role');
    }

    if (user.userStatus !== session.userStatus) {
      mismatches.push('userStatus');
    }

    if (user.emailVerifiedAt !== session.emailVerifiedAt) {
      mismatches.push('emailVerifiedAt');
    }

    if (user.adminMfaEnabled !== session.adminMfaEnabled) {
      mismatches.push('adminMfaEnabled');
    }

    if (user.email !== session.email) {
      mismatches.push('email');
    }

    if (user.deletedAt !== session.deletedAt) {
      mismatches.push('deletedAt');
    }

    return mismatches;
  }
}
