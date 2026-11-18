import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import type { MarketHistoryPoint, PricerMarket } from "@wick/shared";
import type { ChartSeries } from "@/components/wick-chart";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  markets: { markets: [] as PricerMarket[], loading: false, error: undefined as string | undefined, observedAt: undefined as number | undefined },
  health: {} as Record<string, unknown>,
  actions: {} as Record<string, unknown>,
  openPosition: vi.fn(),
  getUpDownContracts: vi.fn(),
  getLadderContracts: vi.fn(),
  archivedPrices: {} as Record<string, MarketHistoryPoint[]>,
}));

vi.mock("@/hooks/use-markets", () => ({
  useMarkets: () => state.markets,
  useHealth: () => state.health,
  useMarketHistory: (symbol: string) => ({ history: state.archivedPrices[symbol] ?? [
    { ts: Date.now() - 60_000, spot: 65_000, theo: .55, geminiMid: .54 },
    { ts: Date.now() - 30_000, spot: 65_125, theo: .61, geminiMid: .61 },
  ] }),
}));
vi.mock("@/hooks/use-wick-actions", () => ({ useWickActions: () => state.actions }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  getUpDownContracts: state.getUpDownContracts,
  getLadderContracts: state.getLadderContracts,
}));
vi.mock("@/components/wick-chart", () => ({
  WickChart: ({ historical, series, format }: { historical?: boolean; series: ChartSeries[]; format?: string }) => historical
    ? <div data-testid="historical-chart">{series.map((item) => item.data[0]?.value.toFixed(2)).join(",")}</div>
    : <div data-testid="chart" data-format={format}>
      {series.map((item) => <div key={item.id} data-testid={item.id}>{item.data.map((point) => point.value.toFixed(2)).join(",")}</div>)}
    </div>,
}));
import { MarketsPage } from "@/components/markets/markets-page";

const now = Date.now();
const base = {
  eventTicker: "BTC1D", openTs: now - 60_000, spot: 65_125, status: "open" as const, volSource: "deribit" as const,
};
const ladder: PricerMarket[] = [64_000, 65_000, 66_000].map((strike, index) => ({
  ...base, symbol: `BTC-1D-${strike}`, kind: "ladder", duration: "1d", title: `BTC above ${strike}`, strike,
  expiryTs: now + 86_400_000, theo: [.75, .61, .4][index]!,
  gemini: { bid: .59, ask: .63, mid: .61, last: .6, ts: now }, edge: .01, maxLeverage: 4,
}));
const upDown: PricerMarket = {
  ...base, symbol: "BTC-15M-UP", kind: "up_down", duration: "15m", title: "BTC up?", strike: 65_000,
  expiryTs: now + 600_000, theo: .55, gemini: { bid: .53, ask: .57, mid: .55, ts: now }, edge: 0, maxLeverage: 42,
};

describe("MarketsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    state.markets = { markets: [upDown, ...ladder], loading: false, error: undefined, observedAt: undefined };
    state.health = { health: { ok: true, chainConfigured: true, volHealthy: true, volSource: "deribit", markAgeMs: 1_000 } };
    state.actions = { client: undefined, error: "Trading backend unavailable." };
    state.archivedPrices = {};
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("explains an unconfigured backend instead of showing markets", () => {
    state.markets = { markets: [], loading: false, error: "Backend is not configured. Set NEXT_PUBLIC_BACKEND_URL to load live markets.", observedAt: undefined };
    render(<MarketsPage />);
    expect(screen.getByRole("status")).toHaveTextContent(/Backend is not configured/);
  });

  it("shows recorded Up/Down prices for the selected past contract", async () => {
    const past = { symbol: "past-btc-15m", duration: "15m", strike: 65_000, openTs: now - 900_000, expiryTs: now };
    const earlier = { ...past, symbol: "earlier-btc-15m", strike: 64_900, openTs: now - 1_800_000, expiryTs: now - 900_000 };
    state.getUpDownContracts.mockResolvedValue([past, earlier]);
    state.archivedPrices = {
      [past.symbol]: [{ ts: past.openTs, spot: 65_000, theo: .75, geminiMid: .6 }],
      [earlier.symbol]: [{ ts: earlier.openTs, spot: 64_900, theo: .55, geminiMid: .45 }],
    };
    render(<MarketsPage />);
    const details = screen.getByText("Past BTC Up/Down prices").closest("details")!;
    expect(state.getUpDownContracts).not.toHaveBeenCalled();
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByTestId("historical-chart")).toHaveTextContent(/^0\.75$/);
    fireEvent.click(screen.getByRole("button", { name: "Down" }));
    expect(screen.getByTestId("historical-chart")).toHaveTextContent(/^0\.25$/);
    fireEvent.change(screen.getByRole("combobox", { name: "Contract" }), { target: { value: earlier.symbol } });
    expect(screen.getByTestId("historical-chart")).toHaveTextContent(/^0\.45$/);
  });

  it("keeps dates and strikes separate and charts the history for the selected strike", () => {
    const later = ladder.slice(0, 2).map((item) => ({
      ...item, symbol: `next-${item.symbol}`, eventTicker: "BTC-NEXT", expiryTs: item.expiryTs + 2 * 86_400_000,
    }));
    state.markets.markets.push(...later);
    state.archivedPrices = {
      [later[0]!.symbol]: [{ ts: now - 3_600_000, spot: 65_000, theo: .76, reconstructed: true }],
      [later[1]!.symbol]: [{ ts: now - 3_600_000, spot: 65_000, theo: .32 }],
    };
    render(<MarketsPage />);
    const board = within(screen.getByRole("region", { name: "BTC markets" }));
    fireEvent.click(board.getByRole("button", { name: /Daily · 2 strikes/ }));
    const chart = within(screen.getByRole("region", { name: "Strike price chart" }));
    expect(chart.getAllByRole("option")).toHaveLength(2);
    expect(chart.getByTestId("theo")).toHaveTextContent("0.32");
    fireEvent.change(chart.getByRole("combobox", { name: "Strike" }), { target: { value: later[0]!.symbol } });
    expect(chart.getByTestId("theo")).toHaveTextContent("0.76");
    expect(chart.getByText(/reconstructed from saved Deribit options/)).toBeInTheDocument();
    fireEvent.click(within(chart.getByRole("group", { name: "Chart side" })).getByRole("button", { name: "No" }));
    expect(chart.getByTestId("theo")).toHaveTextContent("0.24");
  });

  it("pins the default strike and a manually selected strike as fair prices cross 50¢", () => {
    const page = render(<MarketsPage />);
    const strike = () => screen.getByRole("combobox", { name: "Strike" });
    const pinned = (strike() as HTMLSelectElement).value;
    const other = ladder.find((item) => item.symbol !== pinned)!;
    state.markets.markets = state.markets.markets.map((item) => ({ ...item, theo: item.symbol === other.symbol ? .50 : .80 }));
    page.rerender(<MarketsPage />);
    expect(strike()).toHaveValue(pinned);
    fireEvent.change(strike(), { target: { value: other.symbol } });
    state.markets.markets = [upDown, ...ladder];
    page.rerender(<MarketsPage />);
    expect(strike()).toHaveValue(other.symbol);
  });

  it("opens the exact linked history when pricing disappears and recovers when it returns", () => {
    const linked = ladder[0]!.symbol;
    state.archivedPrices[linked] = [{ ts: now - 1000, spot: 65_000, theo: .72 }];
    const page = render(<MarketsPage symbol={linked} />);
    state.markets.markets = [upDown, ...ladder.slice(1)];
    page.rerender(<MarketsPage symbol={linked} />);
    expect(screen.getByText(linked)).toBeInTheDocument();
    expect(screen.getByTestId("historical-chart")).toHaveTextContent("0.72");
    expect(screen.queryByRole("region", { name: "Trade" })).toBeNull();
    state.markets.markets = [upDown, ...ladder];
    page.rerender(<MarketsPage symbol={linked} />);
    expect(screen.getByRole("combobox", { name: "Strike" })).toHaveValue(linked);
    page.rerender(<MarketsPage symbol="unknown-symbol" />);
    expect(screen.getByText("unknown-symbol")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Trade" })).toBeNull();
  });

  it("follows a rolling duration tab while an expired direct link stays on that contract", () => {
    const next = { ...upDown, symbol: "BTC-15M-NEXT", theo: .76 };
    const page = render(<MarketsPage />);
    fireEvent.click(screen.getByRole("button", { name: "15m up/down" }));
    state.markets.markets = [next, ...ladder];
    page.rerender(<MarketsPage />);
    expect(within(screen.getByRole("region", { name: "Up/Down chart" })).getByText("76.0¢")).toBeInTheDocument();
    page.rerender(<MarketsPage symbol={upDown.symbol} />);
    expect(screen.getByText(upDown.symbol)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Trade" })).toBeNull();
  });

  it("uses the last fair price in a second while omitting exchange quotes", () => {
    const tick = Math.floor(now / 1000) * 1000;
    const contract = { ...ladder[0]!, theo: .40, gemini: { ts: tick, bid: .99, ask: .10 } };
    state.markets = { ...state.markets, markets: [contract], observedAt: tick };
    state.archivedPrices[contract.symbol] = [
      { ts: tick - 20_000, spot: 65_000, theo: .35, geminiBid: .80, geminiAsk: .29 },
      { ts: tick - 10_000, spot: 65_100, theo: .37, geminiBid: .36, geminiAsk: .38 },
    ];
    const page = render(<MarketsPage />);
    const chart = within(screen.getByRole("region", { name: "Strike price chart" }));
    expect(chart.queryByTestId("bid")).toBeNull();
    expect(chart.queryByTestId("ask")).toBeNull();
    state.markets = { ...state.markets, markets: [{ ...contract, theo: .41, gemini: { ts: tick - 35_000, bid: .30, ask: .34 } }], observedAt: tick + 100 };
    page.rerender(<MarketsPage />);
    expect(chart.getByTestId("theo")).toHaveTextContent(/^0.35,0.37,0.41$/);
    expect(chart.queryByTestId("bid")).toBeNull();
  });

  it("finds expired strike history by settlement date", async () => {
    const past = { symbol: "settled-65000", strike: 65_000, expiryTs: now - 86_400_000 };
    const earlier = { symbol: "settled-64000", strike: 64_000, expiryTs: now - 2 * 86_400_000 };
    state.getLadderContracts.mockResolvedValue([past, earlier]);
    state.archivedPrices = {
      [past.symbol]: [{ ts: past.expiryTs - 60_000, theo: .70, spot: 65_125 }],
      [earlier.symbol]: [{ ts: earlier.expiryTs - 60_000, theo: .54, spot: 64_120 }],
    };
    render(<MarketsPage />);
    const details = screen.getByText("Past dated BTC markets").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const archive = within(details);
    expect(await archive.findByTestId("historical-chart")).toHaveTextContent("0.70");
    fireEvent.change(archive.getByRole("combobox", { name: "Settlement date" }), { target: { value: String(earlier.expiryTs) } });
    expect(archive.getByRole("combobox", { name: "Strike" })).toHaveValue(earlier.symbol);
    expect(archive.getByTestId("historical-chart")).toHaveTextContent("0.54");
  });

  it("opens in Pro with fair prices in the strike chain", () => {
    render(<MarketsPage />);
    expect(screen.getByRole("button", { name: "Pro" })).toHaveAttribute("aria-pressed", "true");
    const chain = screen.getByRole("region", { name: "Strike chain" });
    expect(within(chain).getByText("$65,000")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Gemini quote" })).toBeNull();
    expect(within(chain).queryByRole("columnheader", { name: /^(bid|ask)$/i })).toBeNull();
    expect(screen.queryByText(/order book/i)).not.toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Trading backend unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Yes/ })).toBeDisabled();
  });

  it("marks prices stale when the confirmed mark is old", () => {
    state.health = { health: { ok: true, chainConfigured: true, volHealthy: true, volSource: "deribit", markAgeMs: 10_001 } };
    render(<MarketsPage />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("shows fresh provider prices in read-only mode", () => {
    state.health = { health: { ok: true, chainConfigured: false, volHealthy: true, volSource: "deribit", pricingAgeMs: 750 } };
    render(<MarketsPage />);
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Yes/ })).toBeDisabled();
  });

  it("labels the live 5-minute and 15-minute contracts separately", () => {
    state.markets.markets.push({ ...upDown, symbol: "BTC-5M-UP", duration: "5m", expiryTs: now + 240_000 });
    render(<MarketsPage />);
    expect(screen.getByRole("button", { name: "15m up/down" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "5m up/down" }));
    expect(within(screen.getByRole("region", { name: "Strike chain" })).getByRole("heading", { name: "5 min Up/Down" })).toBeInTheDocument();
  });

  it("plots the recorded and live fair prices for the selected Up/Down contract", () => {
    const short = { ...upDown, symbol: "BTC-5M-UP", duration: "5m", expiryTs: now + 240_000, theo: .33 } as const;
    state.markets.markets.push(short);
    state.markets.observedAt = now;
    state.archivedPrices = {
      [upDown.symbol]: [
        { ts: now - 20_000, spot: 65_100, theo: .62, geminiBid: .60, geminiAsk: .65 },
        { ts: now - 15_000, spot: 65_200, theo: .63, geminiBid: .61, geminiAsk: .66 },
      ],
      [short.symbol]: [{ ts: now - 5_000, spot: 65_125, theo: .30 }],
    };
    render(<MarketsPage />);
    fireEvent.click(screen.getByRole("button", { name: "15m up/down" }));
    const chart = within(screen.getByRole("region", { name: "Up/Down chart" }));
    expect(chart.getByTestId("theo")).toHaveTextContent("0.62,0.63,0.55");
    expect(chart.queryByTestId("bid")).toBeNull();
    expect(chart.queryByTestId("ask")).toBeNull();

    fireEvent.click(chart.getByRole("button", { name: "Down" }));
    expect(chart.getByTestId("theo")).toHaveTextContent("0.38,0.37,0.45");
    expect(chart.queryByTestId("bid")).toBeNull();
    expect(chart.queryByTestId("ask")).toBeNull();

    fireEvent.click(chart.getByRole("button", { name: "BTC spot" }));
    expect(chart.getByTestId("chart")).toHaveAttribute("data-format", "usd");
    fireEvent.click(chart.getByRole("button", { name: "Contract price" }));
    fireEvent.click(screen.getByRole("button", { name: "5m up/down" }));
    expect(chart.getByTestId("theo")).toHaveTextContent("0.70,0.67");
  });

  it("submits a real NO position, capped at the market's leverage", async () => {
    state.openPosition.mockResolvedValue("verified-signature-123456");
    state.actions = { client: { openPosition: state.openPosition } };
    render(<MarketsPage symbol="BTC-1D-65000" />);
    fireEvent.click(screen.getByRole("button", { name: /^No / }));
    fireEvent.click(screen.getByRole("button", { name: /Open No/ }));
    await waitFor(() => expect(state.openPosition).toHaveBeenCalledWith(expect.objectContaining({
      symbol: "BTC-1D-65000", side: "no", marginE6: 25_000_000n, leverage: 4,
    })));
    expect(await screen.findByText(/Devnet position opened/)).toBeInTheDocument();
  });

  it("labels browser practice with a local receipt and never an explorer transaction", async () => {
    state.openPosition.mockResolvedValue("demo-receipt-mock-local");
    state.actions = { client: { openPosition: state.openPosition }, demo: true };
    render(<MarketsPage symbol="BTC-1D-65000" />);
    fireEvent.click(screen.getByRole("button", { name: /Open Yes/ }));
    const status = await screen.findByText(/Local demo position opened · demo-receipt-mock-local · no network transaction/);
    expect(status.closest("a")).toBeNull();
    expect(screen.queryByText(/Devnet position opened/)).not.toBeInTheDocument();
  });

  it("switches to Easy and remembers it", () => {
    render(<MarketsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Easy" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Bitcoin above/);
    expect(window.localStorage.getItem("wick:markets-mode")).toBe("easy");
  });
});
