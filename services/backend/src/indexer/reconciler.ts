import { Connection, PublicKey, type ConfirmedSignatureInfo, type ParsedTransactionWithMeta } from "@solana/web3.js";
import type { IndexerStore } from "./store.js";
import type { IndexerLogger, MatchedTransaction } from "./types.js";

export interface ReconciliationRpc {
  signatures(address: PublicKey, limit: number): Promise<readonly ConfirmedSignatureInfo[]>;
  transaction(signature: string): Promise<ParsedTransactionWithMeta | null>;
}

export class SolanaReconciliationRpc implements ReconciliationRpc {
  constructor(private readonly connection: Connection) {}
  signatures(address: PublicKey, limit: number) { return this.connection.getSignaturesForAddress(address, { limit }, "confirmed"); }
  transaction(signature: string) { return this.connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }); }
}

export class GapReconciler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  constructor(private readonly options: { store: IndexerStore; rpc: ReconciliationRpc; programId: PublicKey; logger: IndexerLogger; intervalMs?: number }) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), this.options.intervalMs ?? 60_000);
    this.timer.unref();
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const signatures = await this.options.rpc.signatures(this.options.programId, 100);
      const missing = signatures.filter((item) => item.err === null && !this.options.store.hasSignature(item.signature)).reverse();
      const transactions: MatchedTransaction[] = [];
      for (const item of missing) {
        const transaction = await this.options.rpc.transaction(item.signature);
        if (!transaction?.meta?.logMessages) continue;
        transactions.push({ signature: item.signature, slot: transaction.slot, blockTime: transaction.blockTime ?? item.blockTime ?? 0, logs: transaction.meta.logMessages });
      }
      const inserted = this.options.store.processTransactions(transactions, "rpc_reconcile");
      if (missing.length > 0) this.options.logger.info({ signatures: missing.length, inserted }, "label=gap-filler reconciled Wick signatures");
      return inserted;
    } catch (error) {
      this.options.logger.warn({ error: error instanceof Error ? error.message : String(error) }, "label=gap-filler reconciliation failed");
      return 0;
    } finally { this.running = false; }
  }
}
