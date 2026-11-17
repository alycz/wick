import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { PUBLIC_DEVNET_RPC, SOLANA_DEVNET_GENESIS_HASH } from "@wick/shared";
import bs58 from "bs58";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const COLLECTOR_INTERVAL_MS = 15 * 60 * 1_000;
export const AIRDROP_COOLDOWN_MS = 8 * 60 * 60 * 1_000;
export const AIRDROP_LAMPORTS = 2 * LAMPORTS_PER_SOL;
export const KEEPER_TARGET_LAMPORTS = LAMPORTS_PER_SOL;
export const TREASURY_RESERVE_LAMPORTS = 500_000_000;

export interface CollectorState {
  lastAirdrop: Record<string, number>;
}

export interface CollectorStateStore {
  load(): Promise<CollectorState>;
  save(state: CollectorState): Promise<void>;
}

export interface CollectorWallet {
  readonly address: string;
  readonly signer: unknown;
}

export interface CollectorTransport {
  getGenesisHash(signal?: AbortSignal): Promise<string>;
  requestAirdrop(address: string, lamports: number, signal?: AbortSignal): Promise<string>;
  confirm(signature: string, signal?: AbortSignal): Promise<void>;
  getBalance(address: string, signal?: AbortSignal): Promise<number>;
  transfer(from: CollectorWallet, to: string, lamports: number, signal?: AbortSignal): Promise<string>;
}

export interface CollectorEndpoint {
  readonly name: string;
  readonly transport: CollectorTransport;
}

export interface CollectorLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface CollectorWorkerOptions {
  endpoints: readonly [CollectorEndpoint, ...CollectorEndpoint[]];
  fundingTransport: CollectorTransport;
  treasury: CollectorWallet;
  keeper: CollectorWallet;
  stateStore: CollectorStateStore;
  logger: CollectorLogger;
  now?: () => number;
  intervalMs?: number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export class CollectorWorker {
  private readonly endpoints: readonly CollectorEndpoint[];
  private readonly fundingTransport: CollectorTransport;
  private readonly treasury: CollectorWallet;
  private readonly keeper: CollectorWallet;
  private readonly stateStore: CollectorStateStore;
  private readonly logger: CollectorLogger;
  private readonly now: () => number;
  private readonly intervalMs: number;
  private readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  private cyclePromise: Promise<void> | undefined;
  private loopPromise: Promise<void> | undefined;
  private controller: AbortController | undefined;

  constructor(options: CollectorWorkerOptions) {
    if (new Set(options.endpoints.map(({ name }) => name)).size !== options.endpoints.length) {
      throw new Error("Collector endpoint names must be unique");
    }
    this.endpoints = options.endpoints;
    this.fundingTransport = options.fundingTransport;
    this.treasury = options.treasury;
    this.keeper = options.keeper;
    this.stateStore = options.stateStore;
    this.logger = options.logger;
    this.now = options.now ?? Date.now;
    this.intervalMs = options.intervalMs ?? COLLECTOR_INTERVAL_MS;
    this.sleep = options.sleep ?? abortableSleep;
  }

  /** Runs at most one collector cycle at a time, even if multiple callers trigger it. */
  runCycle(signal: AbortSignal = new AbortController().signal): Promise<void> {
    if (this.cyclePromise) return this.cyclePromise;
    const cycle = this.executeCycle(signal);
    this.cyclePromise = cycle.finally(() => {
      if (this.cyclePromise === wrapped) this.cyclePromise = undefined;
    });
    const wrapped = this.cyclePromise;
    return wrapped;
  }

  /** Starts the lifecycle loop once. The initial cycle runs immediately. */
  start(): void {
    if (this.loopPromise) return;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.loopPromise = this.runLoop(signal).finally(() => {
      this.loopPromise = undefined;
      this.controller = undefined;
    });
  }

  /** Stops future cycles, interrupts the cadence wait, and drains an in-flight cycle. */
  async stop(): Promise<void> {
    this.controller?.abort();
    await this.loopPromise;
  }

  private async runLoop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.runCycle(signal);
      } catch (error) {
        if (!signal.aborted) this.logger.error({ error: errorMessage(error) }, "collector cycle failed");
      }
      if (signal.aborted) break;
      try {
        await this.sleep(this.intervalMs, signal);
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    }
  }

  private async executeCycle(signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const state = await this.stateStore.load();
    for (const endpoint of this.endpoints) {
      throwIfAborted(signal);
      await assertDevnet(endpoint.transport, signal);
      await this.requestAirdrop(endpoint, state, signal);
    }

    throwIfAborted(signal);
    const keeperBalance = await this.fundingTransport.getBalance(this.keeper.address, signal);
    const treasuryBalance = await this.fundingTransport.getBalance(this.treasury.address, signal);
    const available = Math.max(0, treasuryBalance - TREASURY_RESERVE_LAMPORTS);
    const amount = Math.min(Math.max(0, KEEPER_TARGET_LAMPORTS - keeperBalance), available);
    if (amount > 0) {
      const signature = await this.fundingTransport.transfer(this.treasury, this.keeper.address, amount, signal);
      this.logger.info({ target: this.keeper.address, lamports: amount, signature }, "collector keeper top-up confirmed");
    }
    this.logger.info({
      treasury: this.treasury.address,
      keeper: this.keeper.address,
      balances: { treasury: treasuryBalance - amount, keeper: keeperBalance + amount },
    }, "collector cycle complete");
  }

  private async requestAirdrop(endpoint: CollectorEndpoint, state: CollectorState, signal: AbortSignal): Promise<void> {
    const now = this.now();
    const lastAttempt = state.lastAirdrop[endpoint.name];
    if (lastAttempt !== undefined && now - lastAttempt < AIRDROP_COOLDOWN_MS) return;
    // Persist every attempt before touching the faucet. A failed or rate-limited
    // request must not be retried on the 15-minute maintenance cadence.
    state.lastAirdrop[endpoint.name] = now;
    await this.stateStore.save(state);
    try {
      const signature = await endpoint.transport.requestAirdrop(this.treasury.address, AIRDROP_LAMPORTS, signal);
      await endpoint.transport.confirm(signature, signal);
      this.logger.info({ endpoint: endpoint.name, signature }, "collector airdrop confirmed");
    } catch (error) {
      if (signal.aborted) throw error;
      this.logger.warn({ endpoint: endpoint.name, error: errorMessage(error) }, "collector airdrop failed");
    }
  }
}

export class FileCollectorStateStore implements CollectorStateStore {
  constructor(private readonly path: string) {}

  async load(): Promise<CollectorState> {
    let contents: string;
    try {
      contents = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { lastAirdrop: {} };
      throw error;
    }
    const parsed = JSON.parse(contents) as { lastAirdrop?: unknown };
    if (!parsed.lastAirdrop || typeof parsed.lastAirdrop !== "object" || Array.isArray(parsed.lastAirdrop)) {
      throw new Error("Collector state is invalid: lastAirdrop must be an object");
    }
    const lastAirdrop: Record<string, number> = {};
    for (const [endpoint, timestamp] of Object.entries(parsed.lastAirdrop)) {
      if (!Number.isSafeInteger(timestamp) || (timestamp as number) < 0) {
        throw new Error(`Collector state is invalid for endpoint ${endpoint}`);
      }
      lastAirdrop[endpoint] = timestamp as number;
    }
    return { lastAirdrop };
  }

  async save(state: CollectorState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export class Web3CollectorTransport implements CollectorTransport {
  constructor(private readonly connection: Connection) {}

  async getGenesisHash(signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    return this.connection.getGenesisHash();
  }

  async requestAirdrop(address: string, lamports: number, signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    return this.connection.requestAirdrop(new PublicKey(address), lamports);
  }

  async confirm(signature: string, signal?: AbortSignal): Promise<void> {
    const timeoutAt = Date.now() + 45_000;
    do {
      throwIfAborted(signal);
      const status = (await this.connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      if (status?.err) throw new Error(`Transaction ${signature} failed`);
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
      await abortableSleep(500, signal ?? new AbortController().signal);
    } while (Date.now() < timeoutAt);
    throw new Error(`Transaction ${signature} was not confirmed before timeout`);
  }

  async getBalance(address: string, signal?: AbortSignal): Promise<number> {
    throwIfAborted(signal);
    return this.connection.getBalance(new PublicKey(address), "confirmed");
  }

  async transfer(from: CollectorWallet, to: string, lamports: number, signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    if (!(from.signer instanceof Keypair)) throw new Error("Collector treasury signer is invalid");
    const transaction = new Transaction().add(SystemProgram.transfer({
      fromPubkey: from.signer.publicKey,
      toPubkey: new PublicKey(to),
      lamports,
    }));
    return sendAndConfirmTransaction(this.connection, transaction, [from.signer], { commitment: "confirmed" });
  }
}

export type CollectorEnvironment = NodeJS.ProcessEnv & {
  SOL_COLLECTOR_ENABLED?: string;
  SOL_COLLECTOR_STATE_PATH?: string;
  SQLITE_PATH?: string;
  PUBLIC_SOLANA_RPC_URL?: string;
  QUICKNODE_RPC_URL?: string;
  TREASURY_KEYPAIR?: string;
  KEEPER_KEYPAIR?: string;
};

export interface CollectorFactoryOptions {
  environment?: CollectorEnvironment;
  logger: CollectorLogger;
  requireEnabled?: boolean;
}

/** Creates no transport and reads no key material unless collector activation is explicit. */
export async function createCollectorWorkerFromEnvironment(options: CollectorFactoryOptions): Promise<CollectorWorker | undefined> {
  const environment = options.environment ?? process.env;
  if ((options.requireEnabled ?? true) && environment.SOL_COLLECTOR_ENABLED?.trim() !== "true") return undefined;
  const treasury = await loadWallet(required(environment.TREASURY_KEYPAIR, "TREASURY_KEYPAIR"), "TREASURY_KEYPAIR");
  const keeper = await loadWallet(required(environment.KEEPER_KEYPAIR, "KEEPER_KEYPAIR"), "KEEPER_KEYPAIR");
  const publicTransport = new Web3CollectorTransport(new Connection(environment.PUBLIC_SOLANA_RPC_URL?.trim() || PUBLIC_DEVNET_RPC, "confirmed"));
  const endpoints: [CollectorEndpoint, ...CollectorEndpoint[]] = [{ name: "public-devnet", transport: publicTransport }];
  const quickNodeUrl = environment.QUICKNODE_RPC_URL?.trim();
  if (quickNodeUrl) endpoints.push({ name: "quicknode-devnet", transport: new Web3CollectorTransport(new Connection(quickNodeUrl, "confirmed")) });
  const statePath = environment.SOL_COLLECTOR_STATE_PATH?.trim()
    || (environment.SQLITE_PATH?.trim() ? resolve(dirname(environment.SQLITE_PATH), "sol-collector.json") : resolve(".state/sol-collector.json"));
  return new CollectorWorker({
    endpoints,
    fundingTransport: publicTransport,
    treasury,
    keeper,
    stateStore: new FileCollectorStateStore(statePath),
    logger: options.logger,
  });
}

async function loadWallet(value: string, label: string): Promise<CollectorWallet> {
  try {
    const trimmed = value.trim();
    const bytes = trimmed.startsWith("[")
      ? Uint8Array.from(JSON.parse(trimmed) as number[])
      : /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)
        ? bs58.decode(trimmed)
        : Uint8Array.from(JSON.parse(await readFile(resolve(trimmed), "utf8")) as number[]);
    const signer = Keypair.fromSecretKey(bytes);
    return { address: signer.publicKey.toBase58(), signer };
  } catch {
    throw new Error(`${label} could not be loaded`);
  }
}

async function assertDevnet(transport: CollectorTransport, signal: AbortSignal): Promise<void> {
  const genesis = await transport.getGenesisHash(signal);
  if (genesis !== SOLANA_DEVNET_GENESIS_HASH) throw new Error(`Refusing non-devnet collector RPC (genesis ${genesis})`);
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required when SOL_COLLECTOR_ENABLED=true`);
  return value;
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gu, "[REDACTED_RPC_URL]");
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveDelay, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolveDelay();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
