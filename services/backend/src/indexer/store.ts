import { EventEmitter } from "node:events";
import type { WickDatabase } from "./database.js";
import type { DecodedProgramEvent, MatchedTransaction, StoredEvent } from "./types.js";
import { WickEventDecoder } from "./decoder.js";

const text = (value: unknown): string => String(value ?? "");
const number = (value: unknown): number => Number(value ?? 0);

export interface ChainPositionRow {
  address: string; owner: string; market: string; side: string; marginE6: string; leverage: number;
  entryE6: number; contractsE6: string; liqMarkE6: number; status: string;
}
export interface ChainMarketRow {
  address: string; symbolHash: string; kind: string; strikeUsdE6: string; openTs: number; expiryTs: number;
  status: string; outcome: string; settlementValueE6: string;
}

export class IndexerStore {
  private readonly emitter = new EventEmitter();
  private readonly insertEvent;
  private readonly ingestTransaction;

  constructor(readonly database: WickDatabase, readonly decoder = new WickEventDecoder()) {
    this.insertEvent = database.prepare(`INSERT OR IGNORE INTO events
      (signature, event_index, slot, block_time, name, data) VALUES (?, ?, ?, ?, ?, ?)`);
    this.ingestTransaction = database.transaction((transaction: MatchedTransaction) => {
      const decoded = this.decoder.decodeLogs(transaction.logs);
      const inserted: StoredEvent[] = [];
      for (const [eventIndex, event] of decoded.entries()) {
        const result = this.insertEvent.run(transaction.signature, eventIndex, transaction.slot, transaction.blockTime, event.name, JSON.stringify(event.data));
        if (result.changes === 0) continue;
        const stored: StoredEvent = { ...event, signature: transaction.signature, eventIndex, slot: transaction.slot, blockTime: transaction.blockTime };
        this.applyProjection(stored);
        inserted.push(stored);
      }
      return inserted;
    });
  }

  processTransactions(transactions: readonly MatchedTransaction[]): number {
    let inserted = 0;
    for (const transaction of transactions) {
      const events = this.ingestTransaction(transaction);
      inserted += events.length;
      for (const event of events) this.emitter.emit("event", event);
    }
    return inserted;
  }

  onEvent(listener: (event: StoredEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  hasSignature(signature: string): boolean {
    return this.database.prepare("SELECT 1 FROM events WHERE signature = ? LIMIT 1").get(signature) !== undefined;
  }

  isEmpty(): boolean {
    const row = this.database.prepare("SELECT (SELECT COUNT(*) FROM positions) + (SELECT COUNT(*) FROM markets) AS count").get() as { count: number };
    return row.count === 0;
  }

  lastEventBlockTime(): number | undefined {
    const row = this.database.prepare("SELECT MAX(block_time) AS blockTime FROM events").get() as { blockTime: number | null };
    return row.blockTime ?? undefined;
  }

  feed(limit: number): StoredEvent[] {
    return this.database.prepare(`SELECT signature, event_index AS eventIndex, slot, block_time AS blockTime, name, data
      FROM events ORDER BY block_time DESC, slot DESC, event_index DESC LIMIT ?`).all(limit).map((row) => {
        const value = row as Omit<StoredEvent, "data"> & { data: string };
        return { ...value, data: JSON.parse(value.data) as Record<string, unknown> };
      });
  }

  positions(owner?: string): Record<string, unknown>[] {
    const sql = `SELECT address, owner, market, side, margin_e6 AS marginE6, leverage, entry_e6 AS entryE6,
      contracts_e6 AS contractsE6, liq_mark_e6 AS liqMarkE6, status, realized_pnl_e6 AS realizedPnlE6,
      paid_e6 AS paidE6, opened_block_time AS openedBlockTime, updated_block_time AS updatedBlockTime, signature
      FROM positions ${owner ? "WHERE owner = ?" : ""} ORDER BY updated_block_time DESC`;
    return (owner ? this.database.prepare(sql).all(owner) : this.database.prepare(sql).all()) as Record<string, unknown>[];
  }

  leaderboard(): Record<string, unknown>[] {
    const totals = new Map<string, { owner: string; pnlE6: bigint; trades: number; liquidations: number }>();
    for (const row of this.database.prepare("SELECT owner, realized_pnl_e6 AS pnl, status FROM positions WHERE realized_pnl_e6 IS NOT NULL").all() as Array<{ owner: string; pnl: string; status: string }>) {
      const total = totals.get(row.owner) ?? { owner: row.owner, pnlE6: 0n, trades: 0, liquidations: 0 };
      total.pnlE6 += BigInt(row.pnl);
      total.trades += 1;
      if (row.status === "liquidated") total.liquidations += 1;
      totals.set(row.owner, total);
    }
    return [...totals.values()].sort((left, right) => left.pnlE6 > right.pnlE6 ? -1 : left.pnlE6 < right.pnlE6 ? 1 : 0)
      .slice(0, 100).map((row, rank) => ({ rank: rank + 1, owner: row.owner, pnlE6: row.pnlE6.toString(), trades: row.trades, liquidations: row.liquidations }));
  }

  lpHistory(): Record<string, unknown>[] {
    return this.database.prepare(`SELECT block_time AS blockTime, balance_e6 AS balanceE6,
      queue_owed_e6 AS queueOwedE6, fees_e6 AS feesE6, signature
      FROM lp_snapshots ORDER BY block_time ASC, event_index ASC`).all() as Record<string, unknown>[];
  }

  payoutClaims(owner?: string): Record<string, unknown>[] {
    const query = `SELECT address, claim_index AS claimIndex, owner, amount_e6 AS amountE6, paid_e6 AS paidE6,
      status, updated_block_time AS updatedBlockTime, signature FROM payout_claims ${owner ? "WHERE owner = ?" : ""}
      ORDER BY CAST(claim_index AS INTEGER) ASC`;
    return (owner ? this.database.prepare(query).all(owner) : this.database.prepare(query).all()) as Record<string, unknown>[];
  }

  replaceChainState(positions: readonly ChainPositionRow[], markets: readonly ChainMarketRow[], now = Math.floor(Date.now() / 1_000)): void {
    this.database.transaction(() => {
      const position = this.database.prepare(`INSERT INTO positions
        (address, owner, market, side, margin_e6, leverage, entry_e6, contracts_e6, liq_mark_e6, status,
         opened_block_time, updated_block_time, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chain-rebuild')
        ON CONFLICT(address) DO UPDATE SET owner=excluded.owner, market=excluded.market, side=excluded.side,
        margin_e6=excluded.margin_e6, leverage=excluded.leverage, entry_e6=excluded.entry_e6,
        contracts_e6=excluded.contracts_e6, liq_mark_e6=excluded.liq_mark_e6, status=excluded.status,
        updated_block_time=excluded.updated_block_time, signature=excluded.signature`);
      for (const row of positions) position.run(row.address, row.owner, row.market, row.side, row.marginE6, row.leverage, row.entryE6, row.contractsE6, row.liqMarkE6, row.status, now, now);
      const market = this.database.prepare(`INSERT INTO markets
        (address, symbol_hash, kind, strike_usd_e6, open_ts, expiry_ts, status, outcome, settlement_value_e6, updated_block_time, signature)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chain-rebuild') ON CONFLICT(address) DO UPDATE SET
        symbol_hash=excluded.symbol_hash, kind=excluded.kind, strike_usd_e6=excluded.strike_usd_e6,
        open_ts=excluded.open_ts, expiry_ts=excluded.expiry_ts, status=excluded.status, outcome=excluded.outcome,
        settlement_value_e6=excluded.settlement_value_e6, updated_block_time=excluded.updated_block_time,
        signature=excluded.signature`);
      for (const row of markets) market.run(row.address, row.symbolHash, row.kind, row.strikeUsdE6, row.openTs, row.expiryTs, row.status, row.outcome, row.settlementValueE6, now);
    })();
  }

  private applyProjection(event: StoredEvent): void {
    const data = event.data;
    switch (event.name) {
      case "MarketCreated":
        this.database.prepare(`INSERT INTO markets
          (address, symbol_hash, kind, strike_usd_e6, open_ts, expiry_ts, status, updated_block_time, signature)
          VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?) ON CONFLICT(address) DO UPDATE SET
          symbol_hash=excluded.symbol_hash, kind=excluded.kind, strike_usd_e6=excluded.strike_usd_e6,
          open_ts=excluded.open_ts, expiry_ts=excluded.expiry_ts, status='open', updated_block_time=excluded.updated_block_time,
          signature=excluded.signature`).run(text(data.market), text(data.symbolHash), text(data.kind), text(data.strikeUsdE6), number(data.openTs), number(data.expiryTs), event.blockTime, event.signature);
        break;
      case "MarketSettled":
        this.database.prepare("UPDATE markets SET status='settled', outcome=?, settlement_value_e6=?, updated_block_time=?, signature=? WHERE address=?")
          .run(text(data.outcome), text(data.settlementValueE6), event.blockTime, event.signature, text(data.market));
        break;
      case "MarketVoided":
        this.database.prepare("UPDATE markets SET status='invalid', outcome='none', updated_block_time=?, signature=? WHERE address=?")
          .run(event.blockTime, event.signature, text(data.market));
        break;
      case "PositionOpened":
        this.database.prepare(`INSERT INTO positions
          (address, owner, market, side, margin_e6, leverage, entry_e6, contracts_e6, liq_mark_e6, status,
           opened_block_time, updated_block_time, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
          ON CONFLICT(address) DO UPDATE SET owner=excluded.owner, market=excluded.market, side=excluded.side,
          margin_e6=excluded.margin_e6, leverage=excluded.leverage, entry_e6=excluded.entry_e6,
          contracts_e6=excluded.contracts_e6, liq_mark_e6=excluded.liq_mark_e6, status='open',
          opened_block_time=excluded.opened_block_time, updated_block_time=excluded.updated_block_time,
          signature=excluded.signature`)
          .run(text(data.position), text(data.owner), text(data.market), text(data.side), text(data.margin), number(data.leverage), number(data.entryE6), text(data.contractsE6), number(data.liqMarkE6), event.blockTime, event.blockTime, event.signature);
        break;
      case "PositionClosed":
        this.updatePosition(event, "closed", data.pnlE6, data.paidE6);
        this.addFees(data.feeE6);
        break;
      case "PositionLiquidated":
        this.updatePosition(event, "liquidated", `-${text(data.marginE6)}`, "0");
        this.addFees(data.liqFeeE6);
        break;
      case "PositionSettled":
        this.updatePosition(event, "settled", data.pnlE6, data.paidE6);
        break;
      case "ClaimQueued":
        this.database.prepare(`INSERT OR IGNORE INTO payout_claims
          (address, claim_index, owner, amount_e6, updated_block_time, signature) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(text(data.claim), text(data.index), text(data.owner), text(data.amount), event.blockTime, event.signature);
        break;
      case "ClaimPaid": {
        const current = this.database.prepare("SELECT paid_e6 AS paid FROM payout_claims WHERE address=?").get(text(data.claim)) as { paid: string } | undefined;
        if (current) this.database.prepare("UPDATE payout_claims SET paid_e6=?, status=?, updated_block_time=?, signature=? WHERE address=?")
          .run((BigInt(current.paid) + BigInt(text(data.amount))).toString(), data.complete === true ? "paid" : "queued", event.blockTime, event.signature, text(data.claim));
        break;
      }
      case "LpUpdated":
        this.database.prepare(`INSERT OR IGNORE INTO lp_snapshots
          (signature, event_index, block_time, balance_e6, queue_owed_e6, fees_e6) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(event.signature, event.eventIndex, event.blockTime, text(data.balance), text(data.queueOwed), this.metadata("fees_total_e6") ?? "0");
        break;
      default:
        break;
    }
  }

  private updatePosition(event: StoredEvent, status: string, pnl: unknown, paid: unknown): void {
    this.database.prepare(`UPDATE positions SET status=?, realized_pnl_e6=?, paid_e6=?, updated_block_time=?, signature=? WHERE address=?`)
      .run(status, text(pnl), text(paid), event.blockTime, event.signature, text(event.data.position));
  }

  private addFees(value: unknown): void {
    const amount = BigInt(text(value) || "0");
    const total = BigInt(this.metadata("fees_total_e6") ?? "0") + amount;
    this.database.prepare("INSERT INTO metadata(key, value) VALUES ('fees_total_e6', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(total.toString());
  }

  private metadata(key: string): string | undefined {
    return (this.database.prepare("SELECT value FROM metadata WHERE key=?").get(key) as { value: string } | undefined)?.value;
  }
}
