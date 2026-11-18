export const MICRO = 1_000_000n;
export const PRICE_MICRO = 1_000_000;
export const MIN_PRICE_E6 = 10_000;
export const MAX_PRICE_E6 = 990_000;
export const USDC_DECIMALS = 6;
export const FAUCET_GRANT_E6 = 1_000_000_000n;
export const FAUCET_GRANT_COUNT = 200n;
export const FAUCET_INVENTORY_E6 = FAUCET_GRANT_COUNT * FAUCET_GRANT_E6;
export const DEVNET_CLUSTER = "devnet" as const;
export const PUBLIC_DEVNET_RPC = "https://api.devnet.solana.com";
/** Wick program deployed on devnet. Env vars override it. */
export const DEVNET_PROGRAM_ID = "GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8";
/** Six-decimal test USDC used for margin on devnet (fixed 200,000 supply, mint and freeze authority revoked). */
export const DEVNET_USDC_TEST_MINT = "HLb5ovT6hS5TP5CYhTqZgoHnPh93bCzU5tthZcYWmAgU";
export const SOLANA_DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const GLOBAL_MAX_LEVERAGE = 1_000;
export const DEFAULT_STALE_AFTER_SECS = 6;
