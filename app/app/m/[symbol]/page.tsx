"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const MarketsPage = dynamic(() => import("@/components/markets/markets-page").then((module) => module.MarketsPage), { ssr: false });

export default function MarketPage() {
  const params = useParams<{ symbol: string }>();
  return <MarketsPage symbol={decodeURIComponent(params.symbol)} />;
}
