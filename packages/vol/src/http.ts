import type { FetchLike } from "./types.js";

export interface RetryOptions {
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  delay?: (ms: number) => Promise<void>;
}

const defaultDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJsonWithRetry(
  fetchImpl: FetchLike,
  input: string,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<unknown> {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const delay = options.delay ?? defaultDelay;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(input, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await delay(baseDelayMs * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
