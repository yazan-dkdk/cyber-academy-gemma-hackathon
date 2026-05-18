import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

export const CurrentSession = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) {
    throw new UnauthorizedException('Authentication required');
  }

  return request.auth;
});
