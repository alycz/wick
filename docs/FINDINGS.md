# Findings

- 2026-11-16: The repository initially contained only `README.md`; the supplied Library attachment was the authoritative `BUILD_SPEC.md` and has been added at the repository root.
- Live API observations that differ from the build specification will be recorded here with timestamps and parser changes.
## WP4 live volatility-source verification — 2026-11-16 22:53 UTC

- Deribit public REST returned spot `65351.26`, 982 live BTC option instruments/book summaries, and `mark_iv` as percentage points (for example `50.33`, parsed as `0.5033`). The implemented surface joined summaries to instrument expiries/strikes and produced 491 unique strike points over 11 expiries. A real `markprice.options.btc_usd` + `deribit_price_index.btc_usd` WebSocket check remained healthy after eight seconds, beyond the five-second staleness threshold.
- Derive v3 `public/get_all_instruments` and `public/get_tickers` return a JSON-RPC-style top-level `{id,result}` envelope even when called with the documented plain request body. `result.tickers` is a map keyed by instrument name. The current v3 ticker uses compact fields: spot `I`, mark `M`, timestamp `t`, and `option_pricing.{i,bi,ai,f}` for mark IV, bid IV, ask IV, and forward. The parser uses mark IV when positive, then a bid/ask IV midpoint fallback. Live verification returned spot `65349` and 54 usable points over the nearest two expiries.
- Both providers were healthy in the no-proxy live check. No specification-breaking disagreement was found; the compact Derive v3 field names are now explicitly parsed rather than assuming verbose names.

## WP3 live Gemini verification — 2026-11-16

- 2026-11-16 WP3 live verification: the active BTC query returned 23 events rather than the earlier 24-event snapshot. This is expected time-varying market inventory; discovery does not depend on an exact count.
- 2026-11-16 WP3 live verification: `eventTags` is `null` on at least one active hourly ladder, and upcoming reference strikes omit `strike.value` rather than returning an explicit `null`. The Zod schemas normalize null tags to `[]` and accept omitted/null strike values.
- 2026-11-16 WP3 live verification: the public WebSocket emits subscription acknowledgement `{id,status:200}`, and `bookTicker.s` is lowercase even when the requested instrument symbol is uppercase. The stream recognizes that acknowledgement and matches symbols case-insensitively while emitting the canonical requested symbol.
- 2026-11-16 WP3 live verification: a one-sided `bookTicker` used empty strings for `b` and `B`, rather than omitting them. The parser normalizes empty price/quantity strings to absent values. A near-expiry REST snapshot also briefly exposed a crossed fallback book (`sell.yes > bestAsk`); Wick preserves the raw sides but does not invent a midpoint for crossed data.
- 2026-11-16 WP3 live verification: settled BTC15M pagination reported at least 1,000 results; the captured fixture keeps the newest 20. Official `resolutionSide` and repeating-decimal settlement values parse successfully and remain the only settlement authority.

## WP5 live backend verification — 2026-11-16

- Active BTC events included contracts with `marketState: "post_only"`, in addition to the documented `open|closed` states. The strict parser now accepts `open|post_only|closed`; discovery still relies on event status, strike type, asset, and expiry, and never treats `post_only` as a settlement signal.
- After adapting the parser, the real read-only backend reached `ok: true` with Deribit active and healthy, returned 44 currently selected Gemini contracts across eight selected events, and exposed fresh marks through `/markets`. `/health` correctly reported `chainConfigured: false`; no on-chain mark or settlement was claimed.
