import { spawn } from 'node:child_process';
import path from 'node:path';

import { validateIntegrationEnvironment } from './environment';
import { verifyDatabaseTarget } from './targets';

const backendRoot = path.resolve(__dirname, '..', '..');
const prismaCli = path.join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js');
const prismaSchema = path.join(backendRoot, 'prisma', 'schema.prisma');

const runProcess = (command: string, arguments_: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Integration database reset was terminated by ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Integration database reset exited with code ${String(code)}`));
        return;
      }

      resolve();
    });
  });

export const resetIntegrationDatabase = async (): Promise<void> => {
  const environment = validateIntegrationEnvironment(process.env);

  await verifyDatabaseTarget(environment);
  await runProcess(process.execPath, [
    prismaCli,
    'migrate',
    'reset',
    '--force',
    '--skip-generate',
    '--skip-seed',
    `--schema=${prismaSchema}`,
  ]);
  await verifyDatabaseTarget(environment);
};
