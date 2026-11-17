"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BRAND } from "@wick/shared";
import { ActivityRail } from "./activity-rail";
import { WalletPanel } from "./wallet-panel";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [tradeOpen, setTradeOpen] = useState(false);
  const tradeMenuRef = useRef<HTMLDivElement>(null);
  const tradeButtonRef = useRef<HTMLButtonElement>(null);
  const showActivity = pathname !== "/";
  const navigation = [
    { href: "/portfolio", label: "Portfolio", active: pathname.startsWith("/portfolio") },
    { href: "/pool", label: "Pool", active: pathname.startsWith("/pool") },
  ];
  const tradeActive = pathname === "/trade" || pathname.startsWith("/m/");

  useEffect(() => {
    if (!tradeOpen) return;
    tradeMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!tradeMenuRef.current?.contains(event.target as Node)) setTradeOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [tradeOpen]);

  const onTradeButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (["ArrowDown", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setTradeOpen(true);
    }
  };
  const onTradeMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(tradeMenuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault(); setTradeOpen(false); tradeButtonRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault(); items[(index + 1 + items.length) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault(); items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault(); items.at(-1)?.focus();
    }
  };

  return (
    <div className="chrome-shell">
      <header className="chrome-topbar">
        <Link className="chrome-brand" href="/" aria-label="Wick markets home">
          <span className="wick-logo-mark" aria-hidden="true" />
          <span className="chrome-brand-name">{BRAND.name}</span>
        </Link>
        <nav className="chrome-nav" aria-label="Primary navigation">
          <div className="chrome-trade-menu" ref={tradeMenuRef} onKeyDown={onTradeMenuKeyDown}>
            <button className={tradeActive ? "chrome-nav-link chrome-nav-link--active" : "chrome-nav-link"}
              ref={tradeButtonRef} type="button" aria-haspopup="menu" aria-expanded={tradeOpen}
              aria-current={tradeActive ? "page" : undefined}
              aria-controls="trade-destinations" onClick={() => setTradeOpen((open) => !open)} onKeyDown={onTradeButtonKeyDown}>
              Trade <span className="chrome-trade-caret" aria-hidden="true">⌄</span>
            </button>
            {tradeOpen && <div className="chrome-trade-popover" id="trade-destinations" role="menu" aria-label="Trade destinations">
              <Link role="menuitem" href="/trade" onClick={() => setTradeOpen(false)}><b>BTC</b><span>15 minute markets</span></Link>
              <Link role="menuitem" href="/trade#tail-ladder" onClick={() => setTradeOpen(false)}><b>Tail</b><span>Strike ladder</span></Link>
              <Link role="menuitem" href="/pool" onClick={() => setTradeOpen(false)}><b>LP</b><span>Experimental pool</span></Link>
            </div>}
          </div>
          {navigation.map(({ href, label, active }) => (
            <Link className={active ? "chrome-nav-link chrome-nav-link--active" : "chrome-nav-link"}
              href={href} key={href} aria-current={active ? "page" : undefined}>
              {label}
            </Link>
          ))}
          <span className="chrome-network-chip"><i /> Solana devnet</span>
        </nav>
        <WalletPanel />
      </header>
      <div className={`chrome-app-grid ${showActivity ? "chrome-app-grid--rail" : "chrome-app-grid--wide"}`}>
        <main className="chrome-main">{children}</main>
        {showActivity && <ActivityRail />}
      </div>
      <footer className="chrome-footer">Test USDC only <span aria-hidden="true">·</span> Not a real-money product</footer>
    </div>
  );
}
