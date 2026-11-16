import { GeminiClient } from "./client.js";
import { GeminiQuoteStream } from "./stream.js";

const client = new GeminiClient();
const events = await client.listEvents({ status: "active", search: "BTC", limit: 500 });
const now = Date.now();
const contract = events.data
  .filter((event) => event.series === "BTC15M" && Date.parse(event.expiryDate) > now)
  .sort((left, right) => Date.parse(left.expiryDate) - Date.parse(right.expiryDate))
  .flatMap((event) => event.contracts)
  .find((candidate) => candidate.marketState === "open");

if (!contract) throw new Error("Gemini returned no future open BTC15M contract");
const strikeEvent = events.data.find((event) => event.contracts.some((candidate) => candidate.id === contract.id));
if (!strikeEvent) throw new Error("could not resolve selected contract event");
await client.getStrike(strikeEvent.ticker);
await client.getSpot();

await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    stream.stop();
    reject(new Error("no live Gemini quote arrived within 20 seconds"));
  }, 20_000);
  const stream = new GeminiQuoteStream({
    symbols: [contract.instrumentSymbol],
    client,
    logger: console,
    onQuote: (symbol, quote) => {
      clearTimeout(timeout);
      stream.stop();
      console.info(JSON.stringify({ event: "live_quote_verified", symbol, quote }));
      resolve();
    },
  });
  stream.start();
});
