import { PublicKey, type ConfirmedSignatureInfo, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openWickDatabase } from "../src/indexer/database.js";
import { GapReconciler, type ReconciliationRpc } from "../src/indexer/reconciler.js";
import { IndexerService } from "../src/indexer/service.js";
import type { IndexerStore } from "../src/indexer/store.js";
import type { IndexerLogger, MatchedTransaction } from "../src/indexer/types.js";

const PROGRAM_ID = new PublicKey("EBfYyDsDq4rEL9hqi7CwbM3rW1zYvBAfdRcWLdbWeMxi");
const logger: IndexerLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

function signatureInfo(signature: string): ConfirmedSignatureInfo {
  return { signature, slot: 1, err: null, memo: null, blockTime: 1_700_000_000, confirmationStatus: "confirmed" };
}

describe("indexer lifecycle boundaries", () => {
  it("paginates past 100 signatures and stops at the first stored boundary", async () => {
    const history = [
      ...Array.from({ length: 150 }, (_, index) => signatureInfo(`sig-${150 - index}`)),
      signatureInfo("known-boundary"),
      signatureInfo("older-than-boundary"),
    ];
    const signatureCalls: Array<{ limit: number; before?: string }> = [];
    const rpc: ReconciliationRpc = {
      signatures: vi.fn(async (_address, limit, before) => {
        signatureCalls.push({ limit, ...(before === undefined ? {} : { before }) });
        const start = before === undefined ? 0 : history.findIndex((item) => item.signature === before) + 1;
        return history.slice(start, start + limit);
      }),
      transaction: vi.fn(async (signature) => ({
        slot: Number(signature.slice(4)),
        blockTime: 1_700_000_000,
        meta: { logMessages: [`Program log: ${signature}`] },
      }) as ParsedTransactionWithMeta),
    };
    const processed: MatchedTransaction[][] = [];
    const store = {
      hasSignature: vi.fn((signature: string) => signature === "known-boundary"),
      processTransactions: vi.fn((transactions: MatchedTransaction[]) => {
        processed.push(transactions);
        return transactions.length;
      }),
    } as unknown as IndexerStore;

    const reconciler = new GapReconciler({ store, rpc, programId: PROGRAM_ID, logger });
    expect(await reconciler.runOnce()).toBe(150);
    expect(signatureCalls).toEqual([{ limit: 100 }, { limit: 100, before: "sig-51" }]);
    expect(processed).toHaveLength(1);
    expect(processed[0]?.map((item) => item.signature)).toEqual(
      Array.from({ length: 150 }, (_, index) => `sig-${index + 1}`),
    );
    expect(rpc.transaction).toHaveBeenCalledTimes(150);
    expect(rpc.transaction).not.toHaveBeenCalledWith("known-boundary");
    expect(rpc.transaction).not.toHaveBeenCalledWith("older-than-boundary");
  });

  it("bounds reconciliation when no stored signature is found", async () => {
    const rpc: ReconciliationRpc = {
      signatures: vi.fn(async (_address, limit, before) => {
        const start = before === undefined ? 0 : Number(before.slice(4));
        return Array.from({ length: limit }, (_, index) => signatureInfo(`sig-${start + index + 1}`));
      }),
      transaction: vi.fn(async (signature) => ({
        slot: Number(signature.slice(4)),
        blockTime: 1_700_000_000,
        meta: { logMessages: [] },
      }) as unknown as ParsedTransactionWithMeta),
    };
    const store = {
      hasSignature: () => false,
      processTransactions: vi.fn((transactions: MatchedTransaction[]) => transactions.length),
    } as unknown as IndexerStore;
    const reconciler = new GapReconciler({ store, rpc, programId: PROGRAM_ID, logger, pageSize: 2, maxPages: 3 });

    expect(await reconciler.runOnce()).toBe(6);
    expect(rpc.signatures).toHaveBeenCalledTimes(3);
    expect(rpc.transaction).toHaveBeenCalledTimes(6);
  });

  it("drains a webhook-scheduled durable delivery before closing the database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wick-indexer-lifecycle-"));
    const databasePath = join(directory, "wick.sqlite");
    const indexer = new IndexerService({ databasePath, logger, reconciliationEnabled: false });
    try {
      indexer.store.enqueueStreamDelivery({ matchedTransactions: [] });
      indexer.schedulePendingDeliveries();
      await indexer.close();

      const database = openWickDatabase(databasePath);
      try {
        expect(database.prepare("SELECT status, attempts FROM stream_delivery_inbox").get())
          .toEqual({ status: "complete", attempts: 1 });
      } finally {
        database.close();
      }
    } finally {
      await indexer.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
