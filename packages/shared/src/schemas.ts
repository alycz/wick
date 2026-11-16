import { z } from "zod";

export const geminiQuoteSchema = z.object({
  bid: z.number().min(0).max(1).optional(),
  ask: z.number().min(0).max(1).optional(),
  mid: z.number().min(0).max(1).optional(),
  last: z.number().min(0).max(1).optional(),
  ts: z.number().int().nonnegative(),
});

export const pricerMarketSchema = z.object({
  symbol: z.string().min(1),
  eventTicker: z.string().min(1),
  kind: z.enum(["up_down", "ladder"]),
  duration: z.string(),
  title: z.string(),
  strike: z.number().positive(),
  openTs: z.number().int(),
  expiryTs: z.number().int(),
  spot: z.number().positive(),
  theo: z.number().min(0.01).max(0.99),
  gemini: geminiQuoteSchema,
  edge: z.number().optional(),
  maxLeverage: z.number().int().min(1).max(1000),
  status: z.enum(["open", "halted", "expired", "settled", "invalid"]),
  volSource: z.enum(["deribit", "derive", "realized"]),
});

export const marketsResponseSchema = z.array(pricerMarketSchema);
