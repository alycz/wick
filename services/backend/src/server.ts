import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Logger } from "pino";
import type { PricerEngine } from "./pricer/engine.js";
import { databaseErrorCode, type HostedMarketData } from "./pricer/hosted-market-data.js";

export interface BuildServerOptions {
  engine: PricerEngine;
  logger: Logger;
  streamIntervalMs?: number;
  telemetryIntervalMs?: number;
  registerAdditionalRoutes?: (server: BackendFastifyInstance) => Promise<void> | void;
  healthSupplement?: () => Record<string, unknown>;
  hostedMarketData?: Pick<HostedMarketData, "prices" | "expiredContracts" | "ladderPrices" | "expiredLadderContracts" | "lastSync">;
  allowedOrigins?: string[];
  allowLocalhostOrigins?: boolean;
}

export type BackendFastifyInstance = FastifyInstance<Server, IncomingMessage, ServerResponse, Logger>;

function canonicalOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Unsupported CORS origin protocol: ${url.protocol}`);
  if (url.pathname !== "/" || url.search || url.hash) throw new Error(`CORS origin must not include a path, query, or fragment: ${value}`);
  return url.origin;
}

export function configuredCorsOrigins(environment: NodeJS.ProcessEnv = process.env): string[] {
  const configured = [environment.CORS_ALLOWED_ORIGINS, environment.FRONTEND_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map(canonicalOrigin);
  return [...new Set(configured)];
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  } catch {
    return false;
  }
}

export async function buildServer(options: BuildServerOptions): Promise<BackendFastifyInstance> {
  const server = Fastify({ loggerInstance: options.logger });
  await server.register(websocket);
  const allowedOrigins = new Set((options.allowedOrigins ?? configuredCorsOrigins()).map(canonicalOrigin));
  const allowLocalhostOrigins = options.allowLocalhostOrigins ?? process.env.NODE_ENV !== "production";

  server.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin) return;
    // QuickNode is a server-to-server caller and sends no browser Origin. Keep
    // the secret-authenticated ingestion endpoint outside the browser surface.
    if (request.url.split("?", 1)[0] === "/streams/webhook") {
      return reply.code(403).send({ code: "BROWSER_WEBHOOK_FORBIDDEN", message: "Streams webhook does not accept browser-origin requests" });
    }
    let canonical: string;
    try { canonical = canonicalOrigin(origin); }
    catch { return reply.code(403).send({ code: "ORIGIN_NOT_ALLOWED", message: "Browser origin is not allowed" }); }
    if (!allowedOrigins.has(canonical) && !(allowLocalhostOrigins && isLocalDevelopmentOrigin(canonical))) {
      return reply.code(403).send({ code: "ORIGIN_NOT_ALLOWED", message: "Browser origin is not allowed" });
    }
    reply.raw.setHeader("Access-Control-Allow-Origin", canonical);
    reply.raw.setHeader("Vary", "Origin");
    reply.raw.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    reply.raw.setHeader("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID");
    reply.raw.setHeader("Access-Control-Max-Age", "600");
    if (request.method === "OPTIONS") return reply.code(204).send();
  });

  server.get("/markets", async () => options.engine.store.markets());
  server.get("/markets/up-down-history", async (_request, reply) => {
    const now = Date.now();
    const local = options.engine.store.upDownHistory?.expiredContracts(now) ?? [];
    if (!options.hostedMarketData) return local;
    try {
      const hosted = await options.hostedMarketData.expiredContracts(now);
      const contracts = new Map([...local, ...hosted].map((contract) => [contract.symbol, contract]));
      return [...contracts.values()]
        .sort((left, right) => right.expiryTs - left.expiryTs || left.symbol.localeCompare(right.symbol))
        .slice(0, 100);
    } catch (error) {
      server.log.warn({ code: databaseErrorCode(error) }, "Could not read hosted Up/Down contracts");
      if (local.length) return local;
      return reply.code(503).send({ code: "HISTORY_UNAVAILABLE", message: "Up/Down history is temporarily unavailable" });
    }
  });

  server.get("/markets/ladder-history", async (_request, reply) => {
    if (!options.hostedMarketData) return [];
    try {
      return await options.hostedMarketData.expiredLadderContracts(Date.now());
    } catch (error) {
      server.log.warn({ code: databaseErrorCode(error) }, "Could not read hosted ladder contracts");
      return reply.code(503).send({ code: "HISTORY_UNAVAILABLE", message: "Dated market history is temporarily unavailable" });
    }
  });

  server.get<{ Params: { symbol: string } }>("/markets/:symbol/history", async (request, reply) => {
    const { symbol } = request.params;
    const now = Date.now();
    const history = options.engine.store.marketHistory(symbol, now);
    const market = options.engine.store.market(symbol);
    if (options.hostedMarketData) {
      try {
        let archived = market?.kind === "ladder" ? [] : await options.hostedMarketData.prices(symbol, now);
        if (!archived.length && market?.kind !== "up_down") archived = await options.hostedMarketData.ladderPrices(symbol, now);
        if (archived.length) {
          const points = new Map([...history, ...archived].map((point) => [point.ts, point]));
          return [...points.values()].sort((left, right) => left.ts - right.ts);
        }
      } catch (error) {
        server.log.warn({ code: databaseErrorCode(error) }, "Could not read hosted contract prices");
        if (!history.length && !market) {
          return reply.code(503).send({ code: "HISTORY_UNAVAILABLE", message: "Recorded prices are temporarily unavailable" });
        }
      }
    }
    if (!history.length && !market) {
      return reply.code(404).send({ code: "MARKET_NOT_FOUND", message: "Unknown Gemini market symbol" });
    }
    return history;
  });

  server.get("/health", async () => {
    const snapshot = options.engine.snapshot();
    const now = Date.now();
    const hostedSyncedAt = options.hostedMarketData?.lastSync();
    return {
      ok: snapshot.running && snapshot.volHealthy,
      cluster: "devnet",
      volSource: snapshot.volSource,
      volHealthy: snapshot.volHealthy,
      chainConfigured: snapshot.chainConfigured,
      marketCount: snapshot.markets.length,
      unpricedMarkets: snapshot.unpricedMarkets,
      hostedMarketDataConfigured: Boolean(options.hostedMarketData),
      ...(hostedSyncedAt === undefined ? {} : { hostedMarketDataSyncAgeMs: Math.max(0, now - hostedSyncedAt) }),
      ...(snapshot.lastMarkAt === undefined ? {} : { markAgeMs: Math.max(0, now - snapshot.lastMarkAt) }),
      ...(snapshot.lastPricingAt === undefined ? {} : { pricingAgeMs: Math.max(0, now - snapshot.lastPricingAt) }),
      ...(snapshot.lastDiscoveryAt === undefined ? {} : { discoveryAgeMs: Math.max(0, now - snapshot.lastDiscoveryAt) }),
      ...(snapshot.lastError === undefined ? {} : { lastError: snapshot.lastError }),
      ...options.healthSupplement?.(),
      version: process.env.npm_package_version ?? "0.0.0",
    };
  });

  server.get("/stream", { websocket: true }, (socket) => {
    const sendSnapshot = () => {
      try {
        const snapshot = options.engine.snapshot();
        socket.send(JSON.stringify({ type: "markets", ts: snapshot.lastPricingAt, data: snapshot.markets }));
      }
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
