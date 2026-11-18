BEGIN;

CREATE TABLE wick_market_data.up_down_theo_replays (
  symbol text NOT NULL,
  bucket bigint NOT NULL,
  option_captured_at timestamptz NOT NULL,
  theo double precision NOT NULL CHECK (theo BETWEEN 0 AND 1),
  PRIMARY KEY (symbol, bucket),
  FOREIGN KEY (symbol, bucket) REFERENCES wick_market_data.up_down_prices (symbol, bucket) ON DELETE CASCADE
);

CREATE TABLE wick_market_data.ladder_history_backfills (
  symbol text NOT NULL,
  sampled_at timestamptz NOT NULL,
  priced_at timestamptz NOT NULL,
  option_captured_at timestamptz NOT NULL CHECK (option_captured_at <= priced_at),
  expiry_at timestamptz NOT NULL CHECK (priced_at < expiry_at),
  strike double precision NOT NULL CHECK (strike > 0),
  spot double precision NOT NULL CHECK (spot > 0),
  theo double precision NOT NULL CHECK (theo BETWEEN 0 AND 1),
  PRIMARY KEY (symbol, sampled_at)
);
CREATE INDEX ladder_history_backfills_expiry_idx ON wick_market_data.ladder_history_backfills (expiry_at);
ALTER TABLE wick_market_data.up_down_theo_replays ENABLE ROW LEVEL SECURITY;
ALTER TABLE wick_market_data.ladder_history_backfills ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON wick_market_data.up_down_theo_replays TO wick_market_writer;
GRANT SELECT, INSERT, DELETE ON wick_market_data.ladder_history_backfills TO wick_market_writer;
CREATE POLICY market_writer ON wick_market_data.up_down_theo_replays TO wick_market_writer USING (true) WITH CHECK (true);
CREATE POLICY market_writer ON wick_market_data.ladder_history_backfills TO wick_market_writer USING (true) WITH CHECK (true);

COMMIT;
