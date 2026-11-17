import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCollectorWorkerFromEnvironment, type CollectorLogger } from "../services/backend/src/collector/service.js";

const logger: CollectorLogger = {
  info: (fields, message) => console.info(JSON.stringify({ event: message, ...fields })),
  warn: (fields, message) => console.warn(JSON.stringify({ event: message, ...fields })),
  error: (fields, message) => console.error(JSON.stringify({ event: message, ...fields })),
};

async function main(): Promise<void> {
  const worker = await createCollectorWorkerFromEnvironment({
    environment: {
      ...process.env,
      TREASURY_KEYPAIR: process.env.TREASURY_KEYPAIR ?? ".keys/treasury.json",
      KEEPER_KEYPAIR: process.env.KEEPER_KEYPAIR ?? ".keys/keeper.json",
    },
    logger,
    requireEnabled: false,
  });
  if (!worker) throw new Error("collector worker could not be created");
  worker.start();
  await new Promise<void>((resolveDone) => {
    const stop = () => void worker.stop().then(resolveDone, (error: unknown) => {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "collector shutdown failed");
      process.exitCode = 1;
      resolveDone();
    });
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
