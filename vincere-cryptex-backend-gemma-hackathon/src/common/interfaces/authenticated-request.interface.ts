import { FastifyRequest } from 'fastify';

import { RequestAuthContext } from './authenticated-user.interface';

export type AuthenticatedRequest = FastifyRequest & {
  auth?: RequestAuthContext;
};
