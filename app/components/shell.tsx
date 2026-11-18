"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BRAND } from "@wick/shared";
import { WalletPanel } from "./wallet-panel";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const navigation = [
    { href: "/trade", label: "Markets", active: pathname === "/trade" || pathname.startsWith("/m/") },
    { href: "/portfolio", label: "Portfolio", active: pathname.startsWith("/portfolio") },
    { href: "/pool", label: "Pool", active: pathname.startsWith("/pool") },
  ];

  return (
    <div className="chrome-shell">
      <header className="chrome-topbar">
        <div className="chrome-topbar-in">
          <Link className="chrome-brand" href="/" aria-label={`${BRAND.name} home`}>
            <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden="true">
              <polygon points="50,0 78,25 62,25 87,100 50,78 13,100 38,25 22,25" fill="var(--wick)" />
            </svg>
            <span>{BRAND.name}</span>
          </Link>
          <nav className="chrome-nav" aria-label="Primary">
            {navigation.map(({ href, label, active }) => (
              <Link className={active ? "chrome-nav-link chrome-nav-link--active" : "chrome-nav-link"}
                href={href} key={href} aria-current={active ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="chrome-right"><WalletPanel /></div>
        </div>
      </header>
      <main className="chrome-main">{children}</main>
      <footer className="chrome-footer">
        <div className="chrome-footer-in">
          <span>{BRAND.name} · Solana</span>
          <span>Prices: Deribit options · Settlement: Gemini</span>
        </div>
      </footer>
    </div>
  );
}
