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
  reconciliationEnabled?: boolean;
  inboxRetryIntervalMs?: number;
}

export class IndexerService {
  readonly store: IndexerStore;
  readonly webhookSecret: string | undefined;
  readonly logger: IndexerLogger;
  private readonly connection?: Connection;
  private readonly programId?: PublicKey;
  private readonly reconciler?: GapReconciler;
  private readonly inboxRetryIntervalMs: number;
  private inboxTimer?: ReturnType<typeof setInterval>;
  private started = false;
  private processingInbox = false;

  constructor(options: IndexerServiceOptions) {
    this.webhookSecret = options.webhookSecret;
    this.logger = options.logger;
    this.inboxRetryIntervalMs = options.inboxRetryIntervalMs ?? 5_000;
    if (options.programId) {
      this.programId = new PublicKey(options.programId);
      if (options.reconciliationEnabled !== false) this.connection = new Connection(options.rpcUrl ?? PUBLIC_DEVNET_RPC, "confirmed");
    }
    this.store = new IndexerStore(openWickDatabase(options.databasePath), undefined, this.programId?.toBase58());
    if (this.connection && this.programId) {
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
    await this.processPendingDeliveries();
    this.inboxTimer = setInterval(() => { void this.processPendingDeliveries(); }, this.inboxRetryIntervalMs);
    this.inboxTimer.unref();
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
    const lastStreamEvent = this.store.lastEventBlockTime("quicknode_stream");
    return {
      indexerConfigured: Boolean(this.webhookSecret && this.programId),
      streamEvidencePresent: lastStreamEvent !== undefined,
      pendingStreamDeliveries: this.store.pendingStreamDeliveryCount(),
      ...(lastEvent === undefined ? {} : { indexerEventAgeMs: Math.max(0, now - lastEvent * 1_000) }),
      ...(lastStreamEvent === undefined ? {} : { streamEventAgeMs: Math.max(0, now - lastStreamEvent * 1_000) }),
    };
  }

  async processPendingDeliveries(): Promise<number> {
    if (this.processingInbox) return 0;
    this.processingInbox = true;
    let inserted = 0;
    try {
      for (const item of this.store.pendingStreamDeliveries()) {
        this.store.beginStreamDelivery(item.deliveryId);
        try {
          const count = this.store.processTransactions(item.delivery.matchedTransactions, "quicknode_stream");
          inserted += count;
          this.store.completeStreamDelivery(item.deliveryId);
          this.logger.info({ deliveryId: item.deliveryId, transactions: item.delivery.matchedTransactions.length, events: count }, "processed durable QuickNode Streams delivery");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.store.failStreamDelivery(item.deliveryId, message);
          this.logger.error({ deliveryId: item.deliveryId, error: message }, "failed to process durable QuickNode Streams delivery; retained for retry");
        }
      }
      return inserted;
    } finally {
      this.processingInbox = false;
    }
  }

  async close(): Promise<void> {
    if (this.inboxTimer) clearInterval(this.inboxTimer);
    this.reconciler?.stop();
    this.store.database.pragma("wal_checkpoint(TRUNCATE)");
    this.store.database.close();
  }
}
