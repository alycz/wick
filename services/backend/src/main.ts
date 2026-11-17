import { GeminiClient, GeminiQuoteStream } from "@wick/gemini";
import { AutoVolSource, DeribitVolSource, DeriveVolSource, RealizedVolSource } from "@wick/vol";
import { createCollectorWorkerFromEnvironment } from "./collector/service.js";
import { IndexerService, registerIndexerRoutes } from "./indexer/index.js";
import { createBackendLogger } from "./logging.js";
import { createChainPort, PricerEngine } from "./pricer/index.js";
import { buildServer } from "./server.js";

const logger = createBackendLogger();

const collector = await createCollectorWorkerFromEnvironment({ environment: process.env, logger });
if (collector) logger.info({}, "Solana collector enabled");
else logger.info({}, "Solana collector disabled");

const gemini = new GeminiClient();
const volLogger = {
  info: (fields: Record<string, unknown>, message: string) => logger.info(fields, message),
  warn: (fields: Record<string, unknown>, message: string) => logger.warn(fields, message),
};
const deribit = new DeribitVolSource({ logger: volLogger });
const derive = new DeriveVolSource({ logger: volLogger });
const realized = new RealizedVolSource();
const vol = new AutoVolSource({ sources: [deribit, derive, realized], logger: volLogger });

const chain = await createChainPort();
if (chain.configured()) logger.info({ programId: process.env.PROGRAM_ID }, "Wick Anchor chain adapter verified on Solana devnet");
else logger.warn({ programId: null }, "Wick Anchor chain adapter unconfigured; pricing APIs will run read-only");

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

const indexer = new IndexerService({
  databasePath: process.env.SQLITE_PATH ?? "/data/wick.db",
  ...(process.env.STREAMS_WEBHOOK_SECRET === undefined ? {} : { webhookSecret: process.env.STREAMS_WEBHOOK_SECRET }),
  ...(process.env.PROGRAM_ID === undefined ? {} : { programId: process.env.PROGRAM_ID }),
  rpcUrl: process.env.PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  logger,
});

const server = await buildServer({
  engine,
  logger,
  registerAdditionalRoutes: (instance) => registerIndexerRoutes(instance, indexer),
  healthSupplement: () => indexer.health(),
});
const port = Number(process.env.PORT ?? 3_000);
const host = process.env.HOST ?? "0.0.0.0";

await server.listen({ port, host });
collector?.start();

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "graceful shutdown started");
  try {
    await collector?.stop();
    await server.close();
  }
  catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "graceful shutdown failed");
    process.exitCode = 1;
  }
};

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
