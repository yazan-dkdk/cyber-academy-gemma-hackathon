import { createApp } from './app.js';
import { env } from './config/env.js';
import { initializeDatabase } from './config/db.js';
import { initializeRedis } from './config/redis.js';

const startServer = async () => {
  await initializeDatabase();
  await initializeRedis();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`API listening on port ${env.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
