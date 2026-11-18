BEGIN;

CREATE TABLE wick_market_data.ladder_theo_replays (
  sampled_at timestamptz NOT NULL,
  symbol text NOT NULL,
  option_captured_at timestamptz NOT NULL,
  theo double precision NOT NULL CHECK (theo BETWEEN 0 AND 1),
  PRIMARY KEY (sampled_at, symbol),
  FOREIGN KEY (sampled_at, symbol)
    REFERENCES wick_market_data.market_theo_minutes (sampled_at, symbol) ON DELETE CASCADE
);

GRANT SELECT, INSERT ON wick_market_data.ladder_theo_replays TO wick_market_writer;
ALTER TABLE wick_market_data.ladder_theo_replays ENABLE ROW LEVEL SECURITY;
CREATE POLICY market_writer ON wick_market_data.ladder_theo_replays
  TO wick_market_writer USING (true) WITH CHECK (true);

COMMIT;
