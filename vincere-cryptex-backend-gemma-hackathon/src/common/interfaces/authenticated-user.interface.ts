import { UserRole, UserStatus } from '@prisma/client';

import { SessionRecord } from '../../session/session.types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  sessionVersion: number;
  adminMfaEnabled: boolean;
}

export interface RequestAuthContext {
  sessionId: string;
  session: SessionRecord;
  user: AuthenticatedUser;
}
