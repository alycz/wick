import { GeminiClient, GeminiQuoteStream } from "@wick/gemini";
import { AutoVolSource, DeribitVolSource, DeriveVolSource, RealizedVolSource } from "@wick/vol";
import pino from "pino";
import { PricerEngine, UnconfiguredChainPort } from "./pricer/index.js";
import { buildServer } from "./server.js";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["req.headers.authorization", "*.token", "*.secret", "*.keypair", "*.privateKey"],
    censor: "[REDACTED]",
  },
});

const gemini = new GeminiClient();
const volLogger = {
  info: (fields: Record<string, unknown>, message: string) => logger.info(fields, message),
  warn: (fields: Record<string, unknown>, message: string) => logger.warn(fields, message),
};
const deribit = new DeribitVolSource({ logger: volLogger });
const derive = new DeriveVolSource({ logger: volLogger });
const realized = new RealizedVolSource();
const vol = new AutoVolSource({ sources: [deribit, derive, realized], logger: volLogger });

// WP2 could not export a generated deployed IDL or deploy the program because
// the environment lacks a funded authority/toolchain. Keep chain writes
// explicitly disabled rather than acknowledging transactions that never ran.
const chain = new UnconfiguredChainPort();
logger.warn({ programId: process.env.PROGRAM_ID ?? null }, "Wick Anchor chain adapter unavailable; pricing APIs will run read-only");

const engine = new PricerEngine({
  gemini,
  vol,
  chain,
  logger,
  quoteStreamFactory: ({ symbols, onQuote, onStatus }) => new GeminiQuoteStream({
    symbols,
    client: gemini,
    onQuote,
    onStatus: () => onStatus(),
    logger: {
      info: (message) => logger.info({}, message),
      warn: (message) => logger.warn({}, message),
    },
  }),
});

const server = await buildServer({ engine, logger });
const port = Number(process.env.PORT ?? 3_000);
const host = process.env.HOST ?? "0.0.0.0";

await server.listen({ port, host });

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "graceful shutdown started");
  try { await server.close(); }
  catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "graceful shutdown failed");
    process.exitCode = 1;
  }
};

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
