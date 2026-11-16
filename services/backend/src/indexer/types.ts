import { z } from "zod";

export const matchedTransactionSchema = z.object({
  signature: z.string().min(1),
  slot: z.number().int().nonnegative(),
  blockTime: z.number().int().nonnegative(),
  logs: z.array(z.string()),
});

export const streamsDeliverySchema = z.object({
  matchedTransactions: z.array(matchedTransactionSchema).max(10_000),
});

export type MatchedTransaction = z.infer<typeof matchedTransactionSchema>;
export type StreamsDelivery = z.infer<typeof streamsDeliverySchema>;

export interface DecodedProgramEvent {
  name: string;
  data: Record<string, unknown>;
}

export interface StoredEvent extends DecodedProgramEvent {
  signature: string;
  eventIndex: number;
  slot: number;
  blockTime: number;
}

export interface IndexerLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}
