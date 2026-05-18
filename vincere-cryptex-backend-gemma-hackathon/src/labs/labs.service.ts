import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  EntityType,
  LabInstance,
  LabInstanceStatus,
  LabStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { ActivityService } from '../activity/activity.service';
import { buildPagination } from '../common/utils/pagination.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  LabOrchestratorClient,
  LabOrchestratorError,
  OrchestratorInstanceResponse,
} from './lab-orchestrator.client';
import { ListLabsQueryDto } from './dto/list-labs-query.dto';

const LIVE_LAB_INSTANCE_STATUSES: LabInstanceStatus[] = [
  LabInstanceStatus.STARTING,
  LabInstanceStatus.ACTIVE,
];
const MAX_PROXY_TOKEN_GENERATION_ATTEMPTS = 3;

type LabProxyAccessReason =
  | 'allowed'
  | 'not_found'
  | 'forbidden'
  | 'lab_unavailable'
  | 'expired'
  | 'inactive';

interface LabProxyAccessInstanceView {
  id: string;
  labId: string;
  status: LabInstanceStatus;
  expiresAt: Date;
}

interface CreateStartingInstanceResult {
  instance: LabInstance;
  created: boolean;
}

interface LockedResetCandidateRow {
  id: string;
  status: LabInstanceStatus;
}

interface LockedFinalizeCandidateRow {
  id: string;
  status: LabInstanceStatus;
}

@Injectable()
export class LabsService {
  private readonly logger = new Logger(LabsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly configService: AppConfigService,
    private readonly orchestratorClient: LabOrchestratorClient,
  ) {}

  async listPublishedLabs(userId: string, query: ListLabsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const now = new Date();
    const where: Prisma.LabWhereInput = {
      status: LabStatus.PUBLISHED,
      publishedAt: {
        not: null,
      },
      ...(query.search
        ? {
            OR: [
              {
                title: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                description: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(query.category ? { category: query.category.trim() } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    };

    const [total, labs] = await this.prisma.$transaction([
      this.prisma.lab.count({ where }),
      this.prisma.lab.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          instances: this.buildCurrentLiveInstanceRelation(userId, now),
        },
      }),
    ]);

    return {
      labs: labs.map((lab) => ({
        id: lab.id,
        title: lab.title,
        description: lab.description,
        category: lab.category,
        difficulty: lab.difficulty,
        type: lab.type,
        ttlMinutes: lab.ttlMinutes,
        publishedAt: lab.publishedAt,
        currentInstance: this.serializeLabInstance(this.filterCurrentLiveInstance(lab.instances[0])),
      })),
      pagination: buildPagination(page, pageSize, total),
    };
  }

  async getPublishedLabById(userId: string, labId: string) {
    const now = new Date();
    await this.expireOwnedDueInstances(userId, labId);
    const lab = await this.getPublishedLabOrThrow(labId, userId, now);

    return {
      lab: {
        id: lab.id,
        title: lab.title,
        description: lab.description,
        category: lab.category,
        difficulty: lab.difficulty,
        type: lab.type,
        ttlMinutes: lab.ttlMinutes,
        publishedAt: lab.publishedAt,
        currentInstance: this.serializeLabInstance(this.filterCurrentLiveInstance(lab.instances[0])),
      },
    };
  }

  async getCurrentLabInstance(userId: string, labId: string) {
    const now = new Date();
    await this.expireOwnedDueInstances(userId, labId);
    await this.getPublishedLabOrThrow(labId, userId, now);

    const instance = await this.findCurrentLiveInstance(userId, labId, now);

    return {
      instance: this.serializeLabInstance(this.filterCurrentLiveInstance(instance)),
    };
  }

  async startLab(userId: string, labId: string) {
    const now = new Date();
    await this.expireOwnedDueInstances(userId, labId);
    const lab = await this.getPublishedLabOrThrow(labId, userId, now);

    const existing = await this.findCurrentLiveInstance(userId, labId, now);
    if (existing) {
      return {
        lab: this.serializeLab(lab),
        instance: this.serializeLabInstance(existing),
        reusedExistingInstance: true,
      };
    }

    const startingInstance = await this.createStartingInstance(userId, lab);
    if (!startingInstance.created) {
      return {
        lab: this.serializeLab(lab),
        instance: this.serializeLabInstance(startingInstance.instance),
        reusedExistingInstance: true,
      };
    }

    let orchestratorResponse;

    try {
      orchestratorResponse = await this.orchestratorClient.spawn({
        userId,
        lab: this.buildLabPayload(lab),
        instance: this.buildInstancePayload(startingInstance.instance),
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'labs.start.orchestrator_failed',
          userId,
          labId,
          instanceId: startingInstance.instance.id,
        }),
      );

      await this.prisma.labInstance.update({
        where: { id: startingInstance.instance.id },
        data: {
          status: LabInstanceStatus.ERROR,
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        },
      });
      throw error;
    }

    const instance = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.labInstance.update({
        where: { id: startingInstance.instance.id },
        data: {
          containerId: orchestratorResponse?.containerId ?? null,
          networkId: orchestratorResponse?.networkId ?? null,
          status: orchestratorResponse?.status ?? LabInstanceStatus.ACTIVE,
          expiresAt: orchestratorResponse?.expiresAt
            ? new Date(orchestratorResponse.expiresAt)
            : startingInstance.instance.expiresAt,
          errorMessage: null,
        },
      });

      await this.activityService.log({
        userId,
        activityType: ActivityType.LAB_STARTED,
        entityType: EntityType.LAB,
        entityId: lab.id,
        metadata: {
          instanceId: startingInstance.instance.id,
        },
        runner: tx,
      });

      return updated;
    });

    return {
      lab: this.serializeLab(lab),
      instance: this.serializeLabInstance(instance),
      reusedExistingInstance: false,
    };
  }

  async resetLab(userId: string, labId: string) {
    const now = new Date();
    await this.expireOwnedDueInstances(userId, labId);
    const lab = await this.getPublishedLabOrThrow(labId, userId, now);
    const preparedInstance = await this.prepareInstanceForReset(userId, labId, lab.ttlMinutes);

    let orchestratorResponse;
    try {
      orchestratorResponse = await this.orchestratorClient.reset({
        userId,
        lab: this.buildLabPayload(lab),
        instance: this.buildInstancePayload(preparedInstance),
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'labs.reset.orchestrator_failed',
          userId,
          labId,
          instanceId: preparedInstance.id,
        }),
      );

      // If reset orchestration fails after the instance has already been moved
      // into reset preparation, we intentionally treat the instance as failed
      // and move it to ERROR rather than silently restoring the prior state.
      await this.prisma.labInstance.update({
        where: { id: preparedInstance.id },
        data: {
          status: LabInstanceStatus.ERROR,
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        },
      });
      throw error;
    }

    const updatedInstance = await this.finalizeResetInstance(
      userId,
      lab.id,
      preparedInstance,
      orchestratorResponse,
    );

    return {
      instance: this.serializeLabInstance(updatedInstance),
    };
  }

  async terminateLab(userId: string, labId: string) {
    await this.expireOwnedDueInstances(userId, labId);
    const instance = await this.prisma.labInstance.findFirst({
      where: {
        userId,
        labId,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!instance) {
      throw new NotFoundException('Lab instance not found');
    }

    if (instance.status === LabInstanceStatus.TERMINATED) {
      return {
        instance: this.serializeLabInstance(instance),
        alreadyTerminated: true,
      };
    }

    if (
      instance.status === LabInstanceStatus.STARTING ||
      instance.status === LabInstanceStatus.ACTIVE ||
      instance.status === LabInstanceStatus.ERROR
    ) {
      try {
        await this.orchestratorClient.terminate({
          userId,
          instance: {
            id: instance.id,
            labId: instance.labId,
            containerId: instance.containerId,
            networkId: instance.networkId,
            proxyToken: instance.proxyToken,
            status: instance.status,
          },
        });
      } catch (error) {
        if (!(error instanceof LabOrchestratorError) || !this.isIdempotentTerminateError(error)) {
          this.logger.error(
            JSON.stringify({
              event: 'labs.terminate.orchestrator_failed',
              userId,
              labId,
              instanceId: instance.id,
            }),
          );
          throw error;
        }

        this.logger.warn(
          JSON.stringify({
            event: 'labs.terminate.idempotent_error_tolerated',
            userId,
            labId,
            instanceId: instance.id,
            statusCode: error.statusCode,
          }),
        );
      }
    }

    const terminatedInstance = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.labInstance.update({
        where: { id: instance.id },
        data: {
          status: LabInstanceStatus.TERMINATED,
          terminatedAt: new Date(),
          errorMessage: null,
        },
      });

      await this.activityService.log({
        userId,
        activityType: ActivityType.LAB_TERMINATED,
        entityType: EntityType.LAB,
        entityId: instance.labId,
        metadata: {
          instanceId: instance.id,
        },
        runner: tx,
      });

      return updated;
    });

    return {
      instance: this.serializeLabInstance(terminatedInstance),
      alreadyTerminated: false,
    };
  }

  async validateProxyAccess(userId: string, proxyToken: string) {
    const instance = await this.prisma.labInstance.findUnique({
      where: {
        proxyToken,
      },
      include: {
        lab: true,
      },
    });

    if (!instance) {
      return this.buildProxyAccessDecision('not_found');
    }

    if (instance.userId !== userId) {
      return this.buildProxyAccessDecision('forbidden');
    }

    if (instance.lab.status !== LabStatus.PUBLISHED || !instance.lab.publishedAt) {
      return this.buildProxyAccessDecision(
        'lab_unavailable',
        this.serializeLabAccessInstance(instance),
      );
    }

    if (instance.expiresAt <= new Date()) {
      await this.expireOwnedDueInstances(userId, instance.labId);
      return this.buildProxyAccessDecision(
        'expired',
        this.serializeLabAccessInstance({
          ...instance,
          status: LabInstanceStatus.EXPIRED,
        }),
      );
    }

    if (instance.status !== LabInstanceStatus.ACTIVE) {
      return this.buildProxyAccessDecision(
        'inactive',
        this.serializeLabAccessInstance(instance),
      );
    }

    return this.buildProxyAccessDecision(
      'allowed',
      this.serializeLabAccessInstance(instance),
    );
  }

  private async getPublishedLabOrThrow(labId: string, userId: string, now: Date) {
    const lab = await this.prisma.lab.findFirst({
      where: {
        id: labId,
        status: LabStatus.PUBLISHED,
        publishedAt: {
          not: null,
        },
      },
      include: {
        instances: this.buildCurrentLiveInstanceRelation(userId, now),
      },
    });

    if (!lab) {
      throw new NotFoundException('Lab not found');
    }

    return lab;
  }

  private async expireOwnedDueInstances(userId: string, labId: string) {
    await this.prisma.labInstance.updateMany({
      where: {
        ...this.buildLiveInstanceStatusWhere(userId, labId),
        expiresAt: {
          lte: new Date(),
        },
      },
      data: {
        status: LabInstanceStatus.EXPIRED,
      },
    });
  }

  private async findCurrentLiveInstance(userId: string, labId: string, now: Date) {
    return this.prisma.labInstance.findFirst({
      where: this.buildCurrentLiveInstanceWhere(userId, now, labId),
      orderBy: {
        startedAt: 'desc',
      },
    });
  }

  private async createStartingInstance(
    userId: string,
    lab: { id: string; ttlMinutes: number },
  ): Promise<CreateStartingInstanceResult> {
    for (let attempt = 0; attempt < MAX_PROXY_TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        return {
          instance: await this.prisma.labInstance.create({
            data: {
              userId,
              labId: lab.id,
              proxyToken: this.generateProxyToken(),
              status: LabInstanceStatus.STARTING,
              expiresAt: this.calculateExpiry(lab.ttlMinutes),
            },
          }),
          created: true,
        };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          if (this.isProxyTokenConflict(error)) {
            this.logger.warn(
              JSON.stringify({
                event: 'labs.proxy_token_collision_retry',
                scope: 'create',
                userId,
                labId: lab.id,
                attempt: attempt + 1,
              }),
            );

            if (attempt < MAX_PROXY_TOKEN_GENERATION_ATTEMPTS - 1) {
              continue;
            }
          }

          if (this.isLiveInstanceConstraintConflict(error)) {
            const existing = await this.findCurrentLiveInstance(userId, lab.id, new Date());

            if (existing) {
              this.logger.warn(
                JSON.stringify({
                  event: 'labs.start.concurrent_live_instance_reused',
                  userId,
                  labId: lab.id,
                  instanceId: existing.id,
                }),
              );

              return {
                instance: existing,
                created: false,
              };
            }
          }
        }

        throw error;
      }
    }

    throw new InternalServerErrorException('Unable to create lab instance');
  }

  private async prepareInstanceForReset(userId: string, labId: string, ttlMinutes: number) {
    return this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<LockedResetCandidateRow[]>`
        SELECT li.id, li.status
        FROM lab_instances AS li
        WHERE li.user_id = ${userId}::uuid
          AND li.lab_id = ${labId}::uuid
          AND li.status IN ('STARTING', 'ACTIVE')
          AND li.expires_at > NOW()
        ORDER BY li.started_at DESC
        LIMIT 1
        FOR UPDATE
      `;

      const lockedInstance = lockedRows[0];
      if (!lockedInstance) {
        throw new NotFoundException('Active lab instance not found');
      }

      if (lockedInstance.status === LabInstanceStatus.STARTING) {
        throw new ConflictException('Lab instance is not ready for reset');
      }

      return tx.labInstance.update({
        where: { id: lockedInstance.id },
        data: {
          status: LabInstanceStatus.STARTING,
          expiresAt: this.calculateExpiry(ttlMinutes),
          errorMessage: null,
        },
      });
    });
  }

  private async finalizeResetInstance(
    userId: string,
    labId: string,
    preparedInstance: {
      id: string;
      containerId: string | null;
      networkId: string | null;
      expiresAt: Date;
    },
    orchestratorResponse: OrchestratorInstanceResponse,
  ) {
    for (let attempt = 0; attempt < MAX_PROXY_TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const lockedRows = await tx.$queryRaw<LockedFinalizeCandidateRow[]>`
            SELECT li.id, li.status
            FROM lab_instances AS li
            WHERE li.id = ${preparedInstance.id}::uuid
            LIMIT 1
            FOR UPDATE
          `;

          const lockedInstance = lockedRows[0];
          if (!lockedInstance) {
            throw new NotFoundException('Lab instance not found');
          }

          if (lockedInstance.status !== LabInstanceStatus.STARTING) {
            this.logger.warn(
              JSON.stringify({
                event: 'labs.reset.finalize_rejected_state_drift',
                userId,
                labId,
                instanceId: preparedInstance.id,
                currentStatus: lockedInstance.status,
              }),
            );
            throw new ConflictException('Lab reset could not be finalized');
          }

          const updated = await tx.labInstance.update({
            where: { id: preparedInstance.id },
            data: {
              proxyToken: this.generateProxyToken(),
              containerId: orchestratorResponse?.containerId ?? preparedInstance.containerId,
              networkId: orchestratorResponse?.networkId ?? preparedInstance.networkId,
              status: orchestratorResponse?.status ?? LabInstanceStatus.ACTIVE,
              expiresAt: orchestratorResponse?.expiresAt
                ? new Date(orchestratorResponse.expiresAt)
                : preparedInstance.expiresAt,
              resetCount: {
                increment: 1,
              },
              errorMessage: null,
            },
          });

          await this.activityService.log({
            userId,
            activityType: ActivityType.LAB_RESET,
            entityType: EntityType.LAB,
            entityId: labId,
            metadata: {
              instanceId: updated.id,
            },
            runner: tx,
          });

          return updated;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          this.isProxyTokenConflict(error)
        ) {
          this.logger.warn(
            JSON.stringify({
              event: 'labs.proxy_token_collision_retry',
              scope: 'reset_finalize',
              userId,
              labId,
              attempt: attempt + 1,
            }),
          );

          if (attempt < MAX_PROXY_TOKEN_GENERATION_ATTEMPTS - 1) {
            continue;
          }
        }

        throw error;
      }
    }

    throw new InternalServerErrorException('Unable to finalize lab reset');
  }

  private buildCurrentLiveInstanceRelation(userId: string, now: Date) {
    return {
      where: this.buildCurrentLiveInstanceWhere(userId, now),
      orderBy: {
        startedAt: 'desc' as const,
      },
      take: 1,
    };
  }

  private buildCurrentLiveInstanceWhere(userId: string, now: Date, labId?: string) {
    return {
      userId,
      ...(labId ? { labId } : {}),
      status: {
        in: LIVE_LAB_INSTANCE_STATUSES,
      },
      expiresAt: {
        gt: now,
      },
    } satisfies Prisma.LabInstanceWhereInput;
  }

  private buildLiveInstanceStatusWhere(userId: string, labId: string) {
    return {
      userId,
      labId,
      status: {
        in: LIVE_LAB_INSTANCE_STATUSES,
      },
    } satisfies Prisma.LabInstanceWhereInput;
  }

  private calculateExpiry(ttlMinutes: number) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);
    return expiresAt;
  }

  private generateProxyToken() {
    return randomBytes(24).toString('base64url');
  }

  private filterCurrentLiveInstance<
    T extends { status: LabInstanceStatus; expiresAt: Date } | undefined | null,
  >(
    instance: T,
  ): T | null {
    if (!instance) {
      return null;
    }

    if (!LIVE_LAB_INSTANCE_STATUSES.includes(instance.status)) {
      return null;
    }

    if (instance.expiresAt <= new Date()) {
      return null;
    }

    return instance;
  }

  private buildLabPayload(lab: {
    id: string;
    title: string;
    category: string;
    difficulty: string;
    type: string;
    imageReference: string | null;
    templateReference: string | null;
    ttlMinutes: number;
  }) {
    return {
      id: lab.id,
      title: lab.title,
      category: lab.category,
      difficulty: lab.difficulty,
      type: lab.type,
      imageReference: lab.imageReference,
      templateReference: lab.templateReference,
      ttlMinutes: lab.ttlMinutes,
    };
  }

  private buildInstancePayload(instance: {
    id: string;
    labId: string;
    proxyToken: string;
    status: LabInstanceStatus;
    startedAt: Date;
    expiresAt: Date;
    containerId: string | null;
    networkId: string | null;
    resetCount: number;
  }) {
    return {
      id: instance.id,
      labId: instance.labId,
      proxyToken: instance.proxyToken,
      status: instance.status,
      startedAt: instance.startedAt,
      expiresAt: instance.expiresAt,
      containerId: instance.containerId,
      networkId: instance.networkId,
      resetCount: instance.resetCount,
    };
  }

  private serializeLab(lab: {
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
    type: string;
    ttlMinutes: number;
    publishedAt: Date | null;
  }) {
    return {
      id: lab.id,
      title: lab.title,
      description: lab.description,
      category: lab.category,
      difficulty: lab.difficulty,
      type: lab.type,
      ttlMinutes: lab.ttlMinutes,
      publishedAt: lab.publishedAt,
    };
  }

  private serializeLabInstance(
    instance:
      | {
          id: string;
          labId: string;
          proxyToken: string;
          status: LabInstanceStatus;
          startedAt: Date;
          expiresAt: Date;
          terminatedAt: Date | null;
          resetCount: number;
        }
      | null
      | undefined,
  ) {
    if (!instance) {
      return null;
    }

    return {
      id: instance.id,
      labId: instance.labId,
      status: instance.status,
      startedAt: instance.startedAt,
      expiresAt: instance.expiresAt,
      terminatedAt: instance.terminatedAt,
      resetCount: instance.resetCount,
      accessUrl:
        instance.status === LabInstanceStatus.ACTIVE
          ? `${this.configService.labProxyBaseUrl.replace(/\/$/, '')}/${instance.proxyToken}`
          : null,
    };
  }

  private serializeLabAccessInstance(instance: {
    id: string;
    labId: string;
    status: LabInstanceStatus;
    expiresAt: Date;
  }): LabProxyAccessInstanceView {
    return {
      id: instance.id,
      labId: instance.labId,
      status: instance.status,
      expiresAt: instance.expiresAt,
    };
  }

  private buildProxyAccessDecision(
    reason: LabProxyAccessReason,
    instance: LabProxyAccessInstanceView | null = null,
  ) {
    const allowed = reason === 'allowed';

    return {
      access: {
        allowed,
        reason,
        validatedAt: new Date().toISOString(),
        checks: {
          tokenExists: reason !== 'not_found',
          ownedByAuthenticatedStudent: !['not_found', 'forbidden'].includes(reason),
          labPublished: !['not_found', 'forbidden', 'lab_unavailable'].includes(reason),
          instanceActive: allowed,
          notExpired: !['not_found', 'forbidden', 'lab_unavailable', 'expired'].includes(reason),
          proxyEligible: allowed,
        },
        instance,
      },
    };
  }

  private isIdempotentTerminateError(error: LabOrchestratorError) {
    return error.statusCode === 404 || error.statusCode === 409;
  }

  private isLiveInstanceConstraintConflict(error: Prisma.PrismaClientKnownRequestError) {
    const tokens = this.getConstraintTokens(error);

    return (
      tokens.some((token) => token.includes('idx_lab_instances_user_lab_live_unique')) ||
      (tokens.some((token) => token.includes('user_id') || token.includes('userid')) &&
        tokens.some((token) => token.includes('lab_id') || token.includes('labid')))
    );
  }

  private isProxyTokenConflict(error: Prisma.PrismaClientKnownRequestError) {
    return this.getConstraintTokens(error).some(
      (token) => token.includes('proxy_token') || token.includes('proxytoken'),
    );
  }

  private getConstraintTokens(error: Prisma.PrismaClientKnownRequestError) {
    const targets: string[] = [];
    const metaTarget = error.meta?.target;

    if (Array.isArray(metaTarget)) {
      targets.push(...metaTarget.map((target) => String(target)));
    } else if (typeof metaTarget === 'string') {
      targets.push(metaTarget);
    }

    targets.push(error.message);

    return targets.map((target) => target.toLowerCase());
  }
}
