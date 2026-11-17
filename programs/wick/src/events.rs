use crate::state::{MarketKind, Outcome, Side};
use anchor_lang::prelude::*;

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub usdc_mint: Pubkey,
    pub loser_mint: Pubkey,
}
#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub symbol_hash: [u8; 32],
    pub kind: MarketKind,
    pub strike_usd_e6: u64,
    pub open_ts: i64,
    pub expiry_ts: i64,
}
#[event]
pub struct MarksUpdated {
    pub count: u16,
    pub slot: u64,
}
#[event]
pub struct PositionOpened {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub market: Pubkey,
    pub side: Side,
    pub margin: u64,
    pub leverage: u16,
    pub entry_e6: u32,
    pub contracts_e6: u64,
    pub liq_mark_e6: u32,
}
#[event]
pub struct PositionClosed {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub exit_e6: u32,
    pub pnl_e6: i128,
    pub fee_e6: u64,
    pub paid_e6: u64,
}
#[event]
pub struct PositionLiquidated {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub margin_e6: u64,
    pub liq_fee_e6: u64,
    pub wicked_minted_e6: u64,
}
#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub outcome: Outcome,
    pub settlement_value_e6: u64,
}
#[event]
pub struct MarketVoided {
    pub market: Pubkey,
}
#[event]
pub struct PositionSettled {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub outcome: Outcome,
    pub pnl_e6: i128,
    pub paid_e6: u64,
}
#[event]
pub struct ClaimQueued {
    pub claim: Pubkey,
    pub index: u64,
    pub owner: Pubkey,
    pub amount: u64,
}
#[event]
pub struct ClaimPaid {
    pub claim: Pubkey,
    pub index: u64,
    pub owner: Pubkey,
    pub amount: u64,
    pub complete: bool,
}
#[event]
pub struct Staked {
    pub owner: Pubkey,
    pub amount: u64,
    pub total: u64,
}
#[event]
pub struct Unstaked {
    pub owner: Pubkey,
    pub amount: u64,
    pub total: u64,
}
#[event]
pub struct RewardsClaimed {
    pub owner: Pubkey,
    pub amount: u64,
}
#[event]
pub struct ParamsUpdated {
    pub admin: Pubkey,
}
#[event]
pub struct PausedUpdated {
    pub paused: bool,
}
#[event]
pub struct KeeperUpdated {
    pub keeper: Pubkey,
}
#[event]
pub struct LpUpdated {
    pub balance: i128,
    pub queue_owed: u64,
}

/// Cross-language conformance proof emitted by the read-only vector verifier.
#[event]
pub struct MathVectorsVerified {
    pub seed: u64,
    pub count: u16,
    pub accumulators: [u64; 4],
}
