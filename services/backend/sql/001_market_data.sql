BEGIN;

CREATE SCHEMA IF NOT EXISTS wick_market_data;
REVOKE ALL ON SCHEMA wick_market_data FROM PUBLIC;

CREATE TABLE IF NOT EXISTS wick_market_data.up_down_contracts (
  symbol text PRIMARY KEY,
  duration text NOT NULL,
  strike double precision NOT NULL CHECK (strike > 0),
  open_ts bigint NOT NULL,
  expiry_ts bigint NOT NULL CHECK (expiry_ts > open_ts)
);

CREATE INDEX IF NOT EXISTS up_down_contracts_expiry_idx
  ON wick_market_data.up_down_contracts (expiry_ts DESC, symbol);

-- Timestamps are Unix milliseconds. The bucket matches Wick's existing archive.
CREATE TABLE IF NOT EXISTS wick_market_data.up_down_prices (
  symbol text NOT NULL REFERENCES wick_market_data.up_down_contracts (symbol) ON DELETE CASCADE,
  bucket bigint NOT NULL,
  ts bigint NOT NULL,
  theo double precision NOT NULL CHECK (theo BETWEEN 0 AND 1),
  spot double precision NOT NULL CHECK (spot > 0),
  gemini_mid double precision CHECK (gemini_mid BETWEEN 0 AND 1),
  PRIMARY KEY (symbol, bucket)
);

CREATE TABLE IF NOT EXISTS wick_market_data.option_chain_snapshots (
  instrument_name text NOT NULL,
  sampled_at timestamptz NOT NULL,
  provider_at timestamptz,
  expires_at timestamptz NOT NULL,
  strike double precision NOT NULL CHECK (strike > 0),
  option_type text NOT NULL CHECK (option_type IN ('call', 'put')),
  quote_currency text NOT NULL,
  bid_price double precision CHECK (bid_price >= 0),
  ask_price double precision CHECK (ask_price >= 0),
  mark_price double precision CHECK (mark_price >= 0),
  mark_iv_pct double precision CHECK (mark_iv_pct > 0),
  underlying_price double precision CHECK (underlying_price > 0),
  PRIMARY KEY (instrument_name, sampled_at)
);

CREATE INDEX IF NOT EXISTS option_chain_snapshots_sampled_at_idx
  ON wick_market_data.option_chain_snapshots (sampled_at);

CREATE ROLE wick_market_writer NOLOGIN;
GRANT USAGE ON SCHEMA wick_market_data TO wick_market_writer;
GRANT SELECT, INSERT, DELETE ON wick_market_data.up_down_contracts TO wick_market_writer;
GRANT SELECT, INSERT ON wick_market_data.up_down_prices TO wick_market_writer;
GRANT SELECT, INSERT, DELETE ON wick_market_data.option_chain_snapshots TO wick_market_writer;

ALTER TABLE wick_market_data.up_down_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wick_market_data.up_down_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE wick_market_data.option_chain_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_writer ON wick_market_data.up_down_contracts
  TO wick_market_writer USING (true) WITH CHECK (true);
CREATE POLICY market_writer ON wick_market_data.up_down_prices
  TO wick_market_writer USING (true) WITH CHECK (true);
CREATE POLICY market_writer ON wick_market_data.option_chain_snapshots
  TO wick_market_writer USING (true) WITH CHECK (true);

COMMIT;
