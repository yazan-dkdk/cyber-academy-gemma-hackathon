import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { resetIntegrationDatabase } from './database-reset';
import {
  buildIntegrationTestProcessEnvironment,
  validateIntegrationEnvironment,
} from './environment';
import { createVerifiedRedisClient } from './targets';

const backendRoot = path.resolve(__dirname, '..', '..');
const integrationRoot = path.join(backendRoot, 'test', 'integration');
const typeScriptCompiler = path.join(backendRoot, 'node_modules', 'typescript', 'bin', 'tsc');

const findIntegrationSpecs = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const specs = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return findIntegrationSpecs(entryPath);
      }

      return entry.isFile() && entry.name.endsWith('.spec.ts') ? [entryPath] : [];
    }),
  );

  return specs.flat();
};

const compileApplication = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [typeScriptCompiler, '-p', 'tsconfig.build.json'], {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Integration application build was terminated by ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Integration application build exited with code ${String(code)}`));
        return;
      }

      resolve();
    });
  });

const runTestProcess = (integrationSpecs: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--test', '--test-concurrency=1', ...integrationSpecs],
      {
        cwd: backendRoot,
        env: buildIntegrationTestProcessEnvironment(process.env),
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
  const integrationSpecs = (await findIntegrationSpecs(integrationRoot)).sort((left, right) =>
    left.localeCompare(right),
  );
  if (integrationSpecs.length === 0) {
    throw new Error('No backend integration specs were found under test/integration/**/*.spec.ts');
  }

  await compileApplication();
  await resetIntegrationDatabase();

  const redis = await createVerifiedRedisClient(environment);
  await redis.quit();

  await runTestProcess(integrationSpecs);
};

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
