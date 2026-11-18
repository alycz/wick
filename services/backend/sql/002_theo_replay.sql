BEGIN;

CREATE TABLE wick_market_data.deribit_chain_minutes (
  sampled_at timestamptz PRIMARY KEY,
  captured_at timestamptz NOT NULL,
  spot double precision NOT NULL CHECK (spot > 0),
  option_count integer NOT NULL CHECK (option_count > 0),
  encoding text NOT NULL CHECK (encoding = 'gzip-json-v1'),
  payload bytea NOT NULL
);

CREATE TABLE wick_market_data.market_theo_minutes (
  sampled_at timestamptz NOT NULL,
  symbol text NOT NULL,
  priced_at timestamptz NOT NULL,
  expiry_at timestamptz NOT NULL,
  duration text NOT NULL,
  model text NOT NULL CHECK (model IN ('up_down_v1', 'ladder_v1')),
  vol_source text NOT NULL,
  spot double precision NOT NULL CHECK (spot > 0),
  strike double precision NOT NULL CHECK (strike > 0),
  time_years double precision NOT NULL CHECK (time_years > 0),
  volatility double precision NOT NULL CHECK (volatility > 0),
  twap_window_seconds integer,
  half_width_fraction double precision,
  lower_volatility double precision,
  upper_volatility double precision,
  theo double precision NOT NULL CHECK (theo BETWEEN 0 AND 1),
  PRIMARY KEY (sampled_at, symbol),
  CHECK ((model = 'up_down_v1' AND twap_window_seconds IS NOT NULL AND twap_window_seconds >= 0
    AND half_width_fraction IS NULL AND lower_volatility IS NULL AND upper_volatility IS NULL)
    OR (model = 'ladder_v1' AND twap_window_seconds IS NULL AND half_width_fraction IS NOT NULL AND half_width_fraction > 0
    AND lower_volatility IS NOT NULL AND lower_volatility > 0 AND upper_volatility IS NOT NULL AND upper_volatility > 0))
);

CREATE INDEX market_theo_minutes_symbol_time_idx ON wick_market_data.market_theo_minutes (symbol, sampled_at DESC);

GRANT SELECT, INSERT, DELETE ON wick_market_data.deribit_chain_minutes TO wick_market_writer;
GRANT SELECT, INSERT, DELETE ON wick_market_data.market_theo_minutes TO wick_market_writer;
ALTER TABLE wick_market_data.deribit_chain_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wick_market_data.market_theo_minutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY market_writer ON wick_market_data.deribit_chain_minutes
  TO wick_market_writer USING (true) WITH CHECK (true);
CREATE POLICY market_writer ON wick_market_data.market_theo_minutes
  TO wick_market_writer USING (true) WITH CHECK (true);

COMMIT;
