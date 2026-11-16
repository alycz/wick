import type { BackendFastifyInstance } from "../server.js";
import { timingSafeEqual } from "node:crypto";
import type { IndexerService } from "./service.js";
import { streamsDeliverySchema } from "./types.js";

function secretsEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function registerIndexerRoutes(server: BackendFastifyInstance, indexer: IndexerService): Promise<void> {
  server.post<{ Querystring: { secret?: string }; Headers: { "x-wick-stream-secret"?: string }; Body: unknown }>("/streams/webhook", async (request, reply) => {
    if (!indexer.webhookSecret) return reply.code(503).send({ code: "STREAMS_NOT_CONFIGURED", message: "Streams webhook secret is not configured" });
    const providedSecret = request.headers["x-wick-stream-secret"] ?? request.query.secret;
    if (!providedSecret || !secretsEqual(providedSecret, indexer.webhookSecret)) {
      return reply.code(401).send({ code: "INVALID_STREAMS_SECRET", message: "Invalid Streams webhook secret" });
    }
    const delivery = streamsDeliverySchema.safeParse(request.body);
    if (!delivery.success) return reply.code(400).send({ code: "INVALID_STREAMS_PAYLOAD", message: "Invalid QuickNode Streams delivery" });
    setImmediate(() => {
      try {
        const inserted = indexer.store.processTransactions(delivery.data.matchedTransactions);
        indexer.logger.info({ transactions: delivery.data.matchedTransactions.length, events: inserted }, "processed QuickNode Streams delivery");
      } catch (error) {
        indexer.logger.error({ error: error instanceof Error ? error.message : String(error) }, "failed to process accepted QuickNode Streams delivery");
      }
    });
    return reply.code(200).send({ accepted: true });
  });

  server.get<{ Querystring: { limit?: string } }>("/feed", async (request) => {
    const parsed = Number(request.query.limit ?? 50);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(200, Math.trunc(parsed))) : 50;
    return indexer.store.feed(limit);
  });
  server.get("/leaderboard", async () => indexer.store.leaderboard());
  server.get("/lp/history", async () => indexer.store.lpHistory());
  server.get<{ Querystring: { owner?: string } }>("/positions", async (request) => indexer.store.positions(request.query.owner));
  server.get<{ Querystring: { owner?: string } }>("/claims", async (request) => indexer.store.payoutClaims(request.query.owner));

  server.get("/events/stream", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(": connected\n\n");
    const unsubscribe = indexer.store.onEvent((event) => reply.raw.write(`event: wick\ndata: ${JSON.stringify(event)}\n\n`));
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
    heartbeat.unref();
    request.raw.once("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });

  server.addHook("onReady", () => { void indexer.start(); });
  server.addHook("onClose", async () => indexer.close());
}
