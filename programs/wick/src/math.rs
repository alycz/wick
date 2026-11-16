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

pub fn liq_mark_e6(entry_e6: u32, leverage: u16, maintenance_bps: u16) -> Result<u32> {
    require!(
        leverage > 0 && maintenance_bps <= 10_000,
        WickError::InvalidParameter
    );
    let maintenance_e6 = (maintenance_bps as u128)
        .checked_mul(100)
        .ok_or(WickError::MathOverflow)?;
    let loss_fraction_e6 = (PRICE_E6 as u128)
        .checked_sub(maintenance_e6)
        .ok_or(WickError::MathOverflow)?
        .checked_div(leverage as u128)
        .ok_or(WickError::MathOverflow)?;
    let multiplier = (PRICE_E6 as u128)
        .checked_sub(loss_fraction_e6)
        .ok_or(WickError::MathOverflow)?;
    let result = (entry_e6 as u128)
        .checked_mul(multiplier)
        .ok_or(WickError::MathOverflow)?
        .checked_div(PRICE_E6 as u128)
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
