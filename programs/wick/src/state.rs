use anchor_lang::prelude::*;

pub const PRICE_E6: u64 = 1_000_000;
pub const MIN_PRICE_E6: u32 = 10_000;
pub const MAX_PRICE_E6: u32 = 990_000;
pub const REWARD_SCALE: u128 = 1_000_000_000_000;
pub const SYMBOL_MAX: usize = 64;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub usdc_mint: Pubkey,
    pub global_max_leverage: u16,
    pub maintenance_bps: u16,
    pub profit_fee_bps: u16,
    pub liq_fee_bps: u16,
    pub max_payout_bps_of_vault: u16,
    pub max_market_exposure_bps: u16,
    pub liability_allowance: u64,
    pub stale_after_secs: u32,
    pub emission_threshold: u64,
    pub emission_c: u64,
    pub staker_cap: u64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LpState {
    pub balance: i128,
    pub high_watermark: u64,
    pub cumulative_losses: u64,
    pub fees_stakers: u64,
    pub fees_treasury: u64,
    pub queue_head: u64,
    pub queue_tail: u64,
    pub queue_owed: u64,
    pub reward_per_token_e12: u128,
    pub total_staked: u64,
    pub loser_mint: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub symbol_hash: [u8; 32],
    pub gemini_symbol: [u8; SYMBOL_MAX],
    pub symbol_len: u8,
    pub kind: MarketKind,
    pub strike_usd_e6: u64,
    pub open_ts: i64,
    pub expiry_ts: i64,
    pub cutoff_secs: u32,
    pub mark_yes_e6: u32,
    pub mark_ts: i64,
    pub half_spread_e6: u32,
    pub max_leverage: u16,
    pub status: MarketStatus,
    pub outcome: Outcome,
    pub settlement_value_e6: u64,
    pub oi_yes_e6: u64,
    pub oi_no_e6: u64,
    pub net_liability_usdc: u64,
    pub open_positions: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub nonce: u64,
    pub side: Side,
    pub margin: u64,
    pub leverage: u16,
    pub entry_e6: u32,
    pub contracts_e6: u64,
    pub liq_mark_e6: u32,
    pub opened_ts: i64,
    pub status: PositionStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PayoutClaim {
    pub owner: Pubkey,
    pub amount: u64,
    pub paid: u64,
    pub created_ts: i64,
    pub index: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub amount: u64,
    pub reward_debt_e12: u128,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum MarketKind {
    UpDown,
    Ladder,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum MarketStatus {
    Open,
    Halted,
    Expired,
    Settled,
    Invalid,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum Outcome {
    None,
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum Side {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum PositionStatus {
    Open,
    Closed,
    Liquidated,
    Settled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitConfigParams {
    pub keeper: Pubkey,
    pub global_max_leverage: u16,
    pub maintenance_bps: u16,
    pub profit_fee_bps: u16,
    pub liq_fee_bps: u16,
    pub max_payout_bps_of_vault: u16,
    pub max_market_exposure_bps: u16,
    pub liability_allowance: u64,
    pub stale_after_secs: u32,
    pub emission_threshold: u64,
    pub emission_c: u64,
    pub staker_cap: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MutableParams {
    pub global_max_leverage: u16,
    pub maintenance_bps: u16,
    pub profit_fee_bps: u16,
    pub liq_fee_bps: u16,
    pub max_payout_bps_of_vault: u16,
    pub max_market_exposure_bps: u16,
    pub liability_allowance: u64,
    pub stale_after_secs: u32,
    pub emission_threshold: u64,
    pub emission_c: u64,
    pub staker_cap: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MarkUpdate {
    pub market_index: u16,
    pub mark_e6: u32,
    pub max_leverage: u16,
}
