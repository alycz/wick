import { Connection } from "@solana/web3.js";

export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export function requiredEnv(name: string, environment: NodeJS.ProcessEnv = process.env): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function integerEnv(name: string, fallback: number, environment: NodeJS.ProcessEnv = process.env): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export async function assertDevnet(connection: Pick<Connection, "getGenesisHash">): Promise<void> {
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS_HASH) throw new Error(`Refusing non-devnet RPC (genesis ${genesis})`);
}

export async function waitForConfirmedSignature(
  connection: Pick<Connection, "getSignatureStatuses">,
  signature: string,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  const timeoutAt = Date.now() + (options.timeoutMs ?? 45_000);
  do {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await sleep(options.pollMs ?? 500);
  } while (Date.now() < timeoutAt);
  throw new Error(`Transaction ${signature} was not confirmed before timeout`);
}

export const sleep = (ms: number): Promise<void> => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

export async function fetchJson<T>(url: string, init: RequestInit = {}, attempts = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      const body = await response.json().catch(() => undefined) as T | undefined;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (body === undefined) throw new Error("non-JSON response");
      return body;
    } catch (error) {
      last = error;
      if (attempt + 1 < attempts) await sleep(250 * 2 ** attempt);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
