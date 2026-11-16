# Findings

- 2026-11-16: The repository initially contained only `README.md`; the supplied Library attachment was the authoritative `BUILD_SPEC.md` and has been added at the repository root.
- Live API observations that differ from the build specification will be recorded here with timestamps and parser changes.

## WP4 live volatility-source verification — 2026-11-16 22:53 UTC

- Deribit public REST returned spot `65351.26`, 982 live BTC option instruments/book summaries, and `mark_iv` as percentage points (for example `50.33`, parsed as `0.5033`). The implemented surface joined summaries to instrument expiries/strikes and produced 491 unique strike points over 11 expiries. A real `markprice.options.btc_usd` + `deribit_price_index.btc_usd` WebSocket check remained healthy after eight seconds, beyond the five-second staleness threshold.
- Derive v3 `public/get_all_instruments` and `public/get_tickers` return a JSON-RPC-style top-level `{id,result}` envelope even when called with the documented plain request body. `result.tickers` is a map keyed by instrument name. The current v3 ticker uses compact fields: spot `I`, mark `M`, timestamp `t`, and `option_pricing.{i,bi,ai,f}` for mark IV, bid IV, ask IV, and forward. The parser uses mark IV when positive, then a bid/ask IV midpoint fallback. Live verification returned spot `65349` and 54 usable points over the nearest two expiries.
- Both providers were healthy in the no-proxy live check. No specification-breaking disagreement was found; the compact Derive v3 field names are now explicitly parsed rather than assuming verbose names.
