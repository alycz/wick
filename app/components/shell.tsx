"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BRAND } from "@wick/shared";
import { ActivityRail } from "./activity-rail";
import { WalletPanel } from "./wallet-panel";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showActivity = pathname !== "/";
  const navigation = [
    { href: "/trade", label: "Trade", active: pathname === "/trade" || pathname.startsWith("/m/") },
    { href: "/portfolio", label: "Portfolio", active: pathname.startsWith("/portfolio") },
    { href: "/pool", label: "Pool", active: pathname.startsWith("/pool") },
  ];

  return (
    <div className="chrome-shell">
      <header className="chrome-topbar">
        <Link className="chrome-brand" href="/" aria-label="Wick markets home">
          <span className="chrome-brand-mark" aria-hidden="true">W</span>
          <span className="chrome-brand-name">{BRAND.name}</span>
        </Link>
        <nav className="chrome-nav" aria-label="Primary navigation">
          {navigation.map(({ href, label, active }) => (
            <Link className={active ? "chrome-nav-link chrome-nav-link--active" : "chrome-nav-link"}
              href={href} key={href} aria-current={active ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <WalletPanel />
      </header>
      <div className="chrome-market-strip" aria-label="Platform capabilities">
        <Link className="chrome-market-chip chrome-market-chip--active" href="/trade">
          <span className="chrome-chip-symbol">BTC</span>
          <span>15 minute markets</span>
        </Link>
        <Link className="chrome-market-chip" href="/trade">
          <span className="chrome-chip-symbol">TAIL</span>
          <span>Ladder outcomes</span>
        </Link>
        <Link className="chrome-market-chip" href="/pool">
          <span className="chrome-chip-symbol">LP</span>
          <span>Devnet pool</span>
        </Link>
        <span className="chrome-network-chip"><i /> Solana devnet</span>
      </div>
      <div className={`chrome-app-grid ${showActivity ? "chrome-app-grid--rail" : "chrome-app-grid--wide"}`}>
        <main className="chrome-main">{children}</main>
        {showActivity && <ActivityRail />}
      </div>
      <footer className="chrome-footer">Devnet demo <span aria-hidden="true">·</span> Test USDC only <span aria-hidden="true">·</span> Not a real-money product</footer>
    </div>
  );
}
