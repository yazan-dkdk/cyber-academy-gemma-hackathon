import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AuthStateService } from '../auth/auth-state.service';
import { buildPagination } from '../common/utils/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authStateService: AuthStateService,
  ) {}

  async listUsers(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                email: {
                  contains: query.search.trim().toLowerCase(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          adminMfaConfig: {
            select: {
              isEnabled: true,
            },
          },
        },
      }),
    ]);

    return {
      users: users.map((user) => this.serializeUser(user)),
      pagination: buildPagination(page, pageSize, total),
    };
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: {
        adminMfaConfig: {
          select: {
            isEnabled: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      user: this.serializeUser(user),
    };
  }

  async suspendUser(actorUserId: string, targetUserId: string) {
    return this.updateUserStatus(actorUserId, targetUserId, UserStatus.SUSPENDED, 'admin.user.suspended');
  }

  async banUser(actorUserId: string, targetUserId: string) {
    return this.updateUserStatus(actorUserId, targetUserId, UserStatus.BANNED, 'admin.user.banned');
  }

  async reactivateUser(actorUserId: string, targetUserId: string) {
    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        deletedAt: null,
      },
      include: {
        adminMfaConfig: {
          select: {
            isEnabled: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    this.assertMutableTarget(actorUserId, targetUserId, targetUser.role);

    const nextStatus = targetUser.emailVerifiedAt
      ? UserStatus.ACTIVE
      : UserStatus.PENDING_EMAIL_VERIFICATION;

    if (targetUser.status === nextStatus) {
      throw new BadRequestException('User already has this status');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetUserId },
        data: {
          status: nextStatus,
          sessionVersion: {
            increment: 1,
          },
        },
        include: {
          adminMfaConfig: {
            select: {
              isEnabled: true,
            },
          },
        },
      });

      await this.auditService.log({
        actorUserId,
        targetUserId,
        action: 'admin.user.reactivated',
        metadata: {
          fromStatus: targetUser.status,
          toStatus: nextStatus,
        },
        runner: tx,
      });

      return user;
    });
    await this.authStateService.cacheUserRecord(updatedUser);

    return {
      user: this.serializeUser(updatedUser),
    };
  }

  async changeRole(actorUserId: string, targetUserId: string, nextRole: UserRole) {
    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        deletedAt: null,
      },
      include: {
        adminMfaConfig: {
          select: {
            isEnabled: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    this.assertMutableTarget(actorUserId, targetUserId, targetUser.role);
    if (nextRole !== UserRole.STUDENT && nextRole !== UserRole.INSTRUCTOR) {
      throw new BadRequestException('Only STUDENT and INSTRUCTOR roles are mutable');
    }

    if (targetUser.role === nextRole) {
      throw new BadRequestException('User already has this role');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetUserId },
        data: {
          role: nextRole,
          sessionVersion: {
            increment: 1,
          },
        },
        include: {
          adminMfaConfig: {
            select: {
              isEnabled: true,
            },
          },
        },
      });

      await this.auditService.log({
        actorUserId,
        targetUserId,
        action: 'admin.user.role_changed',
        metadata: {
          fromRole: targetUser.role,
          toRole: nextRole,
        },
        runner: tx,
      });

      return user;
    });
    await this.authStateService.cacheUserRecord(updatedUser);

    return {
      user: this.serializeUser(updatedUser),
    };
  }

  private async updateUserStatus(
    actorUserId: string,
    targetUserId: string,
    nextStatus: UserStatus,
    auditAction: string,
  ) {
    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        deletedAt: null,
      },
      include: {
        adminMfaConfig: {
          select: {
            isEnabled: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    this.assertMutableTarget(actorUserId, targetUserId, targetUser.role);

    if (targetUser.status === nextStatus) {
      throw new BadRequestException('User already has this status');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetUserId },
        data: {
          status: nextStatus,
          sessionVersion: {
            increment: 1,
          },
        },
        include: {
          adminMfaConfig: {
            select: {
              isEnabled: true,
            },
          },
        },
      });

      await this.auditService.log({
        actorUserId,
        targetUserId,
        action: auditAction,
        metadata: {
          fromStatus: targetUser.status,
          toStatus: nextStatus,
        },
        runner: tx,
      });

      return user;
    });
    await this.authStateService.cacheUserRecord(updatedUser);

    return {
      user: this.serializeUser(updatedUser),
    };
  }

  private assertMutableTarget(actorUserId: string, targetUserId: string, targetRole: UserRole) {
    if (actorUserId === targetUserId) {
      throw new ForbiddenException('You cannot modify your own account through this route');
    }

    if (targetRole === UserRole.ADMIN) {
      throw new ForbiddenException('Admin accounts are not mutable through this route');
    }
  }

  private serializeUser(user: {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    emailVerifiedAt: Date | null;
    lastLoginAt: Date | null;
    deletedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    adminMfaConfig?: {
      isEnabled: boolean;
    } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      adminMfaEnabled: Boolean(user.adminMfaConfig?.isEnabled),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
