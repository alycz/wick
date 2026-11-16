import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Logger } from "pino";
import type { PricerEngine } from "./pricer/engine.js";

export interface BuildServerOptions {
  engine: PricerEngine;
  logger: Logger;
  streamIntervalMs?: number;
  telemetryIntervalMs?: number;
  registerAdditionalRoutes?: (server: BackendFastifyInstance) => Promise<void> | void;
  healthSupplement?: () => Record<string, unknown>;
}

export type BackendFastifyInstance = FastifyInstance<Server, IncomingMessage, ServerResponse, Logger>;

export async function buildServer(options: BuildServerOptions): Promise<BackendFastifyInstance> {
  const server = Fastify({ loggerInstance: options.logger });
  await server.register(websocket);

  server.get("/markets", async () => options.engine.store.markets());

  server.get<{ Params: { symbol: string } }>("/markets/:symbol/history", async (request, reply) => {
    if (!options.engine.store.market(request.params.symbol)) {
      return reply.code(404).send({ code: "MARKET_NOT_FOUND", message: "Unknown Gemini market symbol" });
    }
    return options.engine.store.marketHistory(request.params.symbol);
  });

  server.get("/health", async () => {
    const snapshot = options.engine.snapshot();
    const now = Date.now();
    return {
      ok: snapshot.running && snapshot.volHealthy,
      cluster: "devnet",
      volSource: snapshot.volSource,
      volHealthy: snapshot.volHealthy,
      chainConfigured: snapshot.chainConfigured,
      marketCount: snapshot.markets.length,
      ...(snapshot.lastMarkAt === undefined ? {} : { markAgeMs: Math.max(0, now - snapshot.lastMarkAt) }),
      ...(snapshot.lastDiscoveryAt === undefined ? {} : { discoveryAgeMs: Math.max(0, now - snapshot.lastDiscoveryAt) }),
      ...(snapshot.lastError === undefined ? {} : { lastError: snapshot.lastError }),
      ...options.healthSupplement?.(),
      version: process.env.npm_package_version ?? "0.0.0",
    };
  });

  server.get("/stream", { websocket: true }, (socket) => {
    const sendSnapshot = () => {
      try { socket.send(JSON.stringify({ type: "markets", ts: Date.now(), data: options.engine.store.markets() })); }
      catch { /* close handler owns cleanup */ }
    };
    sendSnapshot();
    const timer = setInterval(sendSnapshot, options.streamIntervalMs ?? 1_000);
    socket.once("close", () => clearInterval(timer));
  });

  await options.registerAdditionalRoutes?.(server);

  let telemetry: ReturnType<typeof setInterval> | undefined;
  server.addHook("onReady", () => {
    // External providers can take longer than Fastify's plugin-ready timeout.
    // Start them in the background so /health is available immediately and
    // reports running/volHealthy truthfully while the surfaces warm up.
    void options.engine.start().catch((error: unknown) => {
      server.log.error({ error: error instanceof Error ? error.message : String(error) }, "pricer startup failed");
    });
    telemetry = setInterval(() => {
      const memory = process.memoryUsage();
      const cpu = process.cpuUsage();
      server.log.info({
        rssMb: Math.round(memory.rss / 1_048_576),
        heapUsedMb: Math.round(memory.heapUsed / 1_048_576),
        cpuUserMs: Math.round(cpu.user / 1_000),
        cpuSystemMs: Math.round(cpu.system / 1_000),
      }, "backend resource telemetry");
    }, options.telemetryIntervalMs ?? 5 * 60_000);
    telemetry.unref();
  });

  server.addHook("onClose", async () => {
    if (telemetry) clearInterval(telemetry);
    await options.engine.stop();
  });

  return server;
}
