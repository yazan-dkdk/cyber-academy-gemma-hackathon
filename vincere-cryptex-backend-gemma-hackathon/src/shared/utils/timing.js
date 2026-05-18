import { setTimeout as delay } from 'timers/promises';

export const withMinimumDuration = async (operation, minimumDurationMs) => {
  const startedAt = Date.now();

  try {
    return await operation();
  } finally {
    const elapsed = Date.now() - startedAt;
    const remaining = minimumDurationMs - elapsed;

    if (remaining > 0) {
      await delay(remaining);
    }
  }
};
