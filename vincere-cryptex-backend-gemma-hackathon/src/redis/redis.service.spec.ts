import assert from 'node:assert/strict';
import test from 'node:test';

import { ServiceUnavailableException } from '@nestjs/common';

import { RedisService } from './redis.service';

type RedisClientStub = {
  eval?: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
};

const buildService = (client: RedisClientStub, connected = true): RedisService => {
  const service = new RedisService();
  const internals = service as unknown as {
    client: RedisClientStub;
    connect: () => Promise<boolean>;
  };

  Object.defineProperty(internals, 'client', { value: client });
  internals.connect = async () => connected;
  return service;
};

test('rate-limit increment and expiry run in one atomic Redis script', async () => {
  const calls: Array<{ script: string; keys: string[]; arguments: string[] }> = [];
  const service = buildService({
    eval: async (script, options) => {
      calls.push({ script, ...options });
      return [6, 42];
    },
  });

  const result = await service.incrementRateLimit('rate-limit:ai-tutor:ask:user-1', 60, {
    failClosed: true,
  });

  assert.deepEqual(result, { count: 6, ttlSeconds: 42 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.keys, ['rate-limit:ai-tutor:ask:user-1']);
  assert.deepEqual(calls[0]?.arguments, ['60']);
  assert.match(calls[0]?.script ?? '', /INCR/);
  assert.match(calls[0]?.script ?? '', /EXPIRE/);
});

test('concurrency lock uses atomic NX/EX acquisition and owner-token release', async () => {
  const evalCalls: Array<{ script: string; keys: string[]; arguments: string[] }> = [];
  const service = buildService({
    eval: async (script, options) => {
      evalCalls.push({ script, ...options });
      return evalCalls.length === 1 ? [1, 120] : 1;
    },
  });

  const acquired = await service.acquireLock('ai-tutor:usage:concurrency:user-1', 'owner-1', 120, {
    failClosed: true,
  });
  const released = await service.releaseLock(
    'ai-tutor:usage:concurrency:user-1',
    'owner-1',
  );

  assert.deepEqual(acquired, { acquired: true, ttlSeconds: 120 });
  assert.equal(released, true);
  assert.equal(evalCalls.length, 2);
  assert.deepEqual(evalCalls[0]?.arguments, ['owner-1', '120']);
  assert.match(evalCalls[0]?.script ?? '', /SET/);
  assert.match(evalCalls[0]?.script ?? '', /NX/);
  assert.match(evalCalls[0]?.script ?? '', /EX/);
  assert.deepEqual(evalCalls[1]?.arguments, ['owner-1']);
  assert.match(evalCalls[1]?.script ?? '', /GET/);
  assert.match(evalCalls[1]?.script ?? '', /DEL/);
});

test('daily quota checks, increments, and sets UTC expiry in one atomic script', async () => {
  const calls: Array<{ script: string; keys: string[]; arguments: string[] }> = [];
  const service = buildService({
    eval: async (script, options) => {
      calls.push({ script, ...options });
      return [1, 7, 3600];
    },
  });

  const result = await service.consumeDailyQuota(
    'ai-tutor:usage:daily:user-1',
    100,
    { failClosed: true },
  );

  assert.deepEqual(result, { allowed: true, count: 7, ttlSeconds: 3600 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.arguments, ['100']);
  assert.match(calls[0]?.script ?? '', /TIME/);
  assert.match(calls[0]?.script ?? '', /current >=/);
  assert.match(calls[0]?.script ?? '', /INCR/);
  assert.match(calls[0]?.script ?? '', /EXPIREAT/);
});

test('Redis enforcement failure is fail-closed without exposing the Redis key', async () => {
  const service = buildService({}, false);
  const internalKey = 'rate-limit:ai-tutor:ask:private-user-id';

  await assert.rejects(
    service.incrementRateLimit(internalKey, 60, { failClosed: true }),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.equal(error.message, 'Security controls unavailable');
      assert.doesNotMatch(error.message, /private-user-id/);
      return true;
    },
  );
});
