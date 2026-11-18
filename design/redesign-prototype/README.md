# Wick redesign prototype

A clickable, self-contained prototype of the redesigned Wick UI (Markets Easy/Pro, Portfolio, Pool, Leaderboard, Stats, deposit/withdraw). Prices are simulated in the page; nothing talks to the backend.

Open it with any static server from this folder:

```sh
python3 -m http.server 8765
# then visit http://localhost:8765/
```

- `index.html`: the whole prototype (markup, styles, simulated data, interactions).
- `charts.js`: Liveline and TradingView (lightweight-charts) charts, bundled from `src/charts.jsx` with esbuild.
- `skullet.js`: skeleton loading from the `skullet` package (`measureSkeleton`, `drawSkeleton`).
- `*.jpg`: screenshots of today's app, shown by the "Today's version of this page" toggle.

This is the design reference for porting the redesign into `app/`; it is not wired into the Next.js build.
