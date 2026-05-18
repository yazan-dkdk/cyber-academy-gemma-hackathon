import { UserRole, UserStatus } from '@prisma/client';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

export type SessionAuthLevel = 'PASSWORD' | 'MFA';

export interface UserAuthState {
  userId: string;
  email: string;
  role: UserRole;
  userStatus: UserStatus;
  emailVerifiedAt: string | null;
  sessionVersion: number;
  adminMfaEnabled: boolean;
  deletedAt: string | null;
}

export interface SessionClientBinding {
  ipHash: string | null;
  ipSubnetHash: string | null;
  userAgentHash: string | null;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  email: string;
  role: UserRole;
  userStatus: UserStatus;
  emailVerifiedAt: string | null;
  sessionVersion: number;
  adminMfaEnabled: boolean;
  authLevel: SessionAuthLevel;
  adminMfaVerifiedAt: string | null;
  deletedAt: string | null;
  clientBinding: SessionClientBinding;
  createdAt: string;
  lastSeenAt: string;
}

export interface CreateSessionInput {
  user: UserAuthState;
  request: AuthenticatedRequest;
  authLevel: SessionAuthLevel;
  adminMfaVerifiedAt?: string | null;
}

export interface RegenerateSessionPatch {
  user?: Partial<UserAuthState>;
  authLevel?: SessionAuthLevel;
  adminMfaVerifiedAt?: string | null;
}
