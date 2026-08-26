import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, it } from 'node:test';

import { PrismaClient } from '@prisma/client';

import {
  INTEGRATION_REDIS_KEY_PREFIX,
  IntegrationEnvironment,
  validateIntegrationEnvironment,
} from '../../scripts/integration/environment';
import {
  cleanupIntegrationRedisKeys,
  countIntegrationRedisKeys,
  createVerifiedPrismaClient,
  createVerifiedRedisClient,
  IntegrationRedisClient,
} from '../../scripts/integration/targets';

const smokeEmail = 'pf05d-integration-smoke@example.invalid';
const redisTtlKey = `${INTEGRATION_REDIS_KEY_PREFIX}ttl`;
const migrationsRoot = path.resolve(__dirname, '..', '..', 'prisma', 'migrations');

let environment: IntegrationEnvironment;
let prisma: PrismaClient | undefined;
let redis: IntegrationRedisClient | undefined;

describe('isolated PostgreSQL and Redis integration infrastructure', () => {
  before(async () => {
    environment = validateIntegrationEnvironment(process.env);
    prisma = await createVerifiedPrismaClient(environment);
    redis = await createVerifiedRedisClient(environment);

    await prisma.user.deleteMany({ where: { email: smokeEmail } });
    await cleanupIntegrationRedisKeys(redis);
  });

  after(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: smokeEmail } });
      await prisma.$disconnect();
    }

    if (redis) {
      await cleanupIntegrationRedisKeys(redis);
      await redis.quit();
    }
  });

  it('refuses unsafe environment markers and service targets', () => {
    const unsafeDatabase = new URL(environment.databaseUrl);
    unsafeDatabase.pathname = '/cyber_academy';

    const unsafeRedis = new URL(environment.redisUrl);
    unsafeRedis.port = '6379';
    unsafeRedis.pathname = '/0';

    assert.throws(
      () => validateIntegrationEnvironment({ ...process.env, INTEGRATION_TEST: 'false' }),
      /Refusing integration operation/,
    );
    assert.throws(
      () => validateIntegrationEnvironment({ ...process.env, NODE_ENV: 'development' }),
      /Refusing integration operation/,
    );
    assert.throws(
      () =>
        validateIntegrationEnvironment({
          ...process.env,
          DATABASE_URL: unsafeDatabase.toString(),
        }),
      /Refusing integration operation/,
    );
    assert.throws(
      () =>
        validateIntegrationEnvironment({
          ...process.env,
          REDIS_URL: unsafeRedis.toString(),
        }),
      /Refusing integration operation/,
    );
  });

  it('connects to PostgreSQL and confirms every real Prisma migration is applied', async () => {
    assert.ok(prisma);
    const migrationEntries = await readdir(migrationsRoot, { withFileTypes: true });
    const expectedMigrations = migrationEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const appliedMigrations = await prisma.$queryRaw<Array<{ migrationName: string }>>`
      SELECT migration_name AS "migrationName"
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name
    `;

    assert.ok(expectedMigrations.length > 0);
    assert.deepEqual(
      appliedMigrations.map((migration) => migration.migrationName),
      expectedMigrations,
    );
  });

  it('creates, reads, and deletes a temporary record through the generated Prisma client', async () => {
    assert.ok(prisma);
    assert.equal(await prisma.user.count({ where: { email: smokeEmail } }), 0);

    const created = await prisma.user.create({
      data: {
        email: smokeEmail,
        passwordHash: 'integration-test-only-not-a-real-password-hash',
        status: 'ACTIVE',
      },
    });
    const readBack = await prisma.user.findUnique({ where: { id: created.id } });

    assert.equal(readBack?.email, smokeEmail);
    await prisma.user.delete({ where: { id: created.id } });
    assert.equal(await prisma.user.findUnique({ where: { id: created.id } }), null);
  });

  it('connects to dedicated Redis and verifies set/get and TTL expiry', async () => {
    assert.ok(redis);
    assert.equal(await countIntegrationRedisKeys(redis), 0);

    await redis.set(redisTtlKey, 'isolated', { PX: 750 });
    assert.equal(await redis.get(redisTtlKey), 'isolated');

    const remainingTtl = await redis.pTTL(redisTtlKey);
    assert.ok(remainingTtl > 0 && remainingTtl <= 750);

    await delay(900);
    assert.equal(await redis.get(redisTtlKey), null);
  });

  it('cleans only the integration Redis namespace and leaves it repeatable', async () => {
    assert.ok(redis);
    await redis.mSet({
      [`${INTEGRATION_REDIS_KEY_PREFIX}cleanup:a`]: 'a',
      [`${INTEGRATION_REDIS_KEY_PREFIX}cleanup:b`]: 'b',
    });

    assert.equal(await cleanupIntegrationRedisKeys(redis), 2);
    assert.equal(await countIntegrationRedisKeys(redis), 0);
  });
});
