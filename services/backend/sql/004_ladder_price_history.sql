BEGIN;

ALTER TABLE wick_market_data.market_theo_minutes
  ADD COLUMN gemini_mid double precision CHECK (gemini_mid BETWEEN 0 AND 1),
  ADD COLUMN gemini_bid double precision CHECK (gemini_bid BETWEEN 0 AND 1),
  ADD COLUMN gemini_ask double precision CHECK (gemini_ask BETWEEN 0 AND 1);

CREATE INDEX market_theo_minutes_ladder_expiry_idx
  ON wick_market_data.market_theo_minutes (expiry_at, symbol) WHERE model = 'ladder_v1';

COMMIT;
