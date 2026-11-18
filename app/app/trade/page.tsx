"use client";

import dynamic from "next/dynamic";

// live prices and local time zones differ between server and browser, so the page renders in the browser only
const MarketsPage = dynamic(() => import("@/components/markets/markets-page").then((module) => module.MarketsPage), { ssr: false });

export default function TradePage() {
  return <MarketsPage />;
}
