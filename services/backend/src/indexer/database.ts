import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS events (
    signature TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    slot INTEGER NOT NULL,
    block_time INTEGER NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (signature, event_index)
  );
  CREATE INDEX IF NOT EXISTS events_block_time_idx ON events(block_time DESC);
  CREATE INDEX IF NOT EXISTS events_name_idx ON events(name, block_time DESC);

  CREATE TABLE IF NOT EXISTS positions (
    address TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    market TEXT NOT NULL,
    side TEXT NOT NULL,
    margin_e6 TEXT NOT NULL,
    leverage INTEGER NOT NULL,
    entry_e6 INTEGER NOT NULL,
    contracts_e6 TEXT NOT NULL,
    liq_mark_e6 INTEGER NOT NULL,
    status TEXT NOT NULL,
    realized_pnl_e6 TEXT,
    paid_e6 TEXT,
    opened_block_time INTEGER NOT NULL,
    updated_block_time INTEGER NOT NULL,
    signature TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS positions_owner_idx ON positions(owner, updated_block_time DESC);
  CREATE INDEX IF NOT EXISTS positions_status_idx ON positions(status, updated_block_time DESC);

  CREATE TABLE IF NOT EXISTS markets (
    address TEXT PRIMARY KEY,
    symbol_hash TEXT NOT NULL,
    kind TEXT NOT NULL,
    strike_usd_e6 TEXT NOT NULL,
    open_ts INTEGER NOT NULL,
    expiry_ts INTEGER NOT NULL,
    status TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'none',
    settlement_value_e6 TEXT,
    updated_block_time INTEGER NOT NULL,
    signature TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payout_claims (
    address TEXT PRIMARY KEY,
    claim_index TEXT NOT NULL,
    owner TEXT NOT NULL,
    amount_e6 TEXT NOT NULL,
    paid_e6 TEXT NOT NULL DEFAULT '0',
    status TEXT NOT NULL DEFAULT 'queued',
    updated_block_time INTEGER NOT NULL,
    signature TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lp_snapshots (
    signature TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    block_time INTEGER NOT NULL,
    balance_e6 TEXT NOT NULL,
    queue_owed_e6 TEXT NOT NULL,
    fees_e6 TEXT NOT NULL DEFAULT '0',
    PRIMARY KEY (signature, event_index)
  );
  CREATE INDEX IF NOT EXISTS lp_snapshots_time_idx ON lp_snapshots(block_time ASC);

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE events ADD COLUMN provenance TEXT NOT NULL DEFAULT 'rpc_reconcile'
    CHECK (provenance IN ('quicknode_stream', 'rpc_reconcile'));
  CREATE INDEX IF NOT EXISTS events_provenance_time_idx ON events(provenance, block_time DESC);

  CREATE TABLE IF NOT EXISTS stream_delivery_inbox (
    delivery_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    received_at INTEGER NOT NULL,
    processed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS stream_delivery_inbox_status_idx
    ON stream_delivery_inbox(status, received_at ASC);
  `,
];

export type WickDatabase = Database.Database;

export function openWickDatabase(path: string): WickDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = FULL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = database.prepare("SELECT version FROM schema_migrations").all().map((row) => (row as { version: number }).version);
  const migrate = database.transaction(() => {
    for (const [version, sql] of MIGRATIONS.entries()) {
      if (applied.includes(version + 1)) continue;
      database.exec(sql);
      database.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(version + 1, Date.now());
    }
  });
  migrate();
  return database;
}
