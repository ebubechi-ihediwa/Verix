export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PollOptions<T> {
  /** Stop and resolve once this returns true for a value. */
  until: (value: T) => boolean;
  /** Delay between polls, ms. */
  intervalMs: number;
  /** Give up after this long, ms. */
  timeoutMs: number;
}

/**
 * Poll `fn` until `until` is satisfied or the timeout elapses.
 * Checks immediately first (no initial delay), then every `intervalMs`.
 * Resolves with `{ value, satisfied }` so callers decide how to treat a timeout.
 */
export async function poll<T>(
  fn: () => Promise<T>,
  opts: PollOptions<T>
): Promise<{ value: T; satisfied: boolean }> {
  const deadline = Date.now() + opts.timeoutMs;

  // Immediate first check.
  let value = await fn();
  if (opts.until(value)) return { value, satisfied: true };

  while (Date.now() < deadline) {
    await sleep(opts.intervalMs);
    value = await fn();
    if (opts.until(value)) return { value, satisfied: true };
  }

  return { value, satisfied: false };
}
