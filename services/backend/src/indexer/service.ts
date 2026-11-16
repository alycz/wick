import { Connection, PublicKey } from "@solana/web3.js";
import { PUBLIC_DEVNET_RPC } from "@wick/shared";
import { rebuildChainStateIfNeeded } from "./chain-state.js";
import { openWickDatabase } from "./database.js";
import { GapReconciler, SolanaReconciliationRpc } from "./reconciler.js";
import { IndexerStore } from "./store.js";
import type { IndexerLogger } from "./types.js";

export interface IndexerServiceOptions {
  databasePath: string;
  webhookSecret?: string;
  programId?: string;
  rpcUrl?: string;
  logger: IndexerLogger;
  reconciliationIntervalMs?: number;
}

export class IndexerService {
  readonly store: IndexerStore;
  readonly webhookSecret: string | undefined;
  readonly logger: IndexerLogger;
  private readonly connection?: Connection;
  private readonly programId?: PublicKey;
  private readonly reconciler?: GapReconciler;
  private started = false;

  constructor(options: IndexerServiceOptions) {
    this.store = new IndexerStore(openWickDatabase(options.databasePath));
    this.webhookSecret = options.webhookSecret;
    this.logger = options.logger;
    if (options.programId) {
      this.programId = new PublicKey(options.programId);
      this.connection = new Connection(options.rpcUrl ?? PUBLIC_DEVNET_RPC, "confirmed");
      this.reconciler = new GapReconciler({
        store: this.store,
        rpc: new SolanaReconciliationRpc(this.connection),
        programId: this.programId,
        logger: this.logger,
        ...(options.reconciliationIntervalMs === undefined ? {} : { intervalMs: options.reconciliationIntervalMs }),
      });
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (!this.connection || !this.programId) {
      this.logger.warn({}, "indexer chain reconciliation disabled because PROGRAM_ID is not configured");
      return;
    }
    try { await rebuildChainStateIfNeeded(this.store, this.connection, this.programId, this.logger); }
    catch (error) { this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, "initial chain-state rebuild failed; Streams and gap-filler remain available"); }
    await this.reconciler?.runOnce();
    this.reconciler?.start();
  }

  health(now = Date.now()): Record<string, unknown> {
    const lastEvent = this.store.lastEventBlockTime();
    return {
      indexerConfigured: Boolean(this.webhookSecret && this.programId),
      ...(lastEvent === undefined ? {} : { indexerEventAgeMs: Math.max(0, now - lastEvent * 1_000) }),
    };
  }

  async close(): Promise<void> {
    this.reconciler?.stop();
    this.store.database.pragma("wal_checkpoint(TRUNCATE)");
    this.store.database.close();
  }
}
