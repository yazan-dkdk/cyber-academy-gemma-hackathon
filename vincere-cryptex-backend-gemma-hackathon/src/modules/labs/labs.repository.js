import { db } from '../../config/db.js';
import {
  LabInstanceStatuses,
  LabStatuses,
  LiveLabInstanceStatuses,
  TerminableLabInstanceStatuses
} from './lab.constants.js';

const LAB_PUBLIC_SELECT = `
  l.id,
  l.title,
  l.description,
  l.category,
  l.difficulty,
  l.status,
  l.type,
  l.image_reference,
  l.template_reference,
  l.ttl_minutes,
  l.published_at,
  l.created_at,
  l.updated_at
`;

const LAB_INSTANCE_INTERNAL_SELECT = `
  li.id,
  li.user_id,
  li.lab_id,
  li.container_id,
  li.network_id,
  li.proxy_token,
  li.status,
  li.started_at,
  li.expires_at,
  li.terminated_at,
  li.reset_count,
  li.error_message,
  li.created_at,
  li.updated_at
`;

const buildLabFilters = ({ search, category, difficulty }) => {
  const values = [LabStatuses.PUBLISHED];
  const conditions = ['l.status = $1'];

  if (search) {
    values.push(search);
    const param = `$${values.length}`;
    conditions.push(
      `(LOWER(l.title) LIKE '%' || LOWER(${param}) || '%' OR LOWER(l.description) LIKE '%' || LOWER(${param}) || '%' OR LOWER(l.category) LIKE '%' || LOWER(${param}) || '%')`
    );
  }

  if (category) {
    values.push(category);
    conditions.push(`LOWER(l.category) = LOWER($${values.length})`);
  }

  if (difficulty) {
    values.push(difficulty);
    conditions.push(`l.difficulty = $${values.length}`);
  }

  return {
    values,
    whereClause: `WHERE ${conditions.join(' AND ')}`
  };
};

export const labsRepository = {
  listPublishedLabsForStudent: async (
    { userId, search, category, difficulty, limit, offset },
    runner = db
  ) => {
    const { values, whereClause } = buildLabFilters({ search, category, difficulty });
    const rowValues = [
      ...values,
      userId,
      LiveLabInstanceStatuses[0],
      LiveLabInstanceStatuses[1],
      limit,
      offset
    ];

    const [rowsResult, countResult] = await Promise.all([
      runner.query(
        `SELECT
           ${LAB_PUBLIC_SELECT},
           live_instance.id AS active_instance_id,
           live_instance.proxy_token AS active_instance_proxy_token,
           live_instance.status AS active_instance_status,
           live_instance.started_at AS active_instance_started_at,
           live_instance.expires_at AS active_instance_expires_at,
           live_instance.terminated_at AS active_instance_terminated_at,
           live_instance.reset_count AS active_instance_reset_count
         FROM labs l
         LEFT JOIN LATERAL (
           SELECT
             li.id,
             li.proxy_token,
             li.status,
             li.started_at,
             li.expires_at,
             li.terminated_at,
             li.reset_count
           FROM lab_instances li
           WHERE li.user_id = $${values.length + 1}
             AND li.lab_id = l.id
             AND li.status IN ($${values.length + 2}, $${values.length + 3})
             AND li.expires_at > NOW()
           ORDER BY li.started_at DESC, li.created_at DESC
           LIMIT 1
         ) AS live_instance ON TRUE
         ${whereClause}
         ORDER BY l.published_at DESC NULLS LAST, l.created_at DESC
         LIMIT $${values.length + 4}
         OFFSET $${values.length + 5}`,
        rowValues
      ),
      runner.query(
        `SELECT COUNT(*)::INT AS total
         FROM labs l
         ${whereClause}`,
        values
      )
    ]);

    return {
      labs: rowsResult.rows,
      total: countResult.rows[0]?.total ?? 0
    };
  },

  findPublishedLabByIdForStudent: async ({ userId, labId }, runner = db) => {
    const result = await runner.query(
      `SELECT
         ${LAB_PUBLIC_SELECT},
         live_instance.id AS active_instance_id,
         live_instance.proxy_token AS active_instance_proxy_token,
         live_instance.status AS active_instance_status,
         live_instance.started_at AS active_instance_started_at,
         live_instance.expires_at AS active_instance_expires_at,
         live_instance.terminated_at AS active_instance_terminated_at,
         live_instance.reset_count AS active_instance_reset_count
       FROM labs l
       LEFT JOIN LATERAL (
         SELECT
           li.id,
           li.proxy_token,
           li.status,
           li.started_at,
           li.expires_at,
           li.terminated_at,
           li.reset_count
         FROM lab_instances li
         WHERE li.user_id = $2
           AND li.lab_id = l.id
           AND li.status IN ($4, $5)
           AND li.expires_at > NOW()
         ORDER BY li.started_at DESC, li.created_at DESC
         LIMIT 1
       ) AS live_instance ON TRUE
       WHERE l.id = $1
         AND l.status = $3
       LIMIT 1`,
      [
        labId,
        userId,
        LabStatuses.PUBLISHED,
        LiveLabInstanceStatuses[0],
        LiveLabInstanceStatuses[1]
      ]
    );

    return result.rows[0] ?? null;
  },

  findLabInstanceByProxyToken: async ({ proxyToken }, runner = db) => {
    const result = await runner.query(
      `SELECT
         ${LAB_INSTANCE_INTERNAL_SELECT},
         l.status AS lab_status
       FROM lab_instances li
       INNER JOIN labs l
         ON l.id = li.lab_id
       WHERE li.proxy_token = $1
       LIMIT 1`,
      [proxyToken]
    );

    return result.rows[0] ?? null;
  },

  expireOwnedDueInstancesByLab: async ({ userId, labId }, runner = db) => {
    const result = await runner.query(
      `UPDATE lab_instances li
       SET status = $3,
           updated_at = NOW()
       WHERE li.user_id = $1
         AND li.lab_id = $2
         AND li.status IN ($4, $5)
         AND li.expires_at <= NOW()
       RETURNING ${LAB_INSTANCE_INTERNAL_SELECT}`,
      [
        userId,
        labId,
        LabInstanceStatuses.EXPIRED,
        LiveLabInstanceStatuses[0],
        LiveLabInstanceStatuses[1]
      ]
    );

    return result.rows;
  },

  findOwnedLiveInstanceByLab: async ({ userId, labId }, runner = db) => {
    const result = await runner.query(
      `SELECT ${LAB_INSTANCE_INTERNAL_SELECT}
       FROM lab_instances li
       WHERE li.user_id = $1
         AND li.lab_id = $2
         AND li.status IN ($3, $4)
         AND li.expires_at > NOW()
       ORDER BY li.started_at DESC, li.created_at DESC
       LIMIT 1`,
      [userId, labId, LiveLabInstanceStatuses[0], LiveLabInstanceStatuses[1]]
    );

    return result.rows[0] ?? null;
  },

  findOwnedLiveInstanceByLabForUpdate: async ({ userId, labId }, runner = db) => {
    const result = await runner.query(
      `SELECT ${LAB_INSTANCE_INTERNAL_SELECT}
       FROM lab_instances li
       WHERE li.user_id = $1
         AND li.lab_id = $2
         AND li.status IN ($3, $4)
         AND li.expires_at > NOW()
       ORDER BY li.started_at DESC, li.created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [userId, labId, LiveLabInstanceStatuses[0], LiveLabInstanceStatuses[1]]
    );

    return result.rows[0] ?? null;
  },

  findOwnedTerminableInstanceByLabForUpdate: async ({ userId, labId }, runner = db) => {
    const result = await runner.query(
      `SELECT ${LAB_INSTANCE_INTERNAL_SELECT}
       FROM lab_instances li
       WHERE li.user_id = $1
         AND li.lab_id = $2
         AND li.status IN ($3, $4, $5, $6)
       ORDER BY li.started_at DESC, li.created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [
        userId,
        labId,
        TerminableLabInstanceStatuses[0],
        TerminableLabInstanceStatuses[1],
        TerminableLabInstanceStatuses[2],
        TerminableLabInstanceStatuses[3]
      ]
    );

    return result.rows[0] ?? null;
  },

  findOwnedLatestInstanceByLab: async ({ userId, labId }, runner = db) => {
    const result = await runner.query(
      `SELECT ${LAB_INSTANCE_INTERNAL_SELECT}
       FROM lab_instances li
       WHERE li.user_id = $1
         AND li.lab_id = $2
       ORDER BY li.started_at DESC, li.created_at DESC
       LIMIT 1`,
      [userId, labId]
    );

    return result.rows[0] ?? null;
  },

  createLabInstance: async ({ userId, labId, proxyToken, status, expiresAt }, runner = db) => {
    const result = await runner.query(
      `INSERT INTO lab_instances (
         user_id,
         lab_id,
         proxy_token,
         status,
         expires_at
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${LAB_INSTANCE_INTERNAL_SELECT}`,
      [userId, labId, proxyToken, status, expiresAt]
    );

    return result.rows[0] ?? null;
  },

  updateLabInstanceAfterSpawn: async (
    { instanceId, containerId, networkId, status, expiresAt, errorMessage = null },
    runner = db
  ) => {
    const result = await runner.query(
      `UPDATE lab_instances li
       SET container_id = $2,
           network_id = $3,
           status = $4,
           expires_at = $5,
           error_message = $6,
           updated_at = NOW()
       WHERE li.id = $1
       RETURNING ${LAB_INSTANCE_INTERNAL_SELECT}`,
      [instanceId, containerId, networkId, status, expiresAt, errorMessage]
    );

    return result.rows[0] ?? null;
  },

  prepareLabInstanceForReset: async ({ instanceId, proxyToken, expiresAt }, runner = db) => {
    const result = await runner.query(
      `UPDATE lab_instances li
       SET proxy_token = $2,
           status = $3,
           expires_at = $4,
           error_message = NULL,
           updated_at = NOW()
       WHERE li.id = $1
       RETURNING ${LAB_INSTANCE_INTERNAL_SELECT}`,
      [instanceId, proxyToken, LabInstanceStatuses.STARTING, expiresAt]
    );

    return result.rows[0] ?? null;
  },

  completeLabReset: async (
    { instanceId, containerId, networkId, status, expiresAt },
    runner = db
  ) => {
    const result = await runner.query(
      `UPDATE lab_instances li
       SET container_id = $2,
           network_id = $3,
           status = $4,
           expires_at = $5,
           reset_count = li.reset_count + 1,
           error_message = NULL,
           updated_at = NOW()
       WHERE li.id = $1
       RETURNING ${LAB_INSTANCE_INTERNAL_SELECT}`,
      [instanceId, containerId, networkId, status, expiresAt]
    );

    return result.rows[0] ?? null;
  },

  markLabInstanceError: async ({ instanceId, errorMessage }, runner = db) => {
    const result = await runner.query(
      `UPDATE lab_instances li
       SET status = $2,
           error_message = $3,
           updated_at = NOW()
       WHERE li.id = $1
         AND li.status <> $4
       RETURNING ${LAB_INSTANCE_INTERNAL_SELECT}`,
      [
        instanceId,
        LabInstanceStatuses.ERROR,
        errorMessage,
        LabInstanceStatuses.TERMINATED
      ]
    );

    return result.rows[0] ?? null;
  },

  terminateLabInstance: async ({ instanceId }, runner = db) => {
    const result = await runner.query(
      `UPDATE lab_instances li
       SET status = $2,
           terminated_at = COALESCE(li.terminated_at, NOW()),
           error_message = NULL,
           updated_at = NOW()
       WHERE li.id = $1
       RETURNING ${LAB_INSTANCE_INTERNAL_SELECT}`,
      [instanceId, LabInstanceStatuses.TERMINATED]
    );

    return result.rows[0] ?? null;
  }
};
