import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';

import { PrismaRunner } from '../common/types/prisma-runner.type';
import { PrismaService } from '../prisma/prisma.service';

interface LogAuditInput {
  actorUserId: string;
  action: string;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
  runner?: PrismaRunner;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: LogAuditInput): Promise<AuditLog> {
    const runner = input.runner ?? this.prisma;
    return runner.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId ?? null,
        action: input.action,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
