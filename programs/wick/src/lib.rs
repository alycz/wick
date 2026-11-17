use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, TransferChecked};

pub mod error;
pub mod events;
pub mod math;
pub mod state;

use error::WickError;
use events::*;
use math::*;
use state::*;

declare_id!("EBfYyDsDq4rEL9hqi7CwbM3rW1zYvBAfdRcWLdbWeMxi");

#[program]
pub mod wick {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, params: InitConfigParams) -> Result<()> {
        validate_config_params(&params)?;
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.keeper = params.keeper;
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.global_max_leverage = params.global_max_leverage;
        config.maintenance_bps = params.maintenance_bps;
        config.profit_fee_bps = params.profit_fee_bps;
        config.liq_fee_bps = params.liq_fee_bps;
        config.max_payout_bps_of_vault = params.max_payout_bps_of_vault;
        config.max_market_exposure_bps = params.max_market_exposure_bps;
        config.liability_allowance = params.liability_allowance;
        config.stale_after_secs = params.stale_after_secs;
        config.emission_threshold = params.emission_threshold;
        config.emission_c = params.emission_c;
        config.staker_cap = params.staker_cap;
        config.paused = false;
        config.bump = ctx.bumps.config;

        let lp = &mut ctx.accounts.lp;
        lp.balance = 0;
        lp.high_watermark = 0;
        lp.cumulative_losses = 0;
        lp.fees_stakers = 0;
        lp.fees_treasury = 0;
        lp.queue_head = 0;
        lp.queue_tail = 0;
        lp.queue_owed = 0;
        lp.reward_per_token_e12 = 0;
        lp.total_staked = 0;
        lp.loser_mint = ctx.accounts.loser_mint.key();
        lp.bump = ctx.bumps.lp;

        emit!(ConfigInitialized {
            admin: config.admin,
            keeper: config.keeper,
            usdc_mint: config.usdc_mint,
            loser_mint: lp.loser_mint
        });
        emit_lp(lp);
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_market(
        ctx: Context<CreateMarket>,
        symbol: String,
        symbol_hash: [u8; 32],
        kind: MarketKind,
        strike_usd_e6: u64,
        open_ts: i64,
        expiry_ts: i64,
        cutoff_secs: u32,
        half_spread_e6: u32,
    ) -> Result<()> {
        require_keeper(&ctx.accounts.config, &ctx.accounts.keeper)?;
        require!(!ctx.accounts.config.paused, WickError::Paused);
        require!(
            !symbol.is_empty() && symbol.len() <= SYMBOL_MAX,
            WickError::InvalidSymbol
        );
        require!(
            hash(symbol.as_bytes()).to_bytes() == symbol_hash,
            WickError::InvalidSymbol
        );
        require!(
            strike_usd_e6 > 0 && expiry_ts > open_ts && cutoff_secs > 0,
            WickError::InvalidParameter
        );
        require!(half_spread_e6 < MIN_PRICE_E6, WickError::InvalidParameter);
        let market = &mut ctx.accounts.market;
        market.symbol_hash = symbol_hash;
        market.gemini_symbol = [0; SYMBOL_MAX];
        market.gemini_symbol[..symbol.len()].copy_from_slice(symbol.as_bytes());
        market.symbol_len = symbol.len() as u8;
        market.kind = kind;
        market.strike_usd_e6 = strike_usd_e6;
        market.open_ts = open_ts;
        market.expiry_ts = expiry_ts;
        market.cutoff_secs = cutoff_secs;
        market.mark_yes_e6 = 0;
        market.mark_ts = 0;
        market.half_spread_e6 = half_spread_e6;
        market.max_leverage = 1;
        market.status = MarketStatus::Open;
        market.outcome = Outcome::None;
        market.settlement_value_e6 = 0;
        market.oi_yes_e6 = 0;
        market.oi_no_e6 = 0;
        market.net_liability_usdc = 0;
        market.open_positions = 0;
        market.bump = ctx.bumps.market;
        emit!(MarketCreated {
            market: market.key(),
            symbol_hash,
            kind,
            strike_usd_e6,
            open_ts,
            expiry_ts
        });
        Ok(())
    }

    pub fn update_marks<'info>(
        ctx: Context<'_, '_, 'info, 'info, UpdateMarks<'info>>,
        updates: Vec<MarkUpdate>,
    ) -> Result<()> {
        require_keeper(&ctx.accounts.config, &ctx.accounts.keeper)?;
        require!(
            !updates.is_empty() && updates.len() == ctx.remaining_accounts.len(),
            WickError::InvalidParameter
        );
        let now = Clock::get()?.unix_timestamp;
        for update in &updates {
            require!(
                update.mark_e6 >= MIN_PRICE_E6 && update.mark_e6 <= MAX_PRICE_E6,
                WickError::InvalidPrice
            );
            require!(
                update.max_leverage > 0
                    && update.max_leverage <= ctx.accounts.config.global_max_leverage,
                WickError::LeverageTooHigh
            );
            let index = usize::from(update.market_index);
            let info = ctx
                .remaining_accounts
                .get(index)
                .ok_or(WickError::InvalidParameter)?;
            require!(
                info.is_writable && info.owner == ctx.program_id,
                WickError::InvalidParameter
            );
            let mut market = Account::<Market>::try_from(info)?;
            require!(
                market.status == MarketStatus::Open,
                WickError::MarketNotOpen
            );
            market.mark_yes_e6 = update.mark_e6;
            market.mark_ts = now;
            market.max_leverage = update.max_leverage;
            market.exit(ctx.program_id)?;
        }
        emit!(MarksUpdated {
            count: updates.len() as u16,
            slot: Clock::get()?.slot
        });
        Ok(())
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        side: Side,
        margin: u64,
        leverage: u16,
        max_entry_e6: u32,
        nonce: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let market = &mut ctx.accounts.market;
        let now = Clock::get()?.unix_timestamp;
        require!(!config.paused, WickError::Paused);
        require!(
            market.status == MarketStatus::Open,
            WickError::MarketNotOpen
        );
        require!(
            now >= market.open_ts && now < market.expiry_ts - i64::from(market.cutoff_secs),
            WickError::MarketCutoff
        );
        require!(
            market.mark_ts > 0
                && now.saturating_sub(market.mark_ts) <= i64::from(config.stale_after_secs),
            WickError::StaleMark
        );
        require!(
            margin > 0
                && leverage > 0
                && leverage <= config.global_max_leverage
                && leverage <= market.max_leverage,
            WickError::LeverageTooHigh
        );
        let yes = side == Side::Yes;
        let mark = side_mark(market.mark_yes_e6, yes)?;
        let entry = mark
            .checked_add(market.half_spread_e6)
            .ok_or(WickError::MathOverflow)?;
        require!(
            entry <= max_entry_e6 && entry <= MAX_PRICE_E6,
            WickError::SlippageExceeded
        );
        let contracts = contracts_e6(margin, leverage, entry)?;
        let liquidation = liq_mark_e6(entry, leverage, config.maintenance_bps)?;
        let max_payout = max_payout_e6(contracts, entry)?;
        let free = ctx
            .accounts
            .vault
            .amount
            .saturating_sub(ctx.accounts.lp.queue_owed);
        let capital = free
            .checked_add(config.liability_allowance)
            .ok_or(WickError::MathOverflow)?;
        let payout_cap = bps_of(capital, config.max_payout_bps_of_vault)?;
        require!(max_payout <= payout_cap, WickError::PoolTooSmall);
        let exposure_cap = bps_of(capital, config.max_market_exposure_bps)?;
        let next_exposure = market
            .net_liability_usdc
            .checked_add(max_payout)
            .ok_or(WickError::MathOverflow)?;
        require!(
            next_exposure <= exposure_cap,
            WickError::MarketExposureExceeded
        );

        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.trader_usdc,
            &ctx.accounts.vault,
            &ctx.accounts.trader.to_account_info(),
            &ctx.accounts.usdc_mint,
            margin,
            None,
        )?;
        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.trader.key();
        position.market = market.key();
        position.nonce = nonce;
        position.side = side;
        position.margin = margin;
        position.leverage = leverage;
        position.entry_e6 = entry;
        position.contracts_e6 = contracts;
        position.liq_mark_e6 = liquidation;
        position.opened_ts = now;
        position.status = PositionStatus::Open;
        position.bump = ctx.bumps.position;
        if yes {
            market.oi_yes_e6 = market
                .oi_yes_e6
                .checked_add(contracts)
                .ok_or(WickError::MathOverflow)?;
        } else {
            market.oi_no_e6 = market
                .oi_no_e6
                .checked_add(contracts)
                .ok_or(WickError::MathOverflow)?;
        }
        market.net_liability_usdc = next_exposure;
        market.open_positions = market
            .open_positions
            .checked_add(1)
            .ok_or(WickError::MathOverflow)?;
        emit!(PositionOpened {
            position: position.key(),
            owner: position.owner,
            market: position.market,
            side,
            margin,
            leverage,
            entry_e6: entry,
            contracts_e6: contracts,
            liq_mark_e6: liquidation
        });
        Ok(())
    }

    pub fn close_position(
        mut ctx: Context<ClosePosition>,
        min_exit_e6: u32,
        claim_index: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.position.status == PositionStatus::Open,
            WickError::PositionNotOpen
        );
        require!(
            ctx.accounts.market.status == MarketStatus::Open,
            WickError::MarketNotOpen
        );
        require!(
            ctx.accounts.market.mark_ts > 0
                && now.saturating_sub(ctx.accounts.market.mark_ts)
                    <= i64::from(ctx.accounts.config.stale_after_secs),
            WickError::StaleMark
        );
        let yes = ctx.accounts.position.side == Side::Yes;
        let mark = side_mark(ctx.accounts.market.mark_yes_e6, yes)?;
        let exit = mark.saturating_sub(ctx.accounts.market.half_spread_e6);
        require!(exit >= min_exit_e6, WickError::SlippageExceeded);
        settle_open_position(&mut ctx, exit, None, claim_index, false)?;
        Ok(())
    }

    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        require!(
            ctx.accounts.position.status == PositionStatus::Open,
            WickError::PositionNotOpen
        );
        require!(
            market_allows_liquidation(ctx.accounts.market.status),
            WickError::MarketNotOpen
        );
        let mark = side_mark(
            ctx.accounts.market.mark_yes_e6,
            ctx.accounts.position.side == Side::Yes,
        )?;
        require!(
            mark <= ctx.accounts.position.liq_mark_e6,
            WickError::NotLiquidatable
        );
        let margin = ctx.accounts.position.margin;
        let fee = bps_of(margin, ctx.accounts.config.liq_fee_bps)?;
        add_fee(&mut ctx.accounts.lp, fee)?;
        ctx.accounts.lp.balance = ctx
            .accounts
            .lp
            .balance
            .checked_add(i128::from(margin.saturating_sub(fee)))
            .ok_or(WickError::MathOverflow)?;
        ctx.accounts.lp.cumulative_losses = ctx
            .accounts
            .lp
            .cumulative_losses
            .checked_add(margin)
            .ok_or(WickError::MathOverflow)?;
        update_high_watermark(&mut ctx.accounts.lp);
        distribute_staker_surplus(&mut ctx.accounts.lp, ctx.accounts.config.staker_cap)?;
        let emission = wicked_emission_e6(
            margin,
            ctx.accounts.lp.balance,
            ctx.accounts.config.emission_threshold,
            ctx.accounts.config.emission_c,
            ctx.accounts.lp.high_watermark,
        )?;
        mint_wicked(
            &ctx.accounts.token_program,
            &ctx.accounts.loser_mint,
            &ctx.accounts.owner_wicked,
            &ctx.accounts.lp.to_account_info(),
            ctx.accounts.lp.bump,
            emission,
        )?;
        decrement_market_position(&mut ctx.accounts.market, &ctx.accounts.position)?;
        ctx.accounts.position.status = PositionStatus::Liquidated;
        emit!(PositionLiquidated {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.position.owner,
            margin_e6: margin,
            liq_fee_e6: fee,
            wicked_minted_e6: emission
        });
        emit_lp(&ctx.accounts.lp);
        Ok(())
    }

    pub fn settle_market(
        ctx: Context<SettleMarket>,
        outcome: Outcome,
        settlement_value_e6: u64,
    ) -> Result<()> {
        require_keeper(&ctx.accounts.config, &ctx.accounts.keeper)?;
        require!(
            Clock::get()?.unix_timestamp >= ctx.accounts.market.expiry_ts,
            WickError::MarketNotExpired
        );
        require!(
            ctx.accounts.market.status == MarketStatus::Open
                || ctx.accounts.market.status == MarketStatus::Expired,
            WickError::MarketNotOpen
        );
        require!(
            outcome == Outcome::Yes || outcome == Outcome::No,
            WickError::InvalidParameter
        );
        ctx.accounts.market.status = MarketStatus::Settled;
        ctx.accounts.market.outcome = outcome;
        ctx.accounts.market.settlement_value_e6 = settlement_value_e6;
        emit!(MarketSettled {
            market: ctx.accounts.market.key(),
            outcome,
            settlement_value_e6
        });
        Ok(())
    }

    pub fn void_market(ctx: Context<SettleMarket>) -> Result<()> {
        require_keeper(&ctx.accounts.config, &ctx.accounts.keeper)?;
        require!(
            Clock::get()?.unix_timestamp >= ctx.accounts.market.expiry_ts,
            WickError::MarketNotExpired
        );
        ctx.accounts.market.status = MarketStatus::Invalid;
        ctx.accounts.market.outcome = Outcome::None;
        emit!(MarketVoided {
            market: ctx.accounts.market.key()
        });
        Ok(())
    }

    pub fn settle_position(mut ctx: Context<SettlePosition>, claim_index: u64) -> Result<()> {
        require!(
            ctx.accounts.position.status == PositionStatus::Open,
            WickError::PositionNotOpen
        );
        require!(
            ctx.accounts.market.status == MarketStatus::Settled
                || ctx.accounts.market.status == MarketStatus::Invalid,
            WickError::MarketNotSettled
        );
        if ctx.accounts.market.status == MarketStatus::Invalid {
            let margin = ctx.accounts.position.margin;
            pay_or_queue_settlement(&mut ctx, margin, 0, 0, claim_index, Outcome::None)?;
        } else {
            let won = (ctx.accounts.position.side == Side::Yes
                && ctx.accounts.market.outcome == Outcome::Yes)
                || (ctx.accounts.position.side == Side::No
                    && ctx.accounts.market.outcome == Outcome::No);
            let mark = if won { PRICE_E6 as u32 } else { 0 };
            let raw_pnl = pnl_e6(
                ctx.accounts.position.contracts_e6,
                mark,
                ctx.accounts.position.entry_e6,
            )?;
            let pnl = cap_loss_to_margin(raw_pnl, ctx.accounts.position.margin)?;
            let fee = fee_on_profit(pnl, ctx.accounts.config.profit_fee_bps)?;
            let owed = nonnegative_owed(ctx.accounts.position.margin, pnl, fee)?;
            apply_lp_pnl(
                &mut ctx.accounts.lp,
                pnl,
                fee,
                ctx.accounts.config.staker_cap,
            )?;
            if pnl < 0 {
                let loss = u64::try_from(-pnl).map_err(|_| error!(WickError::MathOverflow))?;
                let emission = wicked_emission_e6(
                    loss,
                    ctx.accounts.lp.balance,
                    ctx.accounts.config.emission_threshold,
                    ctx.accounts.config.emission_c,
                    ctx.accounts.lp.high_watermark,
                )?;
                mint_wicked(
                    &ctx.accounts.token_program,
                    &ctx.accounts.loser_mint,
                    &ctx.accounts.owner_wicked,
                    &ctx.accounts.lp.to_account_info(),
                    ctx.accounts.lp.bump,
                    emission,
                )?;
            }
            let outcome = ctx.accounts.market.outcome;
            pay_or_queue_settlement(&mut ctx, owed, pnl, fee, claim_index, outcome)?;
        }
        Ok(())
    }

    pub fn claim_queue(ctx: Context<ClaimQueue>) -> Result<()> {
        require!(
            ctx.accounts.claim.index == ctx.accounts.lp.queue_head,
            WickError::ClaimNotAtHead
        );
        let remaining = ctx
            .accounts
            .claim
            .amount
            .saturating_sub(ctx.accounts.claim.paid);
        require!(remaining > 0, WickError::NothingToClaim);
        let free = ctx
            .accounts
            .vault
            .amount
            .saturating_sub(ctx.accounts.lp.queue_owed);
        let pay = remaining.min(free);
        require!(pay > 0, WickError::InsufficientFreeVault);
        transfer_from_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.owner_usdc,
            &ctx.accounts.usdc_mint,
            pay,
        )?;
        ctx.accounts.claim.paid = ctx
            .accounts
            .claim
            .paid
            .checked_add(pay)
            .ok_or(WickError::MathOverflow)?;
        ctx.accounts.lp.queue_owed = ctx.accounts.lp.queue_owed.saturating_sub(pay);
        let complete = ctx.accounts.claim.paid == ctx.accounts.claim.amount;
        if complete {
            ctx.accounts.lp.queue_head = ctx
                .accounts
                .lp
                .queue_head
                .checked_add(1)
                .ok_or(WickError::MathOverflow)?;
        }
        distribute_staker_surplus(&mut ctx.accounts.lp, ctx.accounts.config.staker_cap)?;
        emit!(ClaimPaid {
            claim: ctx.accounts.claim.key(),
            index: ctx.accounts.claim.index,
            owner: ctx.accounts.claim.owner,
            amount: pay,
            complete
        });
        emit_lp(&ctx.accounts.lp);
        close_claim_if_complete(
            &ctx.accounts.claim,
            ctx.accounts.owner.to_account_info(),
            complete,
        )?;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, WickError::InvalidParameter);
        let pending = accrued_rewards(
            ctx.accounts.stake_account.amount,
            ctx.accounts.lp.reward_per_token_e12,
            ctx.accounts.stake_account.reward_debt_e12,
        )?;
        require!(pending == 0, WickError::InvalidParameter);
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.owner_wicked,
            &ctx.accounts.staking_vault,
            &ctx.accounts.owner.to_account_info(),
            &ctx.accounts.loser_mint,
            amount,
            None,
        )?;
        let stake = &mut ctx.accounts.stake_account;
        if stake.owner == Pubkey::default() {
            stake.owner = ctx.accounts.owner.key();
            stake.bump = ctx.bumps.stake_account;
        }
        stake.amount = stake
            .amount
            .checked_add(amount)
            .ok_or(WickError::MathOverflow)?;
        ctx.accounts.lp.total_staked = ctx
            .accounts
            .lp
            .total_staked
            .checked_add(amount)
            .ok_or(WickError::MathOverflow)?;
        stake.reward_debt_e12 = (stake.amount as u128)
            .checked_mul(ctx.accounts.lp.reward_per_token_e12)
            .ok_or(WickError::MathOverflow)?;
        emit!(Staked {
            owner: stake.owner,
            amount,
            total: stake.amount
        });
        Ok(())
    }

    pub fn unstake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(
            amount > 0 && amount <= ctx.accounts.stake_account.amount,
            WickError::InvalidParameter
        );
        let pending = accrued_rewards(
            ctx.accounts.stake_account.amount,
            ctx.accounts.lp.reward_per_token_e12,
            ctx.accounts.stake_account.reward_debt_e12,
        )?;
        require!(pending == 0, WickError::InvalidParameter);
        let lp_bump = ctx.accounts.lp.bump;
        let signer: &[&[&[u8]]] = &[&[b"lp", &[lp_bump]]];
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.staking_vault,
            &ctx.accounts.owner_wicked,
            &ctx.accounts.lp.to_account_info(),
            &ctx.accounts.loser_mint,
            amount,
            Some(signer),
        )?;
        ctx.accounts.stake_account.amount -= amount;
        ctx.accounts.lp.total_staked -= amount;
        ctx.accounts.stake_account.reward_debt_e12 = (ctx.accounts.stake_account.amount as u128)
            .checked_mul(ctx.accounts.lp.reward_per_token_e12)
            .ok_or(WickError::MathOverflow)?;
        emit!(Unstaked {
            owner: ctx.accounts.owner.key(),
            amount,
            total: ctx.accounts.stake_account.amount
        });
        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let amount = accrued_rewards(
            ctx.accounts.stake_account.amount,
            ctx.accounts.lp.reward_per_token_e12,
            ctx.accounts.stake_account.reward_debt_e12,
        )?;
        require!(amount > 0, WickError::NothingToClaim);
        require!(
            ctx.accounts.lp.queue_owed == 0,
            WickError::InsufficientFreeVault
        );
        transfer_from_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.owner_usdc,
            &ctx.accounts.usdc_mint,
            amount,
        )?;
        ctx.accounts.stake_account.reward_debt_e12 = (ctx.accounts.stake_account.amount as u128)
            .checked_mul(ctx.accounts.lp.reward_per_token_e12)
            .ok_or(WickError::MathOverflow)?;
        ctx.accounts.lp.fees_stakers = ctx.accounts.lp.fees_stakers.saturating_sub(amount);
        emit!(RewardsClaimed {
            owner: ctx.accounts.owner.key(),
            amount
        });
        Ok(())
    }

    pub fn set_params(ctx: Context<AdminConfig>, params: MutableParams) -> Result<()> {
        require_admin(&ctx.accounts.config, &ctx.accounts.admin)?;
        let candidate = InitConfigParams {
            keeper: ctx.accounts.config.keeper,
            global_max_leverage: params.global_max_leverage,
            maintenance_bps: params.maintenance_bps,
            profit_fee_bps: params.profit_fee_bps,
            liq_fee_bps: params.liq_fee_bps,
            max_payout_bps_of_vault: params.max_payout_bps_of_vault,
            max_market_exposure_bps: params.max_market_exposure_bps,
            liability_allowance: params.liability_allowance,
            stale_after_secs: params.stale_after_secs,
            emission_threshold: params.emission_threshold,
            emission_c: params.emission_c,
            staker_cap: params.staker_cap,
        };
        validate_config_params(&candidate)?;
        let c = &mut ctx.accounts.config;
        c.global_max_leverage = params.global_max_leverage;
        c.maintenance_bps = params.maintenance_bps;
        c.profit_fee_bps = params.profit_fee_bps;
        c.liq_fee_bps = params.liq_fee_bps;
        c.max_payout_bps_of_vault = params.max_payout_bps_of_vault;
        c.max_market_exposure_bps = params.max_market_exposure_bps;
        c.liability_allowance = params.liability_allowance;
        c.stale_after_secs = params.stale_after_secs;
        c.emission_threshold = params.emission_threshold;
        c.emission_c = params.emission_c;
        c.staker_cap = params.staker_cap;
        emit!(ParamsUpdated {
            admin: ctx.accounts.admin.key()
        });
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        require_admin(&ctx.accounts.config, &ctx.accounts.admin)?;
        ctx.accounts.config.paused = paused;
        emit!(PausedUpdated { paused });
        Ok(())
    }

    pub fn set_keeper(ctx: Context<AdminConfig>, keeper: Pubkey) -> Result<()> {
        require_admin(&ctx.accounts.config, &ctx.accounts.admin)?;
        require!(keeper != Pubkey::default(), WickError::InvalidParameter);
        ctx.accounts.config.keeper = keeper;
        emit!(KeeperUpdated { keeper });
        Ok(())
    }

    /// Checks deterministic TypeScript pricing vectors inside the deployed
    /// program. This mutates no accounts and is compute-bounded per call.
    pub fn verify_math_vectors(
        _ctx: Context<VerifyMathVectors>,
        seed: u64,
        count: u16,
        expected: [u64; 4],
    ) -> Result<()> {
        require!(count > 0 && count <= 100, WickError::InvalidParameter);
        let mut state = seed;
        let mut actual = [0_u64; 4];
        for _ in 0..count {
            state = xorshift64(state);
            let margin = 1_000_000 + state % 1_000_000_000;
            state = xorshift64(state);
            let leverage = 1 + (state % 1_000) as u16;
            state = xorshift64(state);
            let entry = 10_000 + (state % 980_001) as u32;
            state = xorshift64(state);
            let maintenance_bps = (state % 1_001) as u16;
            state = xorshift64(state);
            let mark = 10_000 + (state % 980_001) as u32;

            let contracts = contracts_e6(margin, leverage, entry)?;
            let liquidation = liq_mark_e6(entry, leverage, maintenance_bps)?;
            let pnl = pnl_e6(contracts, mark, entry)?;
            let payout = max_payout_e6(contracts, entry)?;
            actual[0] = actual[0].wrapping_add(contracts);
            actual[1] = actual[1].wrapping_add(u64::from(liquidation));
            actual[2] = actual[2].wrapping_add(pnl as u64);
            actual[3] = actual[3].wrapping_add(payout);
        }
        require!(actual == expected, WickError::InvalidParameter);
        emit!(MathVectorsVerified {
            seed,
            count,
            accumulators: actual,
        });
        Ok(())
    }
}

fn xorshift64(mut value: u64) -> u64 {
    value ^= value.wrapping_shl(13);
    value ^= value.wrapping_shr(7);
    value ^= value.wrapping_shl(17);
    value
}

#[derive(Accounts)]
pub struct VerifyMathVectors {}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = admin, space = 8 + LpState::INIT_SPACE, seeds = [b"lp"], bump)]
    pub lp: Account<'info, LpState>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(init, payer = admin, seeds = [b"vault"], bump, token::mint = usdc_mint, token::authority = vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(init, payer = admin, seeds = [b"wicked"], bump, mint::decimals = 6, mint::authority = lp, mint::freeze_authority = lp)]
    pub loser_mint: Account<'info, Mint>,
    #[account(init, payer = admin, seeds = [b"staking_vault"], bump, token::mint = loser_mint, token::authority = lp)]
    pub staking_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(symbol: String, symbol_hash: [u8; 32])]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = keeper, space = 8 + Market::INIT_SPACE, seeds = [b"market", symbol_hash.as_ref()], bump)]
    pub market: Account<'info, Market>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMarks<'info> {
    pub keeper: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(side: Side, margin: u64, leverage: u16, max_entry_e6: u32, nonce: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = usdc_mint)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"lp"], bump = lp.bump)]
    pub lp: Account<'info, LpState>,
    #[account(mut, seeds = [b"vault"], bump, token::mint = usdc_mint, token::authority = vault)]
    pub vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, token::mint = usdc_mint, token::authority = trader)]
    pub trader_usdc: Account<'info, TokenAccount>,
    #[account(init, payer = trader, space = 8 + Position::INIT_SPACE, seeds = [b"pos", market.key().as_ref(), trader.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub position: Account<'info, Position>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(min_exit_e6: u32, claim_index: u64)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = usdc_mint)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = owner, has_one = market, close = owner)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"lp"], bump = lp.bump, has_one = loser_mint)]
    pub lp: Account<'info, LpState>,
    #[account(mut, seeds = [b"vault"], bump, token::mint = usdc_mint, token::authority = vault)]
    pub vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = owner)]
    pub owner_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub loser_mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = owner, associated_token::mint = loser_mint, associated_token::authority = owner)]
    pub owner_wicked: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = owner, space = 8 + PayoutClaim::INIT_SPACE, seeds = [b"claim", claim_index.to_le_bytes().as_ref()], bump)]
    pub claim: Account<'info, PayoutClaim>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market, close = owner)]
    pub position: Account<'info, Position>,
    /// CHECK: constrained to the position owner and receives no lamports in this instruction.
    #[account(mut, address = position.owner)]
    pub owner: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"lp"], bump = lp.bump, has_one = loser_mint)]
    pub lp: Account<'info, LpState>,
    #[account(mut)]
    pub loser_mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = liquidator, associated_token::mint = loser_mint, associated_token::authority = owner)]
    pub owner_wicked: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    pub keeper: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
#[instruction(claim_index: u64)]
pub struct SettlePosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = usdc_mint)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market, close = owner)]
    pub position: Account<'info, Position>,
    /// CHECK: constrained to the position owner.
    #[account(mut, address = position.owner)]
    pub owner: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"lp"], bump = lp.bump, has_one = loser_mint)]
    pub lp: Account<'info, LpState>,
    #[account(mut, seeds = [b"vault"], bump, token::mint = usdc_mint, token::authority = vault)]
    pub vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = payer, associated_token::mint = usdc_mint, associated_token::authority = owner)]
    pub owner_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub loser_mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = payer, associated_token::mint = loser_mint, associated_token::authority = owner)]
    pub owner_wicked: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = payer, space = 8 + PayoutClaim::INIT_SPACE, seeds = [b"claim", claim_index.to_le_bytes().as_ref()], bump)]
    pub claim: Account<'info, PayoutClaim>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimQueue<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"lp"], bump = lp.bump)]
    pub lp: Account<'info, LpState>,
    #[account(mut, seeds = [b"vault"], bump, token::mint = usdc_mint, token::authority = vault)]
    pub vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"claim", claim.index.to_le_bytes().as_ref()], bump = claim.bump)]
    pub claim: Account<'info, PayoutClaim>,
    /// CHECK: constrained to claim.owner.
    #[account(mut, address = claim.owner)]
    pub owner: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, associated_token::mint = usdc_mint, associated_token::authority = owner)]
    pub owner_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"lp"], bump = lp.bump, has_one = loser_mint)]
    pub lp: Account<'info, LpState>,
    #[account(mut)]
    pub loser_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = loser_mint, associated_token::authority = owner)]
    pub owner_wicked: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"staking_vault"], bump, token::mint = loser_mint, token::authority = lp)]
    pub staking_vault: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = owner, space = 8 + StakeAccount::INIT_SPACE, seeds = [b"stake", owner.key().as_ref()], bump)]
    pub stake_account: Account<'info, StakeAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"lp"], bump = lp.bump)]
    pub lp: Account<'info, LpState>,
    #[account(mut, seeds = [b"vault"], bump, token::mint = usdc_mint, token::authority = vault)]
    pub vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = owner)]
    pub owner_usdc: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"stake", owner.key().as_ref()], bump = stake_account.bump, has_one = owner)]
    pub stake_account: Account<'info, StakeAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
}

fn validate_config_params(params: &InitConfigParams) -> Result<()> {
    require!(
        params.keeper != Pubkey::default()
            && params.global_max_leverage > 0
            && params.global_max_leverage <= 1_000,
        WickError::InvalidParameter
    );
    require!(
        params.maintenance_bps <= 10_000
            && params.profit_fee_bps <= 10_000
            && params.liq_fee_bps <= 10_000,
        WickError::InvalidParameter
    );
    require!(
        params.max_payout_bps_of_vault <= 10_000
            && params.max_market_exposure_bps <= 10_000
            && params.stale_after_secs > 0,
        WickError::InvalidParameter
    );
    Ok(())
}

fn require_keeper(config: &Config, keeper: &Signer) -> Result<()> {
    require_keys_eq!(config.keeper, keeper.key(), WickError::Unauthorized);
    Ok(())
}
fn require_admin(config: &Config, admin: &Signer) -> Result<()> {
    require_keys_eq!(config.admin, admin.key(), WickError::Unauthorized);
    Ok(())
}
fn bps_of(value: u64, bps: u16) -> Result<u64> {
    u64::try_from(
        (value as u128)
            .checked_mul(bps as u128)
            .ok_or(WickError::MathOverflow)?
            / 10_000,
    )
    .map_err(|_| error!(WickError::MathOverflow))
}

fn transfer_tokens<'info>(
    token_program: &Program<'info, Token>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    mint: &Account<'info, Mint>,
    amount: u64,
    signer: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let cpi = TransferChecked {
        from: from.to_account_info(),
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: authority.clone(),
    };
    let context = CpiContext::new(token_program.to_account_info(), cpi);
    match signer {
        Some(seeds) => token::transfer_checked(context.with_signer(seeds), amount, mint.decimals),
        None => token::transfer_checked(context, amount, mint.decimals),
    }
}

fn transfer_from_vault<'info>(
    token_program: &Program<'info, Token>,
    vault: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    amount: u64,
) -> Result<()> {
    let bump = Pubkey::find_program_address(&[b"vault"], &crate::ID).1;
    let signer: &[&[&[u8]]] = &[&[b"vault", &[bump]]];
    transfer_tokens(
        token_program,
        vault,
        destination,
        &vault.to_account_info(),
        mint,
        amount,
        Some(signer),
    )
}

fn mint_wicked<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, Mint>,
    destination: &Account<'info, TokenAccount>,
    lp_info: &AccountInfo<'info>,
    lp_bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let signer: &[&[&[u8]]] = &[&[b"lp", &[lp_bump]]];
    token::mint_to(
        CpiContext::new(
            token_program.to_account_info(),
            MintTo {
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: lp_info.clone(),
            },
        )
        .with_signer(signer),
        amount,
    )
}

fn increment_reward_per_token(lp: &mut LpState, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    if lp.total_staked > 0 {
        let increment = (amount as u128)
            .checked_mul(REWARD_SCALE)
            .ok_or(WickError::MathOverflow)?
            / lp.total_staked as u128;
        lp.reward_per_token_e12 = lp
            .reward_per_token_e12
            .checked_add(increment)
            .ok_or(WickError::MathOverflow)?;
    }
    Ok(())
}

fn add_fee(lp: &mut LpState, fee: u64) -> Result<()> {
    let stakers = fee / 2;
    let treasury = fee.saturating_sub(stakers);
    lp.fees_stakers = lp
        .fees_stakers
        .checked_add(stakers)
        .ok_or(WickError::MathOverflow)?;
    lp.fees_treasury = lp
        .fees_treasury
        .checked_add(treasury)
        .ok_or(WickError::MathOverflow)?;
    if lp.queue_owed == 0 {
        increment_reward_per_token(lp, stakers)?;
    }
    // If fees arrive while claims are queued, their share remains reserved in
    // fees_stakers but is not assigned in the accumulator. The specified
    // LpState has no separate undistributed-reward cursor, so assigning that
    // reserve after the queue clears could double-credit earlier, unclaimed
    // rewards. A future account migration can add such a cursor safely.
    Ok(())
}

fn apply_lp_pnl(lp: &mut LpState, pnl: i128, fee: u64, staker_cap: u64) -> Result<()> {
    add_fee(lp, fee)?;
    let economic = pnl
        .checked_sub(i128::from(fee))
        .ok_or(WickError::MathOverflow)?;
    lp.balance = lp
        .balance
        .checked_sub(economic)
        .ok_or(WickError::MathOverflow)?;
    if pnl < 0 {
        lp.cumulative_losses = lp
            .cumulative_losses
            .checked_add(u64::try_from(-pnl).map_err(|_| error!(WickError::MathOverflow))?)
            .ok_or(WickError::MathOverflow)?;
    }
    update_high_watermark(lp);
    distribute_staker_surplus(lp, staker_cap)?;
    Ok(())
}

fn distribute_staker_surplus(lp: &mut LpState, staker_cap: u64) -> Result<u64> {
    let surplus = staker_surplus_e6(lp.balance, staker_cap, lp.queue_owed, lp.total_staked)?;
    if surplus == 0 {
        return Ok(0);
    }
    lp.balance = lp
        .balance
        .checked_sub(i128::from(surplus))
        .ok_or(WickError::MathOverflow)?;
    lp.fees_stakers = lp
        .fees_stakers
        .checked_add(surplus)
        .ok_or(WickError::MathOverflow)?;
    increment_reward_per_token(lp, surplus)?;
    Ok(surplus)
}

fn market_allows_liquidation(status: MarketStatus) -> bool {
    status == MarketStatus::Open
}

fn update_high_watermark(lp: &mut LpState) {
    if lp.balance > 0 {
        lp.high_watermark = lp.high_watermark.max(lp.balance as u64);
    }
}
fn emit_lp(lp: &LpState) {
    emit!(LpUpdated {
        balance: lp.balance,
        queue_owed: lp.queue_owed
    });
}

fn decrement_market_position(market: &mut Market, position: &Position) -> Result<()> {
    if position.side == Side::Yes {
        market.oi_yes_e6 = market.oi_yes_e6.saturating_sub(position.contracts_e6);
    } else {
        market.oi_no_e6 = market.oi_no_e6.saturating_sub(position.contracts_e6);
    }
    market.net_liability_usdc = market
        .net_liability_usdc
        .saturating_sub(max_payout_e6(position.contracts_e6, position.entry_e6)?);
    market.open_positions = market.open_positions.saturating_sub(1);
    Ok(())
}

fn nonnegative_owed(margin: u64, pnl: i128, fee: u64) -> Result<u64> {
    let value = i128::from(margin)
        .checked_add(pnl)
        .ok_or(WickError::MathOverflow)?
        .checked_sub(i128::from(fee))
        .ok_or(WickError::MathOverflow)?;
    if value <= 0 {
        Ok(0)
    } else {
        u64::try_from(value).map_err(|_| error!(WickError::MathOverflow))
    }
}

fn initialize_or_queue_claim(
    claim: &mut PayoutClaim,
    claim_key: Pubkey,
    lp: &mut LpState,
    owner: Pubkey,
    index: u64,
    shortfall: u64,
    bump: u8,
    now: i64,
) -> Result<()> {
    if shortfall == 0 {
        return Ok(());
    }
    require!(index == lp.queue_tail, WickError::InvalidClaimIndex);
    require!(claim.amount == 0, WickError::InvalidParameter);
    claim.owner = owner;
    claim.amount = shortfall;
    claim.paid = 0;
    claim.created_ts = now;
    claim.index = index;
    claim.bump = bump;
    lp.queue_tail = lp
        .queue_tail
        .checked_add(1)
        .ok_or(WickError::MathOverflow)?;
    lp.queue_owed = lp
        .queue_owed
        .checked_add(shortfall)
        .ok_or(WickError::MathOverflow)?;
    emit!(ClaimQueued {
        claim: claim_key,
        index,
        owner,
        amount: shortfall
    });
    Ok(())
}

fn settle_open_position(
    ctx: &mut Context<ClosePosition>,
    exit: u32,
    outcome: Option<Outcome>,
    claim_index: u64,
    _settlement: bool,
) -> Result<()> {
    let raw_pnl = pnl_e6(
        ctx.accounts.position.contracts_e6,
        exit,
        ctx.accounts.position.entry_e6,
    )?;
    let pnl = cap_loss_to_margin(raw_pnl, ctx.accounts.position.margin)?;
    let fee = fee_on_profit(pnl, ctx.accounts.config.profit_fee_bps)?;
    let owed = nonnegative_owed(ctx.accounts.position.margin, pnl, fee)?;
    apply_lp_pnl(
        &mut ctx.accounts.lp,
        pnl,
        fee,
        ctx.accounts.config.staker_cap,
    )?;
    let free = ctx
        .accounts
        .vault
        .amount
        .saturating_sub(ctx.accounts.lp.queue_owed);
    let pay = owed.min(free);
    if pay > 0 {
        transfer_from_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.owner_usdc,
            &ctx.accounts.usdc_mint,
            pay,
        )?;
    }
    let shortfall = owed.saturating_sub(pay);
    let claim_key = ctx.accounts.claim.key();
    initialize_or_queue_claim(
        &mut ctx.accounts.claim,
        claim_key,
        &mut ctx.accounts.lp,
        ctx.accounts.owner.key(),
        claim_index,
        shortfall,
        ctx.bumps.claim,
        Clock::get()?.unix_timestamp,
    )?;
    if pnl < 0 {
        let loss = u64::try_from(-pnl).map_err(|_| error!(WickError::MathOverflow))?;
        let emission = wicked_emission_e6(
            loss,
            ctx.accounts.lp.balance,
            ctx.accounts.config.emission_threshold,
            ctx.accounts.config.emission_c,
            ctx.accounts.lp.high_watermark,
        )?;
        mint_wicked(
            &ctx.accounts.token_program,
            &ctx.accounts.loser_mint,
            &ctx.accounts.owner_wicked,
            &ctx.accounts.lp.to_account_info(),
            ctx.accounts.lp.bump,
            emission,
        )?;
    }
    decrement_market_position(&mut ctx.accounts.market, &ctx.accounts.position)?;
    ctx.accounts.position.status = PositionStatus::Closed;
    emit!(PositionClosed {
        position: ctx.accounts.position.key(),
        owner: ctx.accounts.owner.key(),
        exit_e6: exit,
        pnl_e6: pnl,
        fee_e6: fee,
        paid_e6: pay
    });
    if let Some(value) = outcome {
        emit!(PositionSettled {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
            outcome: value,
            pnl_e6: pnl,
            fee_e6: fee,
            paid_e6: pay
        });
    }
    emit_lp(&ctx.accounts.lp);
    Ok(())
}

#[cfg(test)]
mod economic_regression_tests {
    use super::*;

    fn lp(balance: i128, queue_owed: u64, total_staked: u64) -> LpState {
        LpState {
            balance,
            high_watermark: balance.max(0) as u64,
            cumulative_losses: 0,
            fees_stakers: 0,
            fees_treasury: 0,
            queue_head: 0,
            queue_tail: 0,
            queue_owed,
            reward_per_token_e12: 0,
            total_staked,
            loser_mint: Pubkey::default(),
            bump: 0,
        }
    }

    #[test]
    fn lp_never_receives_more_than_margin_on_extreme_loss() {
        let margin = 100_000_000;
        let pnl = cap_loss_to_margin(-1_000_000_000, margin).unwrap();
        let mut state = lp(0, 0, 0);
        apply_lp_pnl(&mut state, pnl, 0, u64::MAX).unwrap();
        assert_eq!(state.balance, i128::from(margin));
        assert_eq!(state.cumulative_losses, margin);
    }

    #[test]
    fn liquidations_are_for_open_markets_only() {
        assert!(market_allows_liquidation(MarketStatus::Open));
        assert!(!market_allows_liquidation(MarketStatus::Halted));
        assert!(!market_allows_liquidation(MarketStatus::Expired));
        assert!(!market_allows_liquidation(MarketStatus::Settled));
        assert!(!market_allows_liquidation(MarketStatus::Invalid));
    }

    #[test]
    fn surplus_moves_to_staker_reserve_only_after_queue_clears() {
        let mut state = lp(150_000_000, 25_000_000, 10_000_000);
        assert_eq!(
            distribute_staker_surplus(&mut state, 100_000_000).unwrap(),
            0
        );
        assert_eq!(state.balance, 150_000_000);
        state.queue_owed = 0;
        assert_eq!(
            distribute_staker_surplus(&mut state, 100_000_000).unwrap(),
            50_000_000
        );
        assert_eq!(state.balance, 100_000_000);
        assert_eq!(state.fees_stakers, 50_000_000);
        assert_eq!(state.reward_per_token_e12, 5 * REWARD_SCALE);
    }

    #[test]
    fn fee_accumulator_does_not_advance_while_queue_is_outstanding() {
        let mut state = lp(0, 1, 10_000_000);
        add_fee(&mut state, 2_000_000).unwrap();
        assert_eq!(state.fees_stakers, 1_000_000);
        assert_eq!(state.fees_treasury, 1_000_000);
        assert_eq!(state.reward_per_token_e12, 0);

        state.queue_owed = 0;
        add_fee(&mut state, 2_000_000).unwrap();
        assert_eq!(state.fees_stakers, 2_000_000);
        assert_eq!(state.fees_treasury, 2_000_000);
        assert_eq!(state.reward_per_token_e12, REWARD_SCALE / 10);
    }
}

fn pay_or_queue_settlement(
    ctx: &mut Context<SettlePosition>,
    owed: u64,
    pnl: i128,
    fee: u64,
    claim_index: u64,
    outcome: Outcome,
) -> Result<()> {
    let free = ctx
        .accounts
        .vault
        .amount
        .saturating_sub(ctx.accounts.lp.queue_owed);
    let pay = owed.min(free);
    if pay > 0 {
        transfer_from_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.owner_usdc,
            &ctx.accounts.usdc_mint,
            pay,
        )?;
    }
    let claim_key = ctx.accounts.claim.key();
    initialize_or_queue_claim(
        &mut ctx.accounts.claim,
        claim_key,
        &mut ctx.accounts.lp,
        ctx.accounts.position.owner,
        claim_index,
        owed.saturating_sub(pay),
        ctx.bumps.claim,
        Clock::get()?.unix_timestamp,
    )?;
    decrement_market_position(&mut ctx.accounts.market, &ctx.accounts.position)?;
    ctx.accounts.position.status = PositionStatus::Settled;
    emit!(PositionSettled {
        position: ctx.accounts.position.key(),
        owner: ctx.accounts.position.owner,
        outcome,
        pnl_e6: pnl,
        fee_e6: fee,
        paid_e6: pay
    });
    emit_lp(&ctx.accounts.lp);
    Ok(())
}

fn close_claim_if_complete<'info>(
    claim: &Account<'info, PayoutClaim>,
    rent_recipient: AccountInfo<'info>,
    complete: bool,
) -> Result<()> {
    let destination_balance = validate_claim_close(
        claim.owner,
        *rent_recipient.key,
        claim.to_account_info().lamports(),
        rent_recipient.lamports(),
        complete,
    )?;
    if destination_balance.is_some() {
        claim.close(rent_recipient)?;
    }
    Ok(())
}

fn validate_claim_close(
    claim_owner: Pubkey,
    rent_recipient: Pubkey,
    claim_lamports: u64,
    recipient_lamports: u64,
    complete: bool,
) -> Result<Option<u64>> {
    require_keys_eq!(claim_owner, rent_recipient, WickError::InvalidParameter);
    if !complete {
        return Ok(None);
    }
    Ok(Some(
        recipient_lamports
            .checked_add(claim_lamports)
            .ok_or(WickError::MathOverflow)?,
    ))
}

#[cfg(test)]
mod claim_close_tests {
    use super::*;

    #[test]
    fn claim_close_is_conditional_and_refunds_the_validated_owner() {
        let owner = Pubkey::new_unique();
        assert_eq!(
            validate_claim_close(owner, owner, 2_000_000, 100_000, false).unwrap(),
            None
        );
        assert_eq!(
            validate_claim_close(owner, owner, 2_000_000, 100_000, true).unwrap(),
            Some(2_100_000)
        );
    }

    #[test]
    fn claim_close_rejects_wrong_recipient_and_lamport_overflow() {
        let owner = Pubkey::new_unique();
        assert!(validate_claim_close(owner, Pubkey::new_unique(), 1, 0, true).is_err());
        assert!(validate_claim_close(owner, owner, 1, u64::MAX, true).is_err());
    }
}
