use crate::{
    error::WickError,
    state::{PRICE_E6, REWARD_SCALE},
};
use anchor_lang::prelude::*;

pub fn side_mark(mark_yes_e6: u32, yes: bool) -> Result<u32> {
    if yes {
        Ok(mark_yes_e6)
    } else {
        u32::try_from(PRICE_E6)
            .unwrap()
            .checked_sub(mark_yes_e6)
            .ok_or_else(|| error!(WickError::MathOverflow))
    }
}

pub fn contracts_e6(margin: u64, leverage: u16, entry_e6: u32) -> Result<u64> {
    require!(entry_e6 > 0, WickError::InvalidPrice);
    let value = (margin as u128)
        .checked_mul(leverage as u128)
        .ok_or(WickError::MathOverflow)?
        .checked_mul(PRICE_E6 as u128)
        .ok_or(WickError::MathOverflow)?
        .checked_div(entry_e6 as u128)
        .ok_or(WickError::MathOverflow)?;
    u64::try_from(value).map_err(|_| error!(WickError::MathOverflow))
}

pub fn pnl_e6(contracts: u64, mark_e6: u32, entry_e6: u32) -> Result<i128> {
    let delta = i128::from(mark_e6) - i128::from(entry_e6);
    (i128::from(contracts))
        .checked_mul(delta)
        .ok_or_else(|| error!(WickError::MathOverflow))?
        .checked_div(i128::from(PRICE_E6))
        .ok_or_else(|| error!(WickError::MathOverflow))
}

/// A trader can never lose more than the margin transferred into the vault.
/// Raw leveraged PnL is still useful for liquidation-distance math, but all
/// economic settlement, LP accounting, events, and emissions use this value.
pub fn cap_loss_to_margin(pnl: i128, margin: u64) -> Result<i128> {
    let floor = i128::from(margin)
        .checked_neg()
        .ok_or_else(|| error!(WickError::MathOverflow))?;
    Ok(pnl.max(floor))
}

/// Surplus is distributable only after every queued payout has priority and
/// only when there are stakers to receive it.
pub fn staker_surplus_e6(
    lp_balance: i128,
    staker_cap: u64,
    queue_owed: u64,
    total_staked: u64,
) -> Result<u64> {
    if queue_owed > 0 || total_staked == 0 || lp_balance <= i128::from(staker_cap) {
        return Ok(0);
    }
    u64::try_from(
        lp_balance
            .checked_sub(i128::from(staker_cap))
            .ok_or(WickError::MathOverflow)?,
    )
    .map_err(|_| error!(WickError::MathOverflow))
}

pub fn liq_mark_e6(entry_e6: u32, leverage: u16, maintenance_bps: u16) -> Result<u32> {
    require!(
        leverage > 0 && maintenance_bps <= 10_000,
        WickError::InvalidParameter
    );
    // Keep the multiply before the final division. Dividing the loss fraction
    // first rounds it down and can move the stored boundary one micro-unit up
    // from the canonical packages/pricing integer formula.
    let leverage_bps = (leverage as u128)
        .checked_mul(10_000)
        .ok_or(WickError::MathOverflow)?;
    let maintenance_discount_bps = 10_000_u128
        .checked_sub(maintenance_bps as u128)
        .ok_or(WickError::MathOverflow)?;
    let retained_bps = leverage_bps
        .checked_sub(maintenance_discount_bps)
        .ok_or(WickError::MathOverflow)?;
    let result = (entry_e6 as u128)
        .checked_mul(retained_bps)
        .ok_or(WickError::MathOverflow)?
        .checked_div(leverage_bps)
        .ok_or(WickError::MathOverflow)?;
    u32::try_from(result).map_err(|_| error!(WickError::MathOverflow))
}

pub fn max_payout_e6(contracts: u64, entry_e6: u32) -> Result<u64> {
    let upside = PRICE_E6
        .checked_sub(entry_e6 as u64)
        .ok_or(WickError::MathOverflow)?;
    let result = (contracts as u128)
        .checked_mul(upside as u128)
        .ok_or(WickError::MathOverflow)?
        .checked_div(PRICE_E6 as u128)
        .ok_or(WickError::MathOverflow)?;
    u64::try_from(result).map_err(|_| error!(WickError::MathOverflow))
}

pub fn fee_on_profit(pnl: i128, fee_bps: u16) -> Result<u64> {
    if pnl <= 0 {
        return Ok(0);
    }
    let result = (pnl as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(WickError::MathOverflow)?
        / 10_000;
    u64::try_from(result).map_err(|_| error!(WickError::MathOverflow))
}

pub fn wicked_emission_e6(
    loss_e6: u64,
    lp_balance: i128,
    threshold: u64,
    c: u64,
    high_watermark: u64,
) -> Result<u64> {
    let base = (loss_e6 as u128)
        .checked_mul(100)
        .ok_or(WickError::MathOverflow)?;
    if lp_balance <= threshold as i128 {
        return u64::try_from(base).map_err(|_| error!(WickError::MathOverflow));
    }
    let denom = (c as u128)
        .checked_add(high_watermark as u128)
        .ok_or(WickError::MathOverflow)?;
    if denom == 0 {
        return Ok(0);
    }
    let c_squared = (c as u128)
        .checked_mul(c as u128)
        .ok_or(WickError::MathOverflow)?;
    let denom_squared = denom.checked_mul(denom).ok_or(WickError::MathOverflow)?;
    let result = base.checked_mul(c_squared).ok_or(WickError::MathOverflow)? / denom_squared;
    u64::try_from(result).map_err(|_| error!(WickError::MathOverflow))
}

pub fn accrued_rewards(amount: u64, reward_per_token_e12: u128, debt_e12: u128) -> Result<u64> {
    let gross = (amount as u128)
        .checked_mul(reward_per_token_e12)
        .ok_or(WickError::MathOverflow)?;
    let delta = gross.saturating_sub(debt_e12) / REWARD_SCALE;
    u64::try_from(delta).map_err(|_| error!(WickError::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_position_math() {
        let q = contracts_e6(100_000_000, 10, 500_000).unwrap();
        assert_eq!(q, 2_000_000_000);
        assert_eq!(pnl_e6(q, 600_000, 500_000).unwrap(), 200_000_000);
        assert_eq!(liq_mark_e6(500_000, 10, 0).unwrap(), 450_000);
        assert_eq!(max_payout_e6(q, 500_000).unwrap(), 1_000_000_000);
    }

    #[test]
    fn liquidation_boundary_is_inclusive() {
        let liq = liq_mark_e6(600_000, 4, 0).unwrap();
        assert_eq!(liq, 450_000);
        assert!(450_000 <= liq);
        assert!(450_001 > liq);
    }

    #[test]
    fn liquidation_vectors_match_typescript_integer_ordering() {
        // These are shared regression vectors for packages/pricing's
        // liquidationMarkE6 formula. The 6x case catches premature division.
        let vectors = [
            (500_000, 6, 0, 416_666),
            (500_000, 10, 0, 450_000),
            (500_000, 10, 500, 452_500),
            (990_000, 7, 125, 850_339),
        ];
        for (entry, leverage, maintenance_bps, expected) in vectors {
            assert_eq!(
                liq_mark_e6(entry, leverage, maintenance_bps).unwrap(),
                expected
            );
        }
    }

    #[test]
    fn emission_curve_reduces_above_threshold() {
        assert_eq!(
            wicked_emission_e6(1_000_000, 0, 10_000_000, 10_000_000, 0).unwrap(),
            100_000_000
        );
        assert_eq!(
            wicked_emission_e6(1_000_000, 20_000_000, 10_000_000, 10_000_000, 10_000_000).unwrap(),
            25_000_000
        );
    }

    #[test]
    fn fees_and_staking_accrual_are_exact() {
        assert_eq!(fee_on_profit(100_000_000, 200).unwrap(), 2_000_000);
        assert_eq!(fee_on_profit(-1, 200).unwrap(), 0);
        assert_eq!(
            accrued_rewards(2_000_000, 3 * REWARD_SCALE, 2_000_000 * REWARD_SCALE).unwrap(),
            4_000_000
        );
    }

    #[test]
    fn realized_loss_is_capped_by_posted_margin() {
        assert_eq!(
            cap_loss_to_margin(-1_000_000_000, 100_000_000).unwrap(),
            -100_000_000
        );
        assert_eq!(
            cap_loss_to_margin(-20_000_000, 100_000_000).unwrap(),
            -20_000_000
        );
        assert_eq!(
            cap_loss_to_margin(50_000_000, 100_000_000).unwrap(),
            50_000_000
        );
    }

    #[test]
    fn staker_surplus_respects_cap_queue_and_stake() {
        assert_eq!(
            staker_surplus_e6(150_000_000, 100_000_000, 0, 10).unwrap(),
            50_000_000
        );
        assert_eq!(
            staker_surplus_e6(150_000_000, 100_000_000, 1, 10).unwrap(),
            0
        );
        assert_eq!(
            staker_surplus_e6(150_000_000, 100_000_000, 0, 0).unwrap(),
            0
        );
        assert_eq!(
            staker_surplus_e6(90_000_000, 100_000_000, 0, 10).unwrap(),
            0
        );
    }

    #[test]
    fn one_thousand_position_vectors_stay_in_bounds() {
        let mut state = 0x6a09e667f3bcc909_u64;
        for _ in 0..1_000 {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            let margin = 1_000_000 + state % 1_000_000_000;
            let leverage = 1 + (state % 1_000) as u16;
            let entry = 10_000 + (state % 980_001) as u32;
            let contracts = contracts_e6(margin, leverage, entry).unwrap();
            let liq = liq_mark_e6(entry, leverage, 0).unwrap();
            assert!(contracts > 0);
            assert!(liq <= entry);
            assert!(max_payout_e6(contracts, entry).is_ok());
            assert_eq!(pnl_e6(contracts, entry, entry).unwrap(), 0);
        }
    }
}
