import { spawn } from 'node:child_process';
import path from 'node:path';

import { resetIntegrationDatabase } from './database-reset';
import { validateIntegrationEnvironment } from './environment';
import { createVerifiedRedisClient } from './targets';

const backendRoot = path.resolve(__dirname, '..', '..');
const integrationSpec = path.join(backendRoot, 'test', 'integration', 'infrastructure.spec.ts');

const runTestProcess = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--test', '--test-concurrency=1', integrationSpec],
      {
        cwd: backendRoot,
        env: process.env,
        stdio: 'inherit',
        windowsHide: true,
      },
    );

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Integration tests were terminated by ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Integration tests exited with code ${String(code)}`));
        return;
      }

      resolve();
    });
  });

const run = async (): Promise<void> => {
  const environment = validateIntegrationEnvironment(process.env);
  await resetIntegrationDatabase();

  const redis = await createVerifiedRedisClient(environment);
  await redis.quit();

  await runTestProcess();
};

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
