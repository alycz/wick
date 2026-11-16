import { z } from "zod";

const decimalString = z.string().regex(/^\d+(?:\.\d+)?$/);
const nullableDecimal = decimalString.nullish();

export const geminiPriceSideSchema = z
  .object({ yes: decimalString.optional(), no: decimalString.optional() })
  .passthrough();

export const geminiPricesSchema = z
  .object({
    buy: geminiPriceSideSchema.optional(),
    sell: geminiPriceSideSchema.optional(),
    bestBid: decimalString.optional(),
    bestAsk: decimalString.optional(),
    lastTradePrice: decimalString.optional(),
  })
  .passthrough();

export const geminiStrikeSchema = z
  .object({
    type: z.enum(["reference", "above"]),
    value: nullableDecimal,
    availableAt: z.string().datetime().optional(),
  })
  .passthrough();

export const geminiContractSchema = z
  .object({
    id: z.string(),
    ticker: z.string(),
    instrumentSymbol: z.string(),
    label: z.string(),
    status: z.string(),
    marketState: z.enum(["open", "closed"]),
    effectiveDate: z.string().datetime(),
    expiryDate: z.string().datetime(),
    strike: geminiStrikeSchema,
    prices: geminiPricesSchema.optional().default({}),
    priceIncrement: decimalString,
    quantityMinimum: decimalString,
    resolutionSide: z.enum(["yes", "no"]).nullish(),
    resolvedAt: z.string().datetime().nullish(),
    settlementValue: nullableDecimal,
    termsAndConditionsUrl: z.string().url(),
  })
  .passthrough();

export const geminiEventTagSchema = z
  .object({ id: z.number().int(), name: z.string(), slug: z.string() })
  .passthrough();

export const geminiEventStatusSchema = z.enum([
  "approved",
  "active",
  "closed",
  "under_review",
  "settled",
  "invalid",
]);

export const geminiEventSchema = z
  .object({
    id: z.string(),
    ticker: z.string(),
    title: z.string(),
    type: z.enum(["binary", "categorical"]),
    series: z.string(),
    status: geminiEventStatusSchema,
    startTime: z.string().datetime(),
    effectiveDate: z.string().datetime(),
    expiryDate: z.string().datetime(),
    resolvedAt: z.string().datetime().nullish(),
    settlement: z.object({ value: decimalString }).passthrough().nullish(),
    sourceDetails: z
      .object({ agency: z.string(), index: z.string() })
      .passthrough(),
    eventTags: z.array(geminiEventTagSchema).nullish().transform((tags) => tags ?? []),
    contracts: z.array(geminiContractSchema),
  })
  .passthrough();

export const geminiEventsResponseSchema = z.object({
  data: z.array(geminiEventSchema),
  pagination: z.object({ limit: z.number().int(), offset: z.number().int(), total: z.number().int() }),
});

export const geminiSpotTickerSchema = z
  .object({
    bid: decimalString,
    ask: decimalString,
    last: decimalString,
    volume: z.object({ timestamp: z.number() }).passthrough(),
  })
  .passthrough();

export const bookTickerMessageSchema = z
  .object({
    u: z.union([z.string(), z.number()]),
    E: z.union([z.string(), z.number()]),
    s: z.string(),
    b: z.union([decimalString, z.literal("")]).optional(),
    B: z.union([decimalString, z.literal("")]).optional(),
    a: z.union([decimalString, z.literal("")]).optional(),
    A: z.union([decimalString, z.literal("")]).optional(),
    c: z.union([decimalString, z.literal("")]).optional(),
    C: z.union([decimalString, z.literal("")]).optional(),
  })
  .passthrough();

export const contractStatusMessageSchema = z
  .object({
    e: z.literal("contractStatus"),
    E: z.union([z.string(), z.number()]),
    s: z.string(),
    k: z.string(),
    c: z.string(),
    i: z.string(),
    p: decimalString.optional(),
    o: z.string(),
    n: z.string(),
  })
  .passthrough();

export type GeminiContract = z.infer<typeof geminiContractSchema>;
export type GeminiEvent = z.infer<typeof geminiEventSchema>;
export type GeminiEventsResponse = z.infer<typeof geminiEventsResponseSchema>;
export type GeminiStrike = z.infer<typeof geminiStrikeSchema>;
export type BookTickerMessage = z.infer<typeof bookTickerMessageSchema>;
export type ContractStatusMessage = z.infer<typeof contractStatusMessageSchema>;
