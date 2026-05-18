import crypto from 'crypto';
import { env } from '../../config/env.js';
import { db } from '../../config/db.js';
import { Roles } from '../../shared/constants/roles.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ActivityTypes, EntityTypes, activityService } from '../activity/activity.service.js';
import {
  LabDifficulties,
  LabInstanceStatuses,
  LabStatuses,
  LiveLabInstanceStatuses
} from './lab.constants.js';
import { labsOrchestratorClient } from './labs.orchestrator.client.js';
import { labsRepository } from './labs.repository.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;
const MAX_ORCHESTRATOR_ERROR_LENGTH = 500;
const MAX_PROXY_TOKEN_LENGTH = 255;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, fieldName) => {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError(`Valid ${fieldName} is required`, 400);
  }
};

const assertStudentUser = (user) => {
  if (!user || user.role !== Roles.STUDENT) {
    throw new AppError('Student account required', 403);
  }
};

const parsePositiveInteger = (value, fallback, fieldName) => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(`${fieldName} must be a positive integer`, 400);
  }

  return parsed;
};

const normalizeSearch = (value) => (
  typeof value === 'string' ? value.trim().slice(0, MAX_SEARCH_LENGTH) : ''
);

const normalizeCategory = (value) => (
  typeof value === 'string' ? value.trim().slice(0, MAX_CATEGORY_LENGTH) : ''
);

const normalizeDifficulty = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalizedDifficulty = String(value).trim().toLowerCase();
  if (!Object.values(LabDifficulties).includes(normalizedDifficulty)) {
    throw new AppError('Invalid lab difficulty filter', 400);
  }

  return normalizedDifficulty;
};

const normalizeProxyToken = (value) => {
  if (typeof value !== 'string') {
    throw new AppError('Proxy token is required', 400);
  }

  const normalizedToken = value.trim();
  if (!normalizedToken) {
    throw new AppError('Proxy token is required', 400);
  }

  if (normalizedToken.length > MAX_PROXY_TOKEN_LENGTH) {
    throw new AppError('Proxy token is invalid', 400);
  }

  return normalizedToken;
};

const buildPagination = ({ page, pageSize, total }) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
});

const generateProxyToken = () => crypto.randomBytes(24).toString('base64url');

const buildLabAccessUrl = (proxyToken) => {
  if (!proxyToken) {
    return null;
  }

  const baseUrl = env.labProxyBaseUrl.endsWith('/')
    ? env.labProxyBaseUrl.slice(0, -1)
    : env.labProxyBaseUrl;

  return `${baseUrl}/${proxyToken}`;
};

const calculateExpiresAt = (ttlMinutes) => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);
  return expiresAt;
};

const resolveReturnedExpiry = (returnedExpiresAt, fallbackExpiresAt) => {
  if (!returnedExpiresAt) {
    return fallbackExpiresAt;
  }

  const parsed = new Date(returnedExpiresAt);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackExpiresAt;
  }

  return parsed;
};

const resolveLiveStatus = (returnedStatus, fallbackStatus = LabInstanceStatuses.ACTIVE) => {
  if (
    returnedStatus === LabInstanceStatuses.STARTING ||
    returnedStatus === LabInstanceStatuses.ACTIVE
  ) {
    return returnedStatus;
  }

  return fallbackStatus;
};

const extractOrchestratorErrorMessage = (error) => {
  if (!error) {
    return 'Unknown orchestrator error';
  }

  const candidate = typeof error.message === 'string' && error.message
    ? error.message
    : 'Unknown orchestrator error';

  return candidate.slice(0, MAX_ORCHESTRATOR_ERROR_LENGTH);
};

const isIdempotentTerminateResponse = (error) => {
  const statusCode = error?.details?.statusCode;
  return statusCode === 404 || statusCode === 409;
};

const createTerminationRetryableError = (error) => new AppError(
  'Lab termination could not be confirmed. Instance state was left unchanged so termination can be retried safely.',
  502,
  {
    reason: extractOrchestratorErrorMessage(error),
    retryable: true
  }
);

const sanitizeLabInstance = (instance) => {
  if (!instance) {
    return null;
  }

  return {
    id: instance.id,
    labId: instance.lab_id,
    status: instance.status,
    startedAt: instance.started_at,
    expiresAt: instance.expires_at,
    terminatedAt: instance.terminated_at,
    resetCount: instance.reset_count,
    accessUrl: LiveLabInstanceStatuses.includes(instance.status)
      ? buildLabAccessUrl(instance.proxy_token)
      : null
  };
};

const sanitizeEmbeddedLabInstance = (lab) => {
  if (!lab.active_instance_id) {
    return null;
  }

  return sanitizeLabInstance({
    id: lab.active_instance_id,
    lab_id: lab.id,
    proxy_token: lab.active_instance_proxy_token,
    status: lab.active_instance_status,
    started_at: lab.active_instance_started_at,
    expires_at: lab.active_instance_expires_at,
    terminated_at: lab.active_instance_terminated_at,
    reset_count: lab.active_instance_reset_count
  });
};

const sanitizeLabSummary = (lab) => ({
  id: lab.id,
  title: lab.title,
  description: lab.description,
  category: lab.category,
  difficulty: lab.difficulty,
  type: lab.type,
  ttlMinutes: lab.ttl_minutes,
  publishedAt: lab.published_at,
  currentInstance: sanitizeEmbeddedLabInstance(lab)
});

const sanitizeLabDetails = (lab) => ({
  id: lab.id,
  title: lab.title,
  description: lab.description,
  category: lab.category,
  difficulty: lab.difficulty,
  type: lab.type,
  ttlMinutes: lab.ttl_minutes,
  publishedAt: lab.published_at,
  createdAt: lab.created_at,
  updatedAt: lab.updated_at,
  currentInstance: sanitizeEmbeddedLabInstance(lab)
});

const sanitizeLabAccessValidation = ({ allowed, reason, instance = null }) => ({
  allowed,
  reason,
  instance: instance
    ? {
        id: instance.id,
        labId: instance.lab_id,
        status: instance.status,
        expiresAt: instance.expires_at
      }
    : null
});

const getPublishedLabForStudent = async ({ userId, labId }, runner = db) => {
  const lab = await labsRepository.findPublishedLabByIdForStudent({ userId, labId }, runner);
  if (!lab) {
    throw new AppError('Lab not found', 404);
  }

  return lab;
};

const expireOwnedLiveInstanceIfNeeded = async ({ userId, labId }, runner = db) => {
  await labsRepository.expireOwnedDueInstancesByLab({ userId, labId }, runner);
};

const buildOrchestratorPayload = ({ userId, lab, instance }) => ({
  userId,
  lab: {
    id: lab.id,
    title: lab.title,
    category: lab.category,
    difficulty: lab.difficulty,
    type: lab.type,
    imageReference: lab.image_reference,
    templateReference: lab.template_reference,
    ttlMinutes: lab.ttl_minutes
  },
  instance: {
    id: instance.id,
    labId: instance.lab_id,
    proxyToken: instance.proxy_token,
    status: instance.status,
    startedAt: instance.started_at,
    expiresAt: instance.expires_at,
    containerId: instance.container_id,
    networkId: instance.network_id,
    resetCount: instance.reset_count
  }
});

const finalizeLabActivity = async ({ action, userId, labId, instanceId, runner }) => {
  await activityService.logActivity({
    userId,
    activityType: action,
    entityType: EntityTypes.LAB,
    entityId: labId,
    metadata: {
      instanceId
    },
    runner
  });
};

const createStartingInstance = async ({ userId, labId, ttlMinutes }) => {
  let attemptsRemaining = 2;

  while (attemptsRemaining >= 0) {
    const proxyToken = generateProxyToken();
    const expiresAt = calculateExpiresAt(ttlMinutes);

    try {
      const instance = await labsRepository.createLabInstance({
        userId,
        labId,
        proxyToken,
        status: LabInstanceStatuses.STARTING,
        expiresAt
      });

      return {
        instance,
        reusedExistingInstance: false
      };
    } catch (error) {
      if (error?.code !== '23505') {
        throw error;
      }

      const existingLiveInstance = await labsRepository.findOwnedLiveInstanceByLab({
        userId,
        labId
      });

      if (existingLiveInstance) {
        return {
          instance: existingLiveInstance,
          reusedExistingInstance: true
        };
      }

      attemptsRemaining -= 1;
      if (attemptsRemaining < 0) {
        throw new AppError('Lab instance could not be created', 409);
      }
    }
  }

  throw new AppError('Lab instance could not be created', 409);
};

export const labsService = {
  listPublishedLabs: async ({ user, page, pageSize, search, category, difficulty }) => {
    assertStudentUser(user);

    const currentPage = parsePositiveInteger(page, DEFAULT_PAGE, 'page');
    const currentPageSize = parsePositiveInteger(pageSize, DEFAULT_PAGE_SIZE, 'pageSize');
    if (currentPageSize > MAX_PAGE_SIZE) {
      throw new AppError(`pageSize must be ${MAX_PAGE_SIZE} or fewer`, 400);
    }

    const { labs, total } = await labsRepository.listPublishedLabsForStudent({
      userId: user.id,
      search: normalizeSearch(search),
      category: normalizeCategory(category),
      difficulty: normalizeDifficulty(difficulty),
      limit: currentPageSize,
      offset: (currentPage - 1) * currentPageSize
    });

    return {
      labs: labs.map(sanitizeLabSummary),
      pagination: buildPagination({
        page: currentPage,
        pageSize: currentPageSize,
        total
      })
    };
  },

  getLabDetails: async ({ user, labId }) => {
    assertStudentUser(user);
    assertUuid(labId, 'lab id');

    await expireOwnedLiveInstanceIfNeeded({ userId: user.id, labId });
    const lab = await getPublishedLabForStudent({ userId: user.id, labId });

    return {
      lab: sanitizeLabDetails(lab)
    };
  },

  getCurrentLabInstance: async ({ user, labId }) => {
    assertStudentUser(user);
    assertUuid(labId, 'lab id');

    await expireOwnedLiveInstanceIfNeeded({ userId: user.id, labId });
    await getPublishedLabForStudent({ userId: user.id, labId });

    const instance = await labsRepository.findOwnedLiveInstanceByLab({
      userId: user.id,
      labId
    });

    return {
      instance: sanitizeLabInstance(instance)
    };
  },

  validateLabAccess: async ({ user, proxyToken }) => {
    assertStudentUser(user);

    const normalizedProxyToken = normalizeProxyToken(proxyToken);
    const instance = await labsRepository.findLabInstanceByProxyToken({
      proxyToken: normalizedProxyToken
    });

    if (!instance) {
      return {
        access: sanitizeLabAccessValidation({
          allowed: false,
          reason: 'not_found'
        })
      };
    }

    if (instance.user_id !== user.id) {
      return {
        access: sanitizeLabAccessValidation({
          allowed: false,
          reason: 'forbidden'
        })
      };
    }

    if (instance.lab_status !== LabStatuses.PUBLISHED) {
      return {
        access: sanitizeLabAccessValidation({
          allowed: false,
          reason: 'lab_unavailable',
          instance
        })
      };
    }

    if (instance.expires_at <= new Date()) {
      await labsRepository.expireOwnedDueInstancesByLab({
        userId: user.id,
        labId: instance.lab_id
      });

      return {
        access: sanitizeLabAccessValidation({
          allowed: false,
          reason: 'expired',
          instance: {
            ...instance,
            status: LabInstanceStatuses.EXPIRED
          }
        })
      };
    }

    if (!LiveLabInstanceStatuses.includes(instance.status)) {
      return {
        access: sanitizeLabAccessValidation({
          allowed: false,
          reason: 'inactive',
          instance
        })
      };
    }

    return {
      access: sanitizeLabAccessValidation({
        allowed: true,
        reason: 'allowed',
        instance
      })
    };
  },

  startLab: async ({ user, labId }) => {
    assertStudentUser(user);
    assertUuid(labId, 'lab id');

    await expireOwnedLiveInstanceIfNeeded({ userId: user.id, labId });
    const lab = await getPublishedLabForStudent({ userId: user.id, labId });

    const existingLiveInstance = await labsRepository.findOwnedLiveInstanceByLab({
      userId: user.id,
      labId
    });

    if (existingLiveInstance) {
      return {
        lab: sanitizeLabDetails(lab),
        instance: sanitizeLabInstance(existingLiveInstance),
        reusedExistingInstance: true
      };
    }

    const { instance: createdInstance, reusedExistingInstance } = await createStartingInstance({
      userId: user.id,
      labId,
      ttlMinutes: lab.ttl_minutes
    });

    if (reusedExistingInstance) {
      return {
        lab: sanitizeLabDetails(lab),
        instance: sanitizeLabInstance(createdInstance),
        reusedExistingInstance: true
      };
    }

    let orchestratorResponse;

    try {
      orchestratorResponse = await labsOrchestratorClient.spawn(
        buildOrchestratorPayload({
          userId: user.id,
          lab,
          instance: createdInstance
        })
      );
    } catch (error) {
      await labsRepository.markLabInstanceError({
        instanceId: createdInstance.id,
        errorMessage: extractOrchestratorErrorMessage(error)
      });

      throw error;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const activatedInstance = await labsRepository.updateLabInstanceAfterSpawn(
        {
          instanceId: createdInstance.id,
          containerId: orchestratorResponse?.containerId ?? null,
          networkId: orchestratorResponse?.networkId ?? null,
          status: resolveLiveStatus(orchestratorResponse?.status),
          expiresAt: resolveReturnedExpiry(orchestratorResponse?.expiresAt, createdInstance.expires_at)
        },
        client
      );

      await finalizeLabActivity({
        action: ActivityTypes.LAB_STARTED,
        userId: user.id,
        labId,
        instanceId: createdInstance.id,
        runner: client
      });

      await client.query('COMMIT');

      return {
        lab: sanitizeLabDetails(lab),
        instance: sanitizeLabInstance(activatedInstance),
        reusedExistingInstance: false
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  resetLab: async ({ user, labId }) => {
    assertStudentUser(user);
    assertUuid(labId, 'lab id');

    await expireOwnedLiveInstanceIfNeeded({ userId: user.id, labId });
    const lab = await getPublishedLabForStudent({ userId: user.id, labId });

    // MVP reset policy: no hard cap is enforced yet.
    // We require an owned live instance and persist reset_count so future abuse controls
    // or per-lab reset limits can be added without changing the contract shape.
    const preparationClient = await db.connect();
    let previousInstance = null;
    let preparedInstance = null;

    try {
      await preparationClient.query('BEGIN');
      previousInstance = await labsRepository.findOwnedLiveInstanceByLabForUpdate(
        {
          userId: user.id,
          labId
        },
        preparationClient
      );

      if (!previousInstance) {
        throw new AppError('Active lab instance not found', 404);
      }

      preparedInstance = await labsRepository.prepareLabInstanceForReset(
        {
          instanceId: previousInstance.id,
          proxyToken: generateProxyToken(),
          expiresAt: calculateExpiresAt(lab.ttl_minutes)
        },
        preparationClient
      );

      await preparationClient.query('COMMIT');
    } catch (error) {
      await preparationClient.query('ROLLBACK');
      throw error;
    } finally {
      preparationClient.release();
    }

    let orchestratorResponse;

    try {
      orchestratorResponse = await labsOrchestratorClient.reset(
        buildOrchestratorPayload({
          userId: user.id,
          lab,
          instance: preparedInstance
        })
      );
    } catch (error) {
      await labsRepository.markLabInstanceError({
        instanceId: preparedInstance.id,
        errorMessage: extractOrchestratorErrorMessage(error)
      });

      throw error;
    }

    const completionClient = await db.connect();
    try {
      await completionClient.query('BEGIN');
      const updatedInstance = await labsRepository.completeLabReset(
        {
          instanceId: preparedInstance.id,
          containerId:
            orchestratorResponse?.containerId ??
            previousInstance.container_id ??
            null,
          networkId:
            orchestratorResponse?.networkId ??
            previousInstance.network_id ??
            null,
          status: resolveLiveStatus(orchestratorResponse?.status),
          expiresAt: resolveReturnedExpiry(
            orchestratorResponse?.expiresAt,
            preparedInstance.expires_at
          )
        },
        completionClient
      );

      await finalizeLabActivity({
        action: ActivityTypes.LAB_RESET,
        userId: user.id,
        labId,
        instanceId: preparedInstance.id,
        runner: completionClient
      });

      await completionClient.query('COMMIT');

      return {
        instance: sanitizeLabInstance(updatedInstance)
      };
    } catch (error) {
      await completionClient.query('ROLLBACK');
      throw error;
    } finally {
      completionClient.release();
    }
  },

  terminateLab: async ({ user, labId }) => {
    assertStudentUser(user);
    assertUuid(labId, 'lab id');

    await expireOwnedLiveInstanceIfNeeded({ userId: user.id, labId });

    const targetClient = await db.connect();
    let manageableInstance = null;
    let latestInstance = null;

    try {
      await targetClient.query('BEGIN');
      manageableInstance = await labsRepository.findOwnedTerminableInstanceByLabForUpdate(
        {
          userId: user.id,
          labId
        },
        targetClient
      );

      if (!manageableInstance) {
        latestInstance = await labsRepository.findOwnedLatestInstanceByLab(
          {
            userId: user.id,
            labId
          },
          targetClient
        );
      }

      await targetClient.query('COMMIT');
    } catch (error) {
      await targetClient.query('ROLLBACK');
      throw error;
    } finally {
      targetClient.release();
    }

    if (!manageableInstance) {
      if (!latestInstance) {
        throw new AppError('Lab instance not found', 404);
      }

      if (latestInstance.status === LabInstanceStatuses.TERMINATED) {
        return {
          instance: sanitizeLabInstance(latestInstance),
          alreadyTerminated: true
        };
      }

      manageableInstance = latestInstance;
    }

    if (
      manageableInstance.container_id ||
      manageableInstance.network_id ||
      manageableInstance.proxy_token
    ) {
      try {
        await labsOrchestratorClient.terminate({
          userId: user.id,
          instance: {
            id: manageableInstance.id,
            labId: manageableInstance.lab_id,
            containerId: manageableInstance.container_id,
            networkId: manageableInstance.network_id,
            proxyToken: manageableInstance.proxy_token,
            status: manageableInstance.status
          }
        });
      } catch (error) {
        // Termination is intentionally two-phase: we only mark the instance terminated locally
        // after the orchestrator confirms success, or after it reports the target is already gone.
        // That keeps cleanup retries idempotent and avoids claiming termination in the backend
        // when the external lifecycle could not be confirmed.
        if (!isIdempotentTerminateResponse(error)) {
          throw createTerminationRetryableError(error);
        }
      }
    }

    const terminationClient = await db.connect();
    try {
      await terminationClient.query('BEGIN');
      const terminatedInstance = await labsRepository.terminateLabInstance(
        {
          instanceId: manageableInstance.id
        },
        terminationClient
      );

      await finalizeLabActivity({
        action: ActivityTypes.LAB_TERMINATED,
        userId: user.id,
        labId,
        instanceId: manageableInstance.id,
        runner: terminationClient
      });

      await terminationClient.query('COMMIT');

      return {
        instance: sanitizeLabInstance(terminatedInstance),
        alreadyTerminated: false
      };
    } catch (error) {
      await terminationClient.query('ROLLBACK');
      throw error;
    } finally {
      terminationClient.release();
    }
  }
};
