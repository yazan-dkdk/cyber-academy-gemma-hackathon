import { resetIntegrationDatabase } from './database-reset';

void resetIntegrationDatabase()
  .then(() => {
    console.log('Dedicated integration database reset and migrations completed.');
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
