"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import type { PricerMarket } from "@wick/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMarkets } from "@/hooks/use-markets";
import { DemoClient } from "@/lib/demo/client";
import { createLedger, DEMO_STORAGE_KEY, parseLedger, reconcile, seedHistory, type DemoLedger } from "@/lib/demo/ledger";
import { useDemoWallet } from "./wallet-panel";

/* Visitors without a wallet get a demo account: real markets, simulated balance and positions.
   Connecting Phantom/Solflare or creating a local wallet switches every page back to DevNet. */

export interface DemoAccountValue {
  /* true while no wallet is connected, so pages should read and act on the demo ledger */
  active: boolean;
  ready: boolean;
  ledger: DemoLedger;
  client: DemoClient;
  markets: readonly PricerMarket[];
  reset: () => void;
}

const DemoAccountContext = createContext<DemoAccountValue | undefined>(undefined);

function load(): DemoLedger {
  let stored: string | null = null;
  try { stored = window.localStorage.getItem(DEMO_STORAGE_KEY); } catch { /* storage blocked */ }
  return parseLedger(stored) ?? createLedger(Keypair.generate().publicKey.toBase58(), Date.now());
}

export function DemoAccountProvider({ children }: { children: ReactNode }) {
  const wallet = useDemoWallet();
  const connected = useWallet();
  const { markets } = useMarkets();
  const [ledger, setLedger] = useState<DemoLedger>(() => createLedger("", 0));
  const [ready, setReady] = useState(false);
  const ledgerRef = useRef(ledger);
  const marketsRef = useRef<readonly PricerMarket[]>(markets);
  marketsRef.current = markets;

  const commit = useCallback((next: DemoLedger) => {
    if (next === ledgerRef.current) return;
    ledgerRef.current = next;
    setLedger(next);
    try { window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage blocked or full */ }
  }, []);

  useEffect(() => { ledgerRef.current = load(); setLedger(ledgerRef.current); setReady(true); }, []);

  /* keeper pass: seed history once a BTC price is known, then liquidate and settle against live prices */
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      const now = Date.now();
      const spot = marketsRef.current.find((market) => market.spot > 0)?.spot;
      const seeded = spot === undefined ? ledgerRef.current : seedHistory(ledgerRef.current, spot, now);
      commit(reconcile(seeded, marketsRef.current, now));
    };
    run();
    const timer = window.setInterval(run, 5_000);
    return () => window.clearInterval(timer);
  }, [ready, markets, commit]);

  const client = useMemo(() => new DemoClient({ read: () => ledgerRef.current, write: commit, markets: () => marketsRef.current }), [commit]);
  const reset = useCallback(() => {
    const fresh = createLedger(Keypair.generate().publicKey.toBase58(), Date.now());
    const spot = marketsRef.current.find((market) => market.spot > 0)?.spot;
    commit(spot === undefined ? fresh : seedHistory(fresh, spot, Date.now()));
  }, [commit]);

  const active = !wallet.publicKey && !connected.publicKey;
  const value = useMemo<DemoAccountValue>(() => ({ active, ready, ledger, client, markets, reset }), [active, ready, ledger, client, markets, reset]);
  return <DemoAccountContext.Provider value={value}>{children}</DemoAccountContext.Provider>;
}

/* undefined outside the provider (tests, isolated components), which means no demo */
export function useDemoAccount(): DemoAccountValue | undefined {
  return useContext(DemoAccountContext);
}
