# Findings

- 2026-11-16: The repository initially contained only `README.md`; the supplied Library attachment was the authoritative `BUILD_SPEC.md` and has been added at the repository root.
- Live API observations that differ from the build specification will be recorded here with timestamps and parser changes.
- 2026-11-16 WP3 live verification: the active BTC query returned 23 events rather than the earlier 24-event snapshot. This is expected time-varying market inventory; discovery does not depend on an exact count.
- 2026-11-16 WP3 live verification: `eventTags` is `null` on at least one active hourly ladder, and upcoming reference strikes omit `strike.value` rather than returning an explicit `null`. The Zod schemas normalize null tags to `[]` and accept omitted/null strike values.
- 2026-11-16 WP3 live verification: the public WebSocket emits subscription acknowledgement `{id,status:200}`, and `bookTicker.s` is lowercase even when the requested instrument symbol is uppercase. The stream recognizes that acknowledgement and matches symbols case-insensitively while emitting the canonical requested symbol.
- 2026-11-16 WP3 live verification: a one-sided `bookTicker` used empty strings for `b` and `B`, rather than omitting them. The parser normalizes empty price/quantity strings to absent values. A near-expiry REST snapshot also briefly exposed a crossed fallback book (`sell.yes > bestAsk`); Wick preserves the raw sides but does not invent a midpoint for crossed data.
- 2026-11-16 WP3 live verification: settled BTC15M pagination reported at least 1,000 results; the captured fixture keeps the newest 20. Official `resolutionSide` and repeating-decimal settlement values parse successfully and remain the only settlement authority.
