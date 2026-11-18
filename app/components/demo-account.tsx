"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { PricerMarket } from "@wick/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMarkets } from "@/hooks/use-markets";
import { DemoClient } from "@/lib/demo/client";
import { createLedger, demoAccountId, DEMO_LEGACY_BACKUP_KEY, DEMO_STORAGE_KEY, isLegacyDemoStorage, parseLedger, reconcile, type DemoLedger } from "@/lib/demo/ledger";
import { useDemoWallet } from "./wallet-panel";
import { liveBackend } from "@/lib/api";

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

interface LoadedLedger { ledger: DemoLedger; allowPersistence: boolean }

function load(): LoadedLedger {
  let stored: string | null = null;
  try { stored = window.localStorage.getItem(DEMO_STORAGE_KEY); } catch { /* storage blocked */ }
  const parsed = parseLedger(stored);
  const legacy = isLegacyDemoStorage(stored);
  if (parsed && stored && legacy) {
    try {
      /* Never replace the active v1 value until its exact bytes are recoverable. */
      if (window.localStorage.getItem(DEMO_LEGACY_BACKUP_KEY) === null) window.localStorage.setItem(DEMO_LEGACY_BACKUP_KEY, stored);
      if (window.localStorage.getItem(DEMO_LEGACY_BACKUP_KEY) !== stored) return { ledger: parsed, allowPersistence: false };
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(parsed));
      return { ledger: parsed, allowPersistence: true };
    } catch {
      /* Keep using the migrated view in memory, but fail closed: no later commit may overwrite v1. */
      return { ledger: parsed, allowPersistence: false };
    }
  }
  return { ledger: parsed ?? createLedger(demoAccountId(), Date.now()), allowPersistence: !legacy };
}

export function DemoAccountProvider({ children }: { children: ReactNode }) {
  const wallet = useDemoWallet();
  const connected = useWallet();
  const { markets } = useMarkets();
  const [ledger, setLedger] = useState<DemoLedger>(() => createLedger("", 0));
  const [ready, setReady] = useState(false);
  const ledgerRef = useRef(ledger);
  const allowPersistenceRef = useRef(true);
  const marketsRef = useRef<readonly PricerMarket[]>(markets);
  marketsRef.current = markets;

  const commit = useCallback((next: DemoLedger) => {
    if (next === ledgerRef.current) return;
    ledgerRef.current = next;
    setLedger(next);
    if (!allowPersistenceRef.current) return;
    try { window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage blocked or full */ }
  }, []);

  useEffect(() => {
    const loaded = load();
    ledgerRef.current = loaded.ledger;
    allowPersistenceRef.current = loaded.allowPersistence;
    setLedger(loaded.ledger);
    setReady(true);
  }, []);

  /* Local keeper pass: only mark-based liquidation. Settlement waits for an official outcome. */
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      const now = Date.now();
      commit(reconcile(ledgerRef.current, marketsRef.current, now));
    };
    run();
    const timer = window.setInterval(run, 5_000);
    return () => window.clearInterval(timer);
  }, [ready, markets, commit]);

  const client = useMemo(() => new DemoClient({ read: () => ledgerRef.current, write: commit, markets: () => marketsRef.current }), [commit]);
  const reset = useCallback(() => {
    commit(createLedger(demoAccountId(), Date.now()));
  }, [commit]);

  const active = !wallet.publicKey && !connected.publicKey;
  const value = useMemo<DemoAccountValue>(() => ({ active, ready, ledger, client, markets, reset }), [active, ready, ledger, client, markets, reset]);
  return <DemoAccountContext.Provider value={value}>{children}</DemoAccountContext.Provider>;
}

/* undefined outside the provider (tests, isolated components), which means no demo */
export function useDemoAccount(): DemoAccountValue | undefined {
  return useContext(DemoAccountContext);
}

/** Whether pages without a backend endpoint (leaderboard, protocol stats) should show simulated numbers:
    on the demo account, or whenever the app is running on demo market data. */
export function useShowSimulated(): boolean {
  const account = useDemoAccount();
  return !liveBackend() || account?.active === true;
}
