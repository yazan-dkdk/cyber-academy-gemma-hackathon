import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRE_ADMIN_MFA_KEY } from '../decorators/admin-mfa.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

@Injectable()
export class AdminMfaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiresAdminMfa = this.reflector.getAllAndOverride<boolean>(REQUIRE_ADMIN_MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiresAdminMfa) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;

    if (!auth || auth.user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin account required');
    }

    if (!auth.user.adminMfaEnabled || auth.session.authLevel !== 'MFA') {
      throw new ForbiddenException('Admin MFA verification required');
    }

    return true;
  }
}
