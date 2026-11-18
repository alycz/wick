import { GeminiClient, GeminiQuoteStream } from "@wick/gemini";
import { AutoVolSource, DeribitVolSource } from "@wick/vol";
import { createCollectorWorkerFromEnvironment } from "./collector/service.js";
import { IndexerService, registerIndexerRoutes } from "./indexer/index.js";
import { createBackendLogger } from "./logging.js";
import { createChainPort, MarketStore, PricerEngine } from "./pricer/index.js";
import { HostedMarketData } from "./pricer/hosted-market-data.js";
import { selectOptionSnapshots } from "./pricer/option-snapshots.js";
import { UpDownHistory } from "./pricer/up-down-history.js";
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
const indexer = new IndexerService({
  databasePath: process.env.SQLITE_PATH ?? "/data/wick.db",
  ...(process.env.STREAMS_WEBHOOK_SECRET === undefined ? {} : { webhookSecret: process.env.STREAMS_WEBHOOK_SECRET }),
  ...(process.env.PROGRAM_ID === undefined ? {} : { programId: process.env.PROGRAM_ID }),
  rpcUrl: process.env.PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  logger,
});
const database = indexer.store.database;
const databaseUrl = process.env.DATABASE_URL?.trim();
const hosted = databaseUrl ? new HostedMarketData(database, databaseUrl, logger) : undefined;
const history = new UpDownHistory(database, hosted ? (price) => hosted.queueUpDown(price) : undefined);
const marketStore = new MarketStore(undefined, history);
const deribit = new DeribitVolSource({
  logger: volLogger,
  ...(hosted ? { onOptionSnapshot: (snapshot) => {
    hosted.queueOptions(snapshot.capturedAt, selectOptionSnapshots(snapshot, marketStore.markets()), snapshot);
  } } : {}),
});
const vol = new AutoVolSource({ sources: [deribit], mode: "deribit", logger: volLogger });

const chain = await createChainPort();
if (chain.configured()) logger.info({ programId: process.env.PROGRAM_ID }, "Wick Anchor chain adapter verified on Solana devnet");
else logger.warn({ programId: null }, "Wick Anchor chain adapter unconfigured; pricing APIs will run read-only");

const engine = new PricerEngine({
  gemini,
  vol,
  chain,
  logger,
  store: marketStore,
  ...(hosted ? { onTheoInputs: (pricedAt, inputs) => hosted.queueTheoInputs(pricedAt, inputs) } : {}),
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

const server = await buildServer({
  engine,
  logger,
  ...(hosted ? { hostedMarketData: hosted } : {}),
  registerAdditionalRoutes: (instance) => registerIndexerRoutes(instance, indexer),
  healthSupplement: () => indexer.health(),
});
const port = Number(process.env.PORT ?? 3_000);
const host = process.env.HOST ?? "0.0.0.0";

await server.listen({ port, host });
collector?.start();
hosted?.start();

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "graceful shutdown started");
  try {
    await collector?.stop();
    await hosted?.stop();
    await server.close();
  }
  catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "graceful shutdown failed");
    process.exitCode = 1;
  }
};

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
