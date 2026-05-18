export const waitForMinimumDuration = async <T>(
  action: () => Promise<T>,
  minimumDurationMs: number,
): Promise<T> => {
  const startedAt = Date.now();
  const result = await action();
  const elapsedMs = Date.now() - startedAt;

  if (elapsedMs < minimumDurationMs) {
    await new Promise((resolve) => setTimeout(resolve, minimumDurationMs - elapsedMs));
  }

  return result;
};
