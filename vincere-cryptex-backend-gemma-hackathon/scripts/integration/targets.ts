import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

import {
  INTEGRATION_DATABASE_CLUSTER,
  INTEGRATION_REDIS_KEY_PREFIX,
  IntegrationEnvironment,
} from './environment';

interface DatabaseIdentity {
  databaseName: string;
  databaseUser: string;
  clusterName: string;
  serverPort: number;
}

export type IntegrationRedisClient = ReturnType<typeof createClient>;

export const createVerifiedPrismaClient = async (
  environment: IntegrationEnvironment,
): Promise<PrismaClient> => {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: environment.databaseUrl,
      },
    },
  });

  try {
    await client.$connect();
    const identities = await client.$queryRaw<DatabaseIdentity[]>`
      SELECT
        current_database()::text AS "databaseName",
        current_user::text AS "databaseUser",
        current_setting('cluster_name', true)::text AS "clusterName",
        inet_server_port() AS "serverPort"
    `;
    const identity = identities[0];

    if (
      identities.length !== 1 ||
      identity.databaseName !== environment.databaseName ||
      identity.databaseUser !== environment.databaseUser ||
      identity.clusterName !== INTEGRATION_DATABASE_CLUSTER ||
      identity.serverPort !== 5432
    ) {
      throw new Error('Connected PostgreSQL server does not have the dedicated integration identity');
    }

    return client;
  } catch (error) {
    await client.$disconnect().catch(() => undefined);
    throw error;
  }
};

export const verifyDatabaseTarget = async (
  environment: IntegrationEnvironment,
): Promise<void> => {
  const client = await createVerifiedPrismaClient(environment);
  await client.$disconnect();
};

export const createVerifiedRedisClient = async (
  environment: IntegrationEnvironment,
): Promise<IntegrationRedisClient> => {
  const client = createClient({
    url: environment.redisUrl,
    socket: {
      connectTimeout: 3_000,
      reconnectStrategy: false,
    },
  });
  client.on('error', () => undefined);

  try {
    await client.connect();
    const aclUser = String(await client.sendCommand(['ACL', 'WHOAMI']));
    const clientInfo = String(await client.sendCommand(['CLIENT', 'INFO']));
    const selectedDatabase = /(?:^|\s)db=(\d+)(?:\s|$)/.exec(clientInfo)?.[1];

    if (
      aclUser !== environment.redisUser ||
      selectedDatabase !== String(environment.redisDatabase)
    ) {
      throw new Error('Connected Redis server does not have the dedicated integration identity');
    }

    return client;
  } catch (error) {
    if (client.isOpen) {
      await client.quit().catch(() => undefined);
    }
    throw error;
  }
};

export const cleanupIntegrationRedisKeys = async (
  client: IntegrationRedisClient,
): Promise<number> => {
  const keys: string[] = [];

  for await (const key of client.scanIterator({
    MATCH: `${INTEGRATION_REDIS_KEY_PREFIX}*`,
    COUNT: 100,
  })) {
    keys.push(key);
  }

  if (keys.length > 0) {
    await client.del(keys);
  }

  return keys.length;
};

export const countIntegrationRedisKeys = async (
  client: IntegrationRedisClient,
): Promise<number> => {
  let count = 0;

  for await (const key of client.scanIterator({
    MATCH: `${INTEGRATION_REDIS_KEY_PREFIX}*`,
    COUNT: 100,
  })) {
    if (key.startsWith(INTEGRATION_REDIS_KEY_PREFIX)) {
      count += 1;
    }
  }

  return count;
};
