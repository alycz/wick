use anchor_lang::prelude::*;

#[error_code]
pub enum WickError {
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Trading is paused")]
    Paused,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Invalid Gemini symbol or symbol hash")]
    InvalidSymbol,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Market has reached its trading cutoff")]
    MarketCutoff,
    #[msg("Market mark is stale")]
    StaleMark,
    #[msg("Price is outside the tradable range")]
    InvalidPrice,
    #[msg("Leverage exceeds the live market risk cap")]
    LeverageTooHigh,
    #[msg("Slippage limit exceeded")]
    SlippageExceeded,
    #[msg("Position is not open")]
    PositionNotOpen,
    #[msg("Position is not liquidatable")]
    NotLiquidatable,
    #[msg("Market has not expired")]
    MarketNotExpired,
    #[msg("Market is not settled or invalid")]
    MarketNotSettled,
    #[msg("Pool too small for this size — lower leverage or margin")]
    PoolTooSmall,
    #[msg("Market exposure cap exceeded — lower leverage or margin")]
    MarketExposureExceeded,
    #[msg("Payout claim is not at the queue head")]
    ClaimNotAtHead,
    #[msg("Payout claim index does not match the queue tail")]
    InvalidClaimIndex,
    #[msg("Insufficient free vault balance")]
    InsufficientFreeVault,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Staking is locked while rewards await the payout queue")]
    DeferredRewardsPending,
}
