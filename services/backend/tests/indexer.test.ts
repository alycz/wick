import { PublicKey } from "@solana/web3.js";
import Fastify from "fastify";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeEventForTest } from "../src/indexer/decoder.js";
import { registerIndexerRoutes } from "../src/indexer/routes.js";
import { IndexerService } from "../src/indexer/service.js";
import type { IndexerLogger } from "../src/indexer/types.js";
import type { BackendFastifyInstance } from "../src/server.js";

const PROGRAM_ID = "EBfYyDsDq4rEL9hqi7CwbM3rW1zYvBAfdRcWLdbWeMxi";
const POSITION = new PublicKey("11111111111111111111111111111111");
const OWNER = new PublicKey("Vote111111111111111111111111111111111111111");
const MARKET = new PublicKey("Stake11111111111111111111111111111111111111");
const logger: IndexerLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const servers: BackendFastifyInstance[] = [];

function unsigned(value: bigint | number, bytes: number): Buffer {
  const result = Buffer.alloc(bytes);
  if (bytes === 2) result.writeUInt16LE(Number(value));
  else if (bytes === 4) result.writeUInt32LE(Number(value));
  else result.writeBigUInt64LE(BigInt(value));
  return result;
}

function signed128(value: bigint): Buffer {
  const result = Buffer.alloc(16);
  const normalized = value < 0n ? (1n << 128n) + value : value;
  result.writeBigUInt64LE(normalized & ((1n << 64n) - 1n), 0);
  result.writeBigUInt64LE(normalized >> 64n, 8);
  return result;
}

function positionOpened(): string {
  return encodeEventForTest("PositionOpened", Buffer.concat([
    POSITION.toBuffer(), OWNER.toBuffer(), MARKET.toBuffer(), Buffer.from([0]),
    unsigned(10_000_000n, 8), unsigned(4, 2), unsigned(600_000, 4),
    unsigned(66_666_666n, 8), unsigned(450_000, 4),
  ]));
}

function marketCreated(symbolHash = Buffer.alloc(32, 0xab)): string {
  return encodeEventForTest("MarketCreated", Buffer.concat([
    MARKET.toBuffer(), symbolHash, Buffer.from([0]), unsigned(600_000n, 8),
    unsigned(1_700_000_000n, 8), unsigned(1_700_003_600n, 8),
  ]));
}

function marketSettled(): string {
  return encodeEventForTest("MarketSettled", Buffer.concat([
    MARKET.toBuffer(), Buffer.from([1]), unsigned(700_000n, 8),
  ]));
}

function positionClosed(): string {
  return encodeEventForTest("PositionClosed", Buffer.concat([
    POSITION.toBuffer(), OWNER.toBuffer(), unsigned(700_000, 4), signed128(5_000_000n),
    unsigned(100_000n, 8), unsigned(14_900_000n, 8),
  ]));
}

function positionSettled(): string {
  return encodeEventForTest("PositionSettled", Buffer.concat([
    POSITION.toBuffer(), OWNER.toBuffer(), Buffer.from([1]), signed128(10_000_000n),
    unsigned(200_000n, 8), unsigned(19_800_000n, 8),
  ]));
}

function lpUpdated(): string {
  return encodeEventForTest("LpUpdated", Buffer.concat([signed128(500_000_000n), unsigned(3_000_000n, 8)]));
}

async function makeServer(secret = "test-secret"): Promise<{ server: BackendFastifyInstance; indexer: IndexerService }> {
  const indexer = new IndexerService({ databasePath: ":memory:", webhookSecret: secret, programId: PROGRAM_ID, reconciliationEnabled: false, logger });
  const instance = Fastify({ loggerInstance: pino({ level: "silent" }) }) as unknown as BackendFastifyInstance;
  await registerIndexerRoutes(instance, indexer);
  await instance.ready();
  servers.push(instance);
  return { server: instance, indexer };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("QuickNode Streams indexer", () => {
  it("applies the provenance and durable inbox migration", async () => {
    const { indexer } = await makeServer();
    expect(indexer.store.database.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([{ version: 1 }, { version: 2 }]);
    expect((indexer.store.database.pragma("table_info(events)") as Array<{ name: string }>).map((column) => column.name)).toContain("provenance");
    expect(indexer.store.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stream_delivery_inbox'").get())
      .toEqual({ name: "stream_delivery_inbox" });
  });

  it("accepts a signed webhook immediately, projects events, and ignores redelivery", async () => {
    const { server, indexer } = await makeServer();
    const body = {
      matchedTransactions: [{
        signature: "real-devnet-shaped-signature",
        slot: 321,
        blockTime: 1_700_000_000,
        logs: [`Program ${PROGRAM_ID} invoke [1]`, positionOpened(), positionClosed(), lpUpdated(), `Program ${PROGRAM_ID} success`],
      }],
    };

    const accepted = await server.inject({ method: "POST", url: "/streams/webhook", headers: { "x-wick-stream-secret": "test-secret" }, payload: body });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual(expect.objectContaining({ accepted: true, duplicate: false, deliveryId: expect.any(String) }));
    expect((accepted.json() as { deliveryId: string }).deliveryId).toHaveLength(64);
    expect(indexer.store.database.prepare("SELECT COUNT(*) AS count FROM stream_delivery_inbox").get()).toEqual({ count: 1 });
    const durable = (await server.inject({ method: "GET", url: "/feed" })).json();
    await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));

    expect(durable.length === 0 || durable.length === 3).toBe(true);
    expect((await server.inject({ method: "GET", url: "/feed" })).json()).toEqual([
      expect.objectContaining({ provenance: "quicknode_stream" }),
      expect.objectContaining({ provenance: "quicknode_stream" }),
      expect.objectContaining({ provenance: "quicknode_stream" }),
    ]);
    expect((await server.inject({ method: "GET", url: `/positions?owner=${OWNER.toBase58()}` })).json()).toEqual([
      expect.objectContaining({ address: POSITION.toBase58(), status: "closed", realizedPnlE6: "5000000", paidE6: "14900000" }),
    ]);
    expect((await server.inject({ method: "GET", url: "/leaderboard" })).json()).toEqual([
      { rank: 1, owner: OWNER.toBase58(), pnlE6: "5000000", trades: 1, liquidations: 0 },
    ]);
    expect((await server.inject({ method: "GET", url: "/lp/history" })).json()).toEqual([
      expect.objectContaining({ balanceE6: "500000000", queueOwedE6: "3000000", feesE6: "100000" }),
    ]);

    const duplicate = await server.inject({ method: "POST", url: "/streams/webhook", headers: { "x-wick-stream-secret": "test-secret" }, payload: body });
    expect(duplicate.json()).toEqual(expect.objectContaining({ accepted: true, duplicate: true }));
    await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
    expect((await server.inject({ method: "GET", url: "/feed" })).json()).toHaveLength(3);
    expect(indexer.store.database.prepare("SELECT COUNT(*) AS count FROM stream_delivery_inbox").get()).toEqual({ count: 1 });
    expect(indexer.store.database.prepare("SELECT status, attempts, last_error AS lastError FROM stream_delivery_inbox").get())
      .toEqual({ status: "complete", attempts: 1, lastError: null });
    expect(server.printRoutes()).toContain("events/stream");
  });

  it("normalizes generated-IDL enums and projects a bytes32 symbol hash as hex", async () => {
    const { indexer } = await makeServer();
    expect(indexer.store.decoder.decodeLog(positionOpened())?.data.side).toBe("yes");
    expect(indexer.store.decoder.decodeLog(marketCreated())?.data.kind).toBe("up_down");

    expect(indexer.store.processTransactions([{
      signature: "generated-idl-market",
      slot: 350,
      blockTime: 1_700_000_000,
      logs: [`Program ${PROGRAM_ID} invoke [1]`, marketCreated(), `Program ${PROGRAM_ID} success`],
    }], "quicknode_stream")).toBe(1);
    expect(indexer.store.database.prepare("SELECT symbol_hash AS symbolHash, kind FROM markets WHERE address=?").get(MARKET.toBase58()))
      .toEqual({ symbolHash: "ab".repeat(32), kind: "up_down" });
  });

  it("replays terminal events that arrived before their create events without regressing state", async () => {
    const { indexer } = await makeServer();
    expect(indexer.store.processTransactions([
      {
        signature: "close-arrived-first",
        slot: 502,
        blockTime: 1_700_000_002,
        logs: [`Program ${PROGRAM_ID} invoke [1]`, positionClosed(), `Program ${PROGRAM_ID} success`],
      },
      {
        signature: "settle-arrived-first",
        slot: 503,
        blockTime: 1_700_000_003,
        logs: [`Program ${PROGRAM_ID} invoke [1]`, marketSettled(), `Program ${PROGRAM_ID} success`],
      },
    ], "quicknode_stream")).toBe(2);
    expect(indexer.store.positions()).toEqual([]);

    expect(indexer.store.processTransactions([
      {
        signature: "create-gap-fill",
        slot: 500,
        blockTime: 1_700_000_000,
        logs: [`Program ${PROGRAM_ID} invoke [1]`, marketCreated(), `Program ${PROGRAM_ID} success`],
      },
      {
        signature: "open-gap-fill",
        slot: 501,
        blockTime: 1_700_000_001,
        logs: [`Program ${PROGRAM_ID} invoke [1]`, positionOpened(), `Program ${PROGRAM_ID} success`],
      },
    ], "rpc_reconcile")).toBe(2);
    expect(indexer.store.positions()).toEqual([
      expect.objectContaining({ address: POSITION.toBase58(), status: "closed", realizedPnlE6: "5000000", paidE6: "14900000" }),
    ]);
    expect(indexer.store.database.prepare("SELECT status, outcome, settlement_value_e6 AS settlementValueE6 FROM markets WHERE address=?").get(MARKET.toBase58()))
      .toEqual({ status: "settled", outcome: "yes", settlementValueE6: "700000" });
  });

  it("decodes only Program data emitted while Wick owns the active invocation", async () => {
    const { indexer } = await makeServer();
    const other = "11111111111111111111111111111111";
    const count = indexer.store.processTransactions([{
      signature: "mixed-program-transaction",
      slot: 400,
      blockTime: 1_700_000_001,
      logs: [
        `Program ${other} invoke [1]`, positionOpened(), `Program ${other} success`,
        `Program ${PROGRAM_ID} invoke [1]`, positionOpened(), `Program ${other} invoke [2]`, positionClosed(), `Program ${other} success`, lpUpdated(), `Program ${PROGRAM_ID} success`,
      ],
    }], "rpc_reconcile");
    expect(count).toBe(2);
    expect(indexer.store.feed(10).map((event) => event.name)).toEqual(["LpUpdated", "PositionOpened"]);
    expect(indexer.store.feed(10).every((event) => event.provenance === "rpc_reconcile")).toBe(true);
  });

  it("projects a profitable settlement fee into LP history exactly once", async () => {
    const { server, indexer } = await makeServer();
    const transaction = {
      signature: "profitable-settlement",
      slot: 399,
      blockTime: 1_700_000_001,
      logs: [
        `Program ${PROGRAM_ID} invoke [1]`,
        positionOpened(),
        positionSettled(),
        lpUpdated(),
        `Program ${PROGRAM_ID} success`,
      ],
    };

    expect(indexer.store.processTransactions([transaction], "quicknode_stream")).toBe(3);
    expect(indexer.store.processTransactions([transaction], "rpc_reconcile")).toBe(0);
    expect((await server.inject({ method: "GET", url: `/positions?owner=${OWNER.toBase58()}` })).json()).toEqual([
      expect.objectContaining({ status: "settled", realizedPnlE6: "10000000", paidE6: "19800000" }),
    ]);
    expect((await server.inject({ method: "GET", url: "/lp/history" })).json()).toEqual([
      expect.objectContaining({ feesE6: "200000", signature: "profitable-settlement" }),
    ]);
    expect(indexer.store.feed(3).find((event) => event.name === "PositionSettled")?.data).toEqual(
      expect.objectContaining({ feeE6: "200000", pnlE6: "10000000", paidE6: "19800000" }),
    );
  });

  it("upgrades reconciled events to Stream provenance on authenticated redelivery", async () => {
    const { indexer } = await makeServer();
    const transaction = {
      signature: "reconciled-then-streamed",
      slot: 401,
      blockTime: 1_700_000_002,
      logs: [`Program ${PROGRAM_ID} invoke [1]`, positionOpened(), `Program ${PROGRAM_ID} success`],
    };
    expect(indexer.store.processTransactions([transaction], "rpc_reconcile")).toBe(1);
    expect(indexer.store.feed(1)[0]?.provenance).toBe("rpc_reconcile");
    expect(indexer.store.processTransactions([transaction], "quicknode_stream")).toBe(0);
    expect(indexer.store.feed(1)[0]?.provenance).toBe("quicknode_stream");
    expect(indexer.health(1_700_000_003_000)).toMatchObject({ streamEvidencePresent: true, streamEventAgeMs: 1_000 });
  });

  it("retains failed durable deliveries for a successful retry", async () => {
    const { indexer } = await makeServer();
    const delivery = { matchedTransactions: [{
      signature: "durable-retry",
      slot: 402,
      blockTime: 1_700_000_003,
      logs: [`Program ${PROGRAM_ID} invoke [1]`, positionOpened(), `Program ${PROGRAM_ID} success`],
    }] };
    indexer.store.enqueueStreamDelivery(delivery);
    const decode = vi.spyOn(indexer.store.decoder, "decodeLogs").mockImplementationOnce(() => { throw new Error("simulated projection failure"); });
    expect(await indexer.processPendingDeliveries()).toBe(0);
    expect(indexer.store.pendingStreamDeliveryCount()).toBe(1);
    expect(indexer.store.database.prepare("SELECT status, attempts, last_error AS lastError FROM stream_delivery_inbox").get())
      .toEqual({ status: "pending", attempts: 1, lastError: "simulated projection failure" });
    decode.mockRestore();
    expect(await indexer.processPendingDeliveries()).toBe(1);
    expect(indexer.store.pendingStreamDeliveryCount()).toBe(0);
    expect(indexer.store.database.prepare("SELECT status, attempts, last_error AS lastError FROM stream_delivery_inbox").get())
      .toEqual({ status: "complete", attempts: 2, lastError: null });
    expect(indexer.store.feed(1)[0]).toMatchObject({ signature: "durable-retry", provenance: "quicknode_stream" });
  });

  it("recovers a file-backed durable inbox after restart and remains idempotent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wick-indexer-"));
    const databasePath = join(directory, "wick.db");
    const delivery = { matchedTransactions: [{
      signature: "restart-durable-delivery",
      slot: 403,
      blockTime: 1_700_000_004,
      logs: [`Program ${PROGRAM_ID} invoke [1]`, positionOpened(), `Program ${PROGRAM_ID} success`],
    }] };
    try {
      const first = new IndexerService({ databasePath, programId: PROGRAM_ID, reconciliationEnabled: false, logger });
      expect(first.store.database.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(first.store.enqueueStreamDelivery(delivery).inserted).toBe(true);
      await first.close();

      const second = new IndexerService({ databasePath, programId: PROGRAM_ID, reconciliationEnabled: false, logger });
      expect(second.store.pendingStreamDeliveryCount()).toBe(1);
      expect(await second.processPendingDeliveries()).toBe(1);
      await second.close();

      const third = new IndexerService({ databasePath, programId: PROGRAM_ID, reconciliationEnabled: false, logger });
      expect(third.store.enqueueStreamDelivery(delivery).inserted).toBe(false);
      expect(await third.processPendingDeliveries()).toBe(0);
      expect(third.store.feed(10)).toEqual([
        expect.objectContaining({ signature: "restart-durable-delivery", name: "PositionOpened", provenance: "quicknode_stream" }),
      ]);
      expect(third.store.positions()).toEqual([
        expect.objectContaining({ address: POSITION.toBase58(), status: "open" }),
      ]);
      await third.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an invalid secret and malformed delivery", async () => {
    const { server } = await makeServer();
    expect((await server.inject({ method: "POST", url: "/streams/webhook?secret=wrong", payload: { matchedTransactions: [] } })).statusCode).toBe(401);
    expect((await server.inject({ method: "POST", url: "/streams/webhook?secret=test-secret", payload: { matchedTransactions: [{ nope: true }] } })).statusCode).toBe(400);
    expect((await server.inject({ method: "GET", url: "/feed?limit=not-a-number" })).json()).toEqual([]);
  });

  it("matches top-level and inner program instructions while skipping failed transactions", async () => {
    const source = (await readFile(resolve(process.cwd(), "../../streams/filter.js"), "utf8")).replaceAll("__PROGRAM_ID__", PROGRAM_ID);
    const context = {
      input: { data: [{ parentSlot: 100, blockTime: 1_700_000_000, transactions: [
        { transaction: { signatures: ["top"], message: { instructions: [{ programId: PROGRAM_ID }] } }, meta: { err: null, logMessages: ["Program log: top"] } },
        { transaction: { signatures: ["inner"], message: { instructions: [] } }, meta: { err: null, innerInstructions: [{ instructions: [{ programId: PROGRAM_ID }] }], logMessages: [] } },
        { transaction: { signatures: ["failed"], message: { instructions: [{ programId: PROGRAM_ID }] } }, meta: { err: { InstructionError: [0, "Custom"] } } },
        { transaction: { signatures: ["other"], message: { instructions: [{ programId: "11111111111111111111111111111111" }] } }, meta: { err: null } },
      ] }] },
      result: undefined as unknown,
    };
    vm.runInNewContext(`${source}\nresult = main(input);`, context);
    expect(context.result).toEqual({ matchedTransactions: [
      { signature: "top", slot: 101, blockTime: 1_700_000_000, logs: ["Program log: top"] },
      { signature: "inner", slot: 101, blockTime: 1_700_000_000, logs: [] },
    ] });
  });
});
