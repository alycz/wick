import { WICK_IDL } from "@wick/shared";

export function chainConfigurationError(): string | undefined {
  if (!process.env.NEXT_PUBLIC_PROGRAM_ID) return "Trading is not configured: the Wick devnet program ID is missing.";
  if (!process.env.NEXT_PUBLIC_USDC_TEST_MINT) return "Trading is not configured: the test-USDC mint is missing.";
  if (!process.env.NEXT_PUBLIC_RPC_URL) return "Trading is not configured: the Solana devnet RPC URL is missing.";
  if (WICK_IDL.instructions.length === 0) return "Trading is not configured: deploy Wick and export its generated IDL first.";
  return "The on-chain transaction builder is unavailable in this build. No transaction was submitted.";
}
