BEGIN;

ALTER TABLE wick_market_data.up_down_prices
  ADD COLUMN gemini_bid double precision CHECK (gemini_bid BETWEEN 0 AND 1),
  ADD COLUMN gemini_ask double precision CHECK (gemini_ask BETWEEN 0 AND 1);

COMMIT;
