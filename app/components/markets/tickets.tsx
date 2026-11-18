"use client";

import { useMemo, useState } from "react";
import type { MarketHistoryPoint, PositionSide, PricerMarket } from "@wick/shared";
import { useWickActions } from "@/hooks/use-wick-actions";
import { cents, compactAddress, dollars } from "@/lib/format";
import { tradePreview } from "@/lib/preview";
import { FitInput, LevSlider } from "./controls";

export interface TicketState {
  side: PositionSide;
  setSide: (side: PositionSide) => void;
  amount: number;
  setAmount: (amount: number) => void;
  leverage: number;
  setLeverage: (leverage: number) => void;
}

/* Opens a position through the real Wick client. */
function useOpen(market: PricerMarket, state: TicketState, history: MarketHistoryPoint[]) {
  const actions = useWickActions();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [signature, setSignature] = useState<string>();
  const leverage = Math.max(1, Math.min(state.leverage, market.maxLeverage));
  const preview = useMemo(() => tradePreview(market, state.side, state.amount, leverage, history), [market, state.side, state.amount, leverage, history]);
  const submit = async (amount = state.amount) => {
    if (!actions.client) { setError(actions.error ?? "Trading is not configured."); return; }
    const entry = amount === state.amount ? preview : tradePreview(market, state.side, amount, leverage, history);
    setSubmitting(true); setError(undefined); setSignature(undefined);
    try {
      setSignature(await actions.client.openPosition({
        symbol: market.symbol,
        side: state.side,
        marginE6: BigInt(Math.round(amount * 1_000_000)),
        leverage,
        maxEntryE6: Math.min(990_000, Math.ceil(entry.entry * 1_000_000) + 1_000),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  };
  const canTrade = market.status === "open" && Boolean(actions.client) && state.amount > 0 && !submitting;
  return { actions, preview, leverage, submit, submitting, error, signature, canTrade };
}

function Status({ open }: { open: ReturnType<typeof useOpen> }) {
  return <>
    {!open.actions.client && <p className="tk-msg" role="status">{open.actions.error ?? "Trading is not configured."}</p>}
    {open.error && <p className="tk-msg tk-err" role="alert">{open.error}</p>}
    {open.signature && <p className="tk-msg tk-ok" role="status">{open.actions.demo
      ? `Local demo position opened · ${open.signature} · no network transaction`
      : `Devnet position opened · ${compactAddress(open.signature)}`}</p>}
  </>;
}

const sideWords = (upDown: boolean) => upDown ? ["Up", "Down"] as const : ["Yes", "No"] as const;

function fine(word: string, contracts: number, entry: number, leverage: number, liquidation?: number) {
  const close = leverage > 1
    ? liquidation ? `Closes automatically if BTC reaches ${dollars(liquidation)}.` : `Closes automatically if ${word} falls far enough to use up the margin.`
    : "No liquidation at 1x.";
  return `Buys ${contracts.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${word} contracts at ${cents(entry)}. ${close}`;
}

export function EasyTicket({ market, upDown, expiryLabel, history, state }: {
  market: PricerMarket; upDown: boolean; expiryLabel: string; history: MarketHistoryPoint[]; state: TicketState;
}) {
  const open = useOpen(market, state, history);
  const [yes, no] = sideWords(upDown);
  const word = state.side === "yes" ? yes : no;
  const [text, setText] = useState<string>();
  const strike = market.strike.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const name = upDown ? "BTC Up or Down 15m" : `Bitcoin above ${strike} · ${expiryLabel}`;
  return <div className="card tk-easy" aria-label="Order ticket">
    <div className="t-id"><div className="coin sm" aria-hidden="true">₿</div><div><small>{name}</small>
      <b>{upDown ? "" : `${strike} · `}<em className={state.side === "yes" ? "up" : "down"}>{word}</em></b></div></div>
    <div className="t-sides">
      <button type="button" className={`y${state.side === "yes" ? " on" : ""}`} aria-pressed={state.side === "yes"} onClick={() => state.setSide("yes")}>{yes} {cents(market.theo)}</button>
      <button type="button" className={`n${state.side === "no" ? " on" : ""}`} aria-pressed={state.side === "no"} onClick={() => state.setSide("no")}>{no} {cents(1 - market.theo)}</button>
    </div>
    <div className="amt">
      <label htmlFor="tk-amt">Amount</label>
      <div className="amt-v" onClick={() => document.getElementById("tk-amt")?.focus()}>
        <span aria-hidden="true">$</span>
        <FitInput id="tk-amt" inputMode="decimal" aria-label="Amount in dollars" value={text ?? String(state.amount)}
          onChange={(event) => setText(event.target.value.replace(/[^0-9.]/g, ""))}
          onBlur={() => { if (text !== undefined) state.setAmount(Math.max(0, Number(text) || 0)); setText(undefined); }}
          onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
      </div>
    </div>
    <div className="chips">{[1, 5, 10, 100].map((add) => <button type="button" key={add} onClick={() => state.setAmount(state.amount + add)}>+${add}</button>)}</div>
    <div><div className="fld-label">Leverage</div><LevSlider cap={market.maxLeverage} value={open.leverage} onChange={state.setLeverage} /></div>
    <div className="win"><span>To win</span><b>{dollars(open.preview.maxPayout, 2)}</b></div>
    <p className="fine">{fine(word, open.preview.contracts, open.preview.entry, open.leverage, open.preview.liquidationPrice)}</p>
    <button type="button" className="cta" disabled={!open.canTrade} onClick={() => void open.submit()}>
      {open.submitting ? "Confirming…" : market.status !== "open" ? `Market ${market.status}` : `Buy ${word}`}
    </button>
    <Status open={open} />
  </div>;
}

export function ProTicket({ market, upDown, label, history, state }: {
  market: PricerMarket; upDown: boolean; label: string; history: MarketHistoryPoint[]; state: TicketState;
}) {
  const open = useOpen(market, state, history);
  const [yes, no] = sideWords(upDown);
  const word = state.side === "yes" ? yes : no;
  const [text, setText] = useState<string>();
  const p = open.preview;
  return <div className="tk" aria-label="Order ticket">
    <div className="seg">
      <button type="button" className={`y${state.side === "yes" ? " on" : ""}`} aria-pressed={state.side === "yes"} onClick={() => state.setSide("yes")}>{yes} {(market.theo * 100).toFixed(1)}</button>
      <button type="button" className={`n${state.side === "no" ? " on" : ""}`} aria-pressed={state.side === "no"} onClick={() => state.setSide("no")}>{no} {((1 - market.theo) * 100).toFixed(1)}</button>
    </div>
    <div className="kvs"><div><span>Market</span><b>{label}</b></div><div><span>Order</span><b>Market · isolated</b></div></div>
    <div className="fld"><label htmlFor="pt-amt">Margin</label>
      <input id="pt-amt" inputMode="decimal" aria-label="Margin in USDC" value={text ?? String(state.amount)}
        onChange={(event) => setText(event.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => { if (text !== undefined) state.setAmount(Math.max(0, Number(text) || 0)); setText(undefined); }}
        onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
      <span>USDC</span></div>
    <LevSlider cap={market.maxLeverage} value={open.leverage} onChange={state.setLeverage} />
    <div className="kvs">
      <div><span>Contracts</span><b>{p.contracts.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
      <div><span>Entry</span><b>{cents(p.entry)}</b></div>
      <div><span>Entry (max)</span><b>{cents(Math.min(.99, p.entry + .001))}</b></div>
      <div><span>Liquidation</span><b>{open.leverage <= 1 ? "None" : p.liquidationPrice ? `${dollars(p.liquidationPrice)} (${p.liquidationPct?.toFixed(2)}%)` : `${cents(p.liqMark)} mark`}</b></div>
      <div><span>Payout if right</span><b className="up">{dollars(p.maxPayout, 2)}</b></div>
      <div><span>Fee</span><b>2% of profit · up to {dollars(p.feeAtMaxProfit, 2)}</b></div>
      <div><span>Leverage cap</span><b>{market.maxLeverage}x</b></div>
    </div>
    <button type="button" className={`pcta ${state.side === "yes" ? "y" : "n"}`} disabled={!open.canTrade} onClick={() => void open.submit()}>
      {open.submitting ? "Confirming…" : market.status !== "open" ? `Market ${market.status}` : `Open ${word} · ${open.leverage}x`}
    </button>
    <Status open={open} />
    <p className="tk-foot">Entry is capped 0.1¢ above the quote to protect against slippage.</p>
  </div>;
}
