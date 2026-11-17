import { SOLANA_DEVNET_GENESIS_HASH } from "@wick/shared";
import { describe, expect, it, vi } from "vitest";
import {
  AIRDROP_COOLDOWN_MS,
  CollectorWorker,
  KEEPER_TARGET_LAMPORTS,
  TREASURY_RESERVE_LAMPORTS,
  createCollectorWorkerFromEnvironment,
  type CollectorLogger,
  type CollectorState,
  type CollectorStateStore,
  type CollectorTransport,
  type CollectorWallet,
} from "../src/collector/service.js";

class MemoryStateStore implements CollectorStateStore {
  state: CollectorState = { lastAirdrop: {} };
  async load(): Promise<CollectorState> { return structuredClone(this.state); }
  async save(state: CollectorState): Promise<void> { this.state = structuredClone(state); }
}

class FakeTransport implements CollectorTransport {
  balances = new Map<string, number>();
  getGenesisHash = vi.fn(async () => SOLANA_DEVNET_GENESIS_HASH);
  requestAirdrop = vi.fn(async () => "airdrop-signature");
  confirm = vi.fn(async () => undefined);
  getBalance = vi.fn(async (address: string) => this.balances.get(address) ?? 0);
  transfer = vi.fn(async () => "transfer-signature");
}

const treasury: CollectorWallet = { address: "treasury", signer: {} };
const keeper: CollectorWallet = { address: "keeper", signer: {} };
const logger: CollectorLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function worker(transport: CollectorTransport, stateStore: CollectorStateStore, options: { now?: () => number; sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void> } = {}): CollectorWorker {
  return new CollectorWorker({
    endpoints: [{ name: "public-devnet", transport }],
    fundingTransport: transport,
    treasury,
    keeper,
    stateStore,
    logger,
    ...options,
  });
}

describe("collector worker", () => {
  it("persists the eight-hour cooldown per endpoint across worker instances", async () => {
    const state = new MemoryStateStore();
    const transport = new FakeTransport();
    let now = 1_000_000;
    await worker(transport, state, { now: () => now }).runCycle();
    expect(transport.requestAirdrop).toHaveBeenCalledOnce();
    expect(state.state.lastAirdrop["public-devnet"]).toBe(now);

    now += AIRDROP_COOLDOWN_MS - 1;
    await worker(transport, state, { now: () => now }).runCycle();
    expect(transport.requestAirdrop).toHaveBeenCalledOnce();

    now += 1;
    await worker(transport, state, { now: () => now }).runCycle();
    expect(transport.requestAirdrop).toHaveBeenCalledTimes(2);
  });

  it("tracks independent cooldowns for each verified endpoint", async () => {
    const state = new MemoryStateStore();
    const publicTransport = new FakeTransport();
    const quickNodeTransport = new FakeTransport();
    const now = AIRDROP_COOLDOWN_MS * 2;
    state.state.lastAirdrop["public-devnet"] = now - 1;
    const collector = new CollectorWorker({
      endpoints: [
        { name: "public-devnet", transport: publicTransport },
        { name: "quicknode-devnet", transport: quickNodeTransport },
      ],
      fundingTransport: publicTransport,
      treasury,
      keeper,
      stateStore: state,
      logger,
      now: () => now,
    });
    await collector.runCycle();
    expect(publicTransport.requestAirdrop).not.toHaveBeenCalled();
    expect(quickNodeTransport.requestAirdrop).toHaveBeenCalledOnce();
    expect(state.state.lastAirdrop).toEqual({
      "public-devnet": now - 1,
      "quicknode-devnet": now,
    });
  });

  it("coalesces concurrent triggers into one cycle", async () => {
    const state = new MemoryStateStore();
    const transport = new FakeTransport();
    let releaseGenesis: (() => void) | undefined;
    transport.getGenesisHash.mockImplementationOnce(() => new Promise<string>((resolve) => {
      releaseGenesis = () => resolve(SOLANA_DEVNET_GENESIS_HASH);
    }));
    const collector = worker(transport, state);
    const first = collector.runCycle();
    const second = collector.runCycle();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(transport.getGenesisHash).toHaveBeenCalledOnce());
    releaseGenesis?.();
    await Promise.all([first, second]);
    expect(transport.requestAirdrop).toHaveBeenCalledOnce();
  });

  it("does not transfer when the treasury cannot preserve its reserve", async () => {
    const state = new MemoryStateStore();
    state.state.lastAirdrop["public-devnet"] = 1_000_000;
    const transport = new FakeTransport();
    transport.balances.set(keeper.address, 0);
    transport.balances.set(treasury.address, TREASURY_RESERVE_LAMPORTS);
    await worker(transport, state, { now: () => 1_000_001 }).runCycle();
    expect(transport.transfer).not.toHaveBeenCalled();

    transport.balances.set(treasury.address, TREASURY_RESERVE_LAMPORTS + KEEPER_TARGET_LAMPORTS - 1);
    await worker(transport, state, { now: () => 1_000_002 }).runCycle();
    expect(transport.transfer).toHaveBeenCalledWith(treasury, keeper.address, KEEPER_TARGET_LAMPORTS - 1, expect.any(AbortSignal));
  });

  it("aborts the cadence wait and shuts down without another cycle", async () => {
    const state = new MemoryStateStore();
    state.state.lastAirdrop["public-devnet"] = 1_000_000;
    const transport = new FakeTransport();
    let waiting: ((signal: AbortSignal) => void) | undefined;
    const sleep = vi.fn((_milliseconds: number, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      waiting = (observed) => {
        expect(observed.aborted).toBe(true);
        reject(observed.reason);
      };
      signal.addEventListener("abort", () => waiting?.(signal), { once: true });
    }));
    const collector = worker(transport, state, { now: () => 1_000_001, sleep });
    collector.start();
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledOnce());
    await collector.stop();
    expect(transport.getGenesisHash).toHaveBeenCalledOnce();
  });

  it("does not read configuration or create transports unless explicitly enabled", async () => {
    await expect(createCollectorWorkerFromEnvironment({
      environment: { TREASURY_KEYPAIR: "not-a-key", KEEPER_KEYPAIR: "not-a-key" },
      logger,
    })).resolves.toBeUndefined();
    await expect(createCollectorWorkerFromEnvironment({
      environment: { SOL_COLLECTOR_ENABLED: "TRUE", TREASURY_KEYPAIR: "not-a-key", KEEPER_KEYPAIR: "not-a-key" },
      logger,
    })).resolves.toBeUndefined();
  });

  it("refuses a non-devnet endpoint before requesting or transferring", async () => {
    const state = new MemoryStateStore();
    const transport = new FakeTransport();
    transport.getGenesisHash.mockResolvedValue("mainnet-genesis");
    await expect(worker(transport, state).runCycle()).rejects.toThrow("Refusing non-devnet collector RPC");
    expect(transport.requestAirdrop).not.toHaveBeenCalled();
    expect(transport.transfer).not.toHaveBeenCalled();
  });
});
