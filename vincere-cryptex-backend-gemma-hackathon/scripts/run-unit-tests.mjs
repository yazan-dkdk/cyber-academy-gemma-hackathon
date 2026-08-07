import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(backendRoot, 'src');

async function findUnitSpecs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const specs = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return findUnitSpecs(entryPath);
      }

      return entry.isFile() && entry.name.endsWith('.spec.ts') ? [entryPath] : [];
    }),
  );

  return specs.flat();
}

const unitSpecs = (await findUnitSpecs(sourceRoot)).sort((left, right) =>
  left.localeCompare(right),
);

if (unitSpecs.length === 0) {
  throw new Error('No backend unit specs were found under src/**/*.spec.ts');
}

const testProcess = spawn(
  process.execPath,
  ['--import', 'tsx', '--test', ...unitSpecs],
  {
    cwd: backendRoot,
    stdio: 'inherit',
  },
);

testProcess.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

testProcess.once('exit', (code, signal) => {
  if (signal) {
    console.error(`Backend unit tests were terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
