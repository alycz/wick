import { PublicKey } from "@solana/web3.js";
import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
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

function positionClosed(): string {
  return encodeEventForTest("PositionClosed", Buffer.concat([
    POSITION.toBuffer(), OWNER.toBuffer(), unsigned(700_000, 4), signed128(5_000_000n),
    unsigned(100_000n, 8), unsigned(14_900_000n, 8),
  ]));
}

function lpUpdated(): string {
  return encodeEventForTest("LpUpdated", Buffer.concat([signed128(500_000_000n), unsigned(3_000_000n, 8)]));
}

async function makeServer(secret = "test-secret"): Promise<{ server: BackendFastifyInstance; indexer: IndexerService }> {
  const indexer = new IndexerService({ databasePath: ":memory:", webhookSecret: secret, logger });
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
  it("accepts a signed webhook immediately, projects events, and ignores redelivery", async () => {
    const { server } = await makeServer();
    const body = {
      matchedTransactions: [{
        signature: "real-devnet-shaped-signature",
        slot: 321,
        blockTime: 1_700_000_000,
        logs: [positionOpened(), positionClosed(), lpUpdated()],
      }],
    };

    const accepted = await server.inject({ method: "POST", url: "/streams/webhook", headers: { "x-wick-stream-secret": "test-secret" }, payload: body });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ accepted: true });
    await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));

    expect((await server.inject({ method: "GET", url: "/feed" })).json()).toHaveLength(3);
    expect((await server.inject({ method: "GET", url: `/positions?owner=${OWNER.toBase58()}` })).json()).toEqual([
      expect.objectContaining({ address: POSITION.toBase58(), status: "closed", realizedPnlE6: "5000000", paidE6: "14900000" }),
    ]);
    expect((await server.inject({ method: "GET", url: "/leaderboard" })).json()).toEqual([
      { rank: 1, owner: OWNER.toBase58(), pnlE6: "5000000", trades: 1, liquidations: 0 },
    ]);
    expect((await server.inject({ method: "GET", url: "/lp/history" })).json()).toEqual([
      expect.objectContaining({ balanceE6: "500000000", queueOwedE6: "3000000", feesE6: "100000" }),
    ]);

    await server.inject({ method: "POST", url: "/streams/webhook", headers: { "x-wick-stream-secret": "test-secret" }, payload: body });
    await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
    expect((await server.inject({ method: "GET", url: "/feed" })).json()).toHaveLength(3);
    expect(server.printRoutes()).toContain("events/stream");
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
