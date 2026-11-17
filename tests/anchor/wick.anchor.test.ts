import {
  AnchorProvider,
  BN,
  Program,
  setProvider,
  type Idl,
  web3,
} from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  closeResult,
  contractsE6,
  liquidationMarkE6,
  maxPayoutE6,
  pnlE6,
} from "../../packages/pricing/src/position.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { before, describe, it } from "node:test";

const E6 = 1_000_000n;
const U64_MASK = (1n << 64n) - 1n;
const INITIAL_VAULT_LIQUIDITY = 100_000n * E6;
const HUGE_LIMIT = 9_000_000_000_000_000n;

type Side = "yes" | "no";
type Trader = { keypair: web3.Keypair; usdc: web3.PublicKey };
type MarketFixture = { symbol: string; address: web3.PublicKey; expiry: number; markE6: number; spreadE6: number };
type PositionFixture = { address: web3.PublicKey; trader: Trader; market: MarketFixture; nonce: bigint };
type ConfigParams = {
  globalMaxLeverage: number;
  maintenanceBps: number;
  profitFeeBps: number;
  liqFeeBps: number;
  maxPayoutBpsOfVault: number;
  maxMarketExposureBps: number;
  liabilityAllowance: bigint;
  staleAfterSecs: number;
  emissionThreshold: bigint;
  emissionC: bigint;
  stakerCap: bigint;
};

let provider: AnchorProvider;
let program: Program<Idl> & { methods: Record<string, (...args: unknown[]) => any>; account: Record<string, any> };
let payer: web3.Keypair;
let usdcMint: web3.PublicKey;
let config: web3.PublicKey;
let lp: web3.PublicKey;
let vault: web3.PublicKey;
let loserMint: web3.PublicKey;
let stakingVault: web3.PublicKey;
let symbolCounter = 0;
let nonceCounter = 0n;
let wickedHolder: Trader;
let currentParams: ConfigParams;

const defaultParams: ConfigParams = {
  globalMaxLeverage: 1_000,
  maintenanceBps: 0,
  profitFeeBps: 200,
  liqFeeBps: 200,
  maxPayoutBpsOfVault: 10_000,
  maxMarketExposureBps: 10_000,
  liabilityAllowance: 20_000_000n * E6,
  staleAfterSecs: 5,
  emissionThreshold: HUGE_LIMIT,
  emissionC: 10_000n * E6,
  stakerCap: HUGE_LIMIT,
};

describe("Wick Anchor lifecycle", { concurrency: false }, () => {
  before(async () => {
    const idlPath = resolve("target/idl/wick.json");
    let idl: Idl;
    try {
      idl = JSON.parse(await readFile(idlPath, "utf8")) as Idl;
    } catch (error) {
      throw new Error(`Anchor artifact unavailable at ${idlPath}; run anchor build before this suite`, { cause: error });
    }
    if (!process.env.ANCHOR_PROVIDER_URL || !process.env.ANCHOR_WALLET) {
      throw new Error("Anchor provider unavailable; run this suite through `anchor test`");
    }
    provider = AnchorProvider.env();
    setProvider(provider);
    payer = (provider.wallet as AnchorProvider["wallet"] & { payer?: web3.Keypair }).payer
      ?? (() => { throw new Error("Anchor wallet does not expose a local test keypair"); })();
    program = new Program(idl, provider) as typeof program;

    const programId = program.programId;
    [config] = web3.PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
    [lp] = web3.PublicKey.findProgramAddressSync([Buffer.from("lp")], programId);
    [vault] = web3.PublicKey.findProgramAddressSync([Buffer.from("vault")], programId);
    [loserMint] = web3.PublicKey.findProgramAddressSync([Buffer.from("wicked")], programId);
    [stakingVault] = web3.PublicKey.findProgramAddressSync([Buffer.from("staking_vault")], programId);

    usdcMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    currentParams = { ...defaultParams };
    await method("initConfig")(anchorParams(currentParams, payer.publicKey)).accountsStrict({
      admin: payer.publicKey,
      config,
      lp,
      usdcMint,
      vault,
      loserMint,
      stakingVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    }).rpc();
    await mintTo(provider.connection, payer, usdcMint, vault, payer, INITIAL_VAULT_LIQUIDITY);
    const initialized = await program.account.config.fetch(config);
    assert.equal(initialized.keeper.toBase58(), payer.publicKey.toBase58());
    assert.equal((await getAccount(provider.connection, vault)).amount, INITIAL_VAULT_LIQUIDITY);
  });

  it("executes 1,000 deterministic TypeScript vectors inside the deployed Rust program", async () => {
    for (let chunk = 0; chunk < 10; chunk += 1) {
      const seed = 0x6a09e667f3bcc909n + BigInt(chunk);
      const expected = vectorAccumulators(seed, 100).map((value) => new BN(value.toString()));
      await method("verifyMathVectors")(new BN(seed.toString()), 100, expected).accountsStrict({}).rpc();
    }
  });

  it("opens and closes YES and NO positions through profit and loss", async () => {
    const cases: Array<{ side: Side; openMark: number; closeMark: number; profitable: boolean }> = [
      { side: "yes", openMark: 500_000, closeMark: 600_000, profitable: true },
      { side: "yes", openMark: 500_000, closeMark: 400_000, profitable: false },
      { side: "no", openMark: 500_000, closeMark: 400_000, profitable: true },
      { side: "no", openMark: 500_000, closeMark: 600_000, profitable: false },
    ];
    for (const scenario of cases) {
      const trader = await createTrader(1_000n * E6);
      const market = await createMarket({ markE6: scenario.openMark, spreadE6: 1_000 });
      const before = await tokenBalance(trader.usdc);
      const position = await openPosition(trader, market, scenario.side, 10n * E6, 2);
      const account = await program.account.position.fetch(position.address);
      await updateMark(market, scenario.closeMark, 10);
      const sideMark = scenario.side === "yes" ? scenario.closeMark : 1_000_000 - scenario.closeMark;
      const exit = sideMark - market.spreadE6;
      const expected = closeResult(10n * E6, asBigInt(account.contractsE6), Number(asBigInt(account.entryE6)), exit, currentParams.profitFeeBps);
      await closePosition(position, exit);
      const after = await tokenBalance(trader.usdc);
      assert.equal(after, before - 10n * E6 + expected.owedE6);
      assert.equal(expected.pnlE6 > 0n, scenario.profitable);
      assert.equal(await provider.connection.getAccountInfo(position.address), null);
    }
  });

  it("liquidates exactly at the stored boundary but rejects one tick above", async () => {
    const trader = await createTrader(1_000n * E6);
    const market = await createMarket({ markE6: 500_000, spreadE6: 0 });
    const position = await openPosition(trader, market, "yes", 10n * E6, 4);
    const account = await program.account.position.fetch(position.address);
    const boundary = Number(account.liqMarkE6);
    await updateMark(market, boundary + 1, 10);
    await expectProgramError(() => liquidate(position), "NotLiquidatable");
    assert.notEqual(await provider.connection.getAccountInfo(position.address), null);
    await updateMark(market, boundary, 10);
    await liquidate(position);
    assert.equal(await provider.connection.getAccountInfo(position.address), null);
    assert.equal(await tokenBalance(getAssociatedTokenAddressSync(loserMint, trader.keypair.publicKey)), 1_000n * E6);
  });

  it("rejects stale marks, cutoff trading, and leverage above the live cap", async () => {
    await setParams({ staleAfterSecs: 1 });
    const staleTrader = await createTrader(100n * E6);
    const staleMarket = await createMarket({ markE6: 500_000 });
    const marked = await program.account.market.fetch(staleMarket.address);
    await waitForChainTime(Number(asBigInt(marked.markTs)) + 2);
    await expectProgramError(() => openPosition(staleTrader, staleMarket, "yes", 1n * E6, 1), "StaleMark");
    await setParams({ staleAfterSecs: defaultParams.staleAfterSecs });

    const cutoffTrader = await createTrader(100n * E6);
    const cutoffMarket = await createMarket({ markE6: 500_000, expiryDelta: 5, cutoffSecs: 10 });
    await expectProgramError(() => openPosition(cutoffTrader, cutoffMarket, "yes", 1n * E6, 1), "MarketCutoff");

    const leverageTrader = await createTrader(100n * E6);
    const leverageMarket = await createMarket({ markE6: 500_000, maxLeverage: 2 });
    await expectProgramError(() => openPosition(leverageTrader, leverageMarket, "yes", 1n * E6, 3), "LeverageTooHigh");
  });

  it("enforces both per-position payout and aggregate market exposure caps", async () => {
    const trader = await createTrader(10_000n * E6);
    const market = await createMarket({ markE6: 500_000, maxLeverage: 20 });
    await setParams({ liabilityAllowance: 0n, maxPayoutBpsOfVault: 1, maxMarketExposureBps: 10_000 });
    await expectProgramError(() => openPosition(trader, market, "yes", 1_000n * E6, 10), "PoolTooSmall");
    await setParams({ maxPayoutBpsOfVault: 10_000, maxMarketExposureBps: 1 });
    await expectProgramError(() => openPosition(trader, market, "yes", 1_000n * E6, 10), "MarketExposureExceeded");
    await setParams({
      liabilityAllowance: defaultParams.liabilityAllowance,
      maxPayoutBpsOfVault: defaultParams.maxPayoutBpsOfVault,
      maxMarketExposureBps: defaultParams.maxMarketExposureBps,
    });
  });

  it("settles winning and losing positions from one official outcome", async () => {
    const winner = await createTrader(1_000n * E6);
    const loser = await createTrader(1_000n * E6);
    const market = await createMarket({ markE6: 500_000, expiryDelta: 12, cutoffSecs: 1 });
    const winnerPosition = await openPosition(winner, market, "yes", 10n * E6, 2);
    const loserPosition = await openPosition(loser, market, "no", 10n * E6, 2);
    const winnerAfterOpen = await tokenBalance(winner.usdc);
    const loserAfterOpen = await tokenBalance(loser.usdc);
    await waitForChainTime(market.expiry);
    await settleMarket(market, "yes");
    await settlePosition(winnerPosition);
    await settlePosition(loserPosition);
    assert.ok(await tokenBalance(winner.usdc) > winnerAfterOpen);
    assert.equal(await tokenBalance(loser.usdc), loserAfterOpen);
    assert.equal(await tokenBalance(getAssociatedTokenAddressSync(loserMint, loser.keypair.publicKey)), 1_000n * E6);
    const settled = await program.account.market.fetch(market.address);
    assert.equal(variant(settled.status), "settled");
    assert.equal(Number(asBigInt(settled.openPositions)), 0);
  });

  it("queues a short-vault winner, applies a later loss, and pays the FIFO claim", async () => {
    const winner = await createTrader(3_000_000n * E6);
    const winningMarket = await createMarket({ markE6: 500_000, expiryDelta: 10, cutoffSecs: 1, maxLeverage: 20 });
    const winningPosition = await openPosition(winner, winningMarket, "yes", 100_000n * E6, 10);
    const queueIndex = asBigInt((await program.account.lpState.fetch(lp)).queueTail);
    const claim = claimPda(queueIndex);
    await waitForChainTime(winningMarket.expiry);
    await settleMarket(winningMarket, "yes");
    await settlePosition(winningPosition, queueIndex);
    const queued = await program.account.payoutClaim.fetch(claim);
    assert.ok(asBigInt(queued.amount) > 0n);
    assert.equal(asBigInt((await program.account.lpState.fetch(lp)).queueOwed), asBigInt(queued.amount));

    const owed = asBigInt(queued.amount);
    const loser = await createTrader(owed + 2_000_000n * E6);
    const losingMarket = await createMarket({ markE6: 500_000, expiryDelta: 10, cutoffSecs: 1 });
    const losingPosition = await openPosition(loser, losingMarket, "yes", owed + 1_000_000n * E6, 1);
    const wickedBefore = await optionalTokenBalance(getAssociatedTokenAddressSync(loserMint, loser.keypair.publicKey));
    await waitForChainTime(losingMarket.expiry);
    await settleMarket(losingMarket, "no");
    await settlePosition(losingPosition);
    const wickedAfter = await tokenBalance(getAssociatedTokenAddressSync(loserMint, loser.keypair.publicKey));
    assert.equal(wickedAfter - wickedBefore, (owed + 1_000_000n * E6) * 100n);
    wickedHolder = loser;

    // Fee shares keep payout claims behind the FIFO queue, but must be
    // assigned exactly once to the staking cohort when that queue clears.
    const deferredStake = 100n * E6;
    const deferredStakeAccount = stakePda(loser.keypair.publicKey);
    await method("stake")(new BN(deferredStake.toString())).accountsStrict({
      owner: loser.keypair.publicKey,
      lp,
      loserMint,
      ownerWicked: getAssociatedTokenAddressSync(loserMint, loser.keypair.publicKey),
      stakingVault,
      stakeAccount: deferredStakeAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    }).signers([loser.keypair]).rpc();

    const feeTrader = await createTrader(1_000n * E6);
    const feeMarket = await createMarket({ markE6: 500_000, spreadE6: 0 });
    const feePosition = await openPosition(feeTrader, feeMarket, "yes", 100n * E6, 2);
    const feeOpened = await program.account.position.fetch(feePosition.address);
    const beforeDeferredFee = await program.account.lpState.fetch(lp);
    await updateMark(feeMarket, 600_000, 10);
    const deferredResult = closeResult(
      100n * E6,
      asBigInt(feeOpened.contractsE6),
      Number(asBigInt(feeOpened.entryE6)),
      600_000,
      currentParams.profitFeeBps,
    );
    await closePosition(feePosition, 600_000);
    const deferredShare = deferredResult.feeE6 / 2n;
    const afterDeferredFee = await program.account.lpState.fetch(lp);
    assert.equal(
      asBigInt(afterDeferredFee.undistributedStakerRewards)
        - asBigInt(beforeDeferredFee.undistributedStakerRewards),
      deferredShare,
    );
    assert.equal(
      asBigInt(afterDeferredFee.rewardPerTokenE12),
      asBigInt(beforeDeferredFee.rewardPerTokenE12),
    );

    for (let crank = 0; crank < 20; crank += 1) {
      const state = await program.account.lpState.fetch(lp);
      if (asBigInt(state.queueOwed) === 0n) break;
      await claimQueue(claim, winner);
    }
    const afterQueue = await program.account.lpState.fetch(lp);
    assert.equal(asBigInt(afterQueue.queueOwed), 0n);
    assert.equal(await provider.connection.getAccountInfo(claim), null);
    assert.equal(asBigInt(afterQueue.undistributedStakerRewards), 0n);
    assert.equal(
      asBigInt(afterQueue.rewardPerTokenE12) - asBigInt(beforeDeferredFee.rewardPerTokenE12),
      deferredShare * 1_000_000_000_000n / deferredStake,
    );

    const beforeDeferredClaim = await tokenBalance(loser.usdc);
    await method("claimRewards")().accountsStrict({
      owner: loser.keypair.publicKey,
      lp,
      vault,
      usdcMint,
      ownerUsdc: loser.usdc,
      stakeAccount: deferredStakeAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([loser.keypair]).rpc();
    assert.equal(await tokenBalance(loser.usdc) - beforeDeferredClaim, deferredShare);

    await method("unstake")(new BN(deferredStake.toString())).accountsStrict({
      owner: loser.keypair.publicKey,
      lp,
      loserMint,
      ownerWicked: getAssociatedTokenAddressSync(loserMint, loser.keypair.publicKey),
      stakingVault,
      stakeAccount: deferredStakeAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    }).signers([loser.keypair]).rpc();
  });

  it("voids a market and refunds margin exactly", async () => {
    const trader = await createTrader(1_000n * E6);
    const market = await createMarket({ markE6: 500_000, expiryDelta: 10, cutoffSecs: 1 });
    const before = await tokenBalance(trader.usdc);
    const position = await openPosition(trader, market, "yes", 25n * E6, 3);
    await waitForChainTime(market.expiry);
    await voidMarket(market);
    await settlePosition(position);
    assert.equal(await tokenBalance(trader.usdc), before);
    assert.equal(variant((await program.account.market.fetch(market.address)).status), "invalid");
  });

  it("accounts for fees, loss emissions, staking accrual, and reward claims exactly", async () => {
    assert.ok(wickedHolder, "loss scenario must produce a $WICKED holder");
    const stakeAmount = 100n * E6;
    const stakeAccount = stakePda(wickedHolder.keypair.publicKey);
    await method("stake")(new BN(stakeAmount.toString())).accountsStrict({
      owner: wickedHolder.keypair.publicKey,
      lp,
      loserMint,
      ownerWicked: getAssociatedTokenAddressSync(loserMint, wickedHolder.keypair.publicKey),
      stakingVault,
      stakeAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    }).signers([wickedHolder.keypair]).rpc();

    const feeTrader = await createTrader(1_000n * E6);
    const market = await createMarket({ markE6: 500_000, spreadE6: 0 });
    const position = await openPosition(feeTrader, market, "yes", 100n * E6, 2);
    const opened = await program.account.position.fetch(position.address);
    const lpBeforeFee = await program.account.lpState.fetch(lp);
    await updateMark(market, 600_000, 10);
    const expected = closeResult(100n * E6, asBigInt(opened.contractsE6), Number(asBigInt(opened.entryE6)), 600_000, currentParams.profitFeeBps);
    await closePosition(position, 600_000);
    const stakerShare = expected.feeE6 / 2n;
    const lpAfterFee = await program.account.lpState.fetch(lp);
    assert.equal(asBigInt(lpAfterFee.feesStakers) - asBigInt(lpBeforeFee.feesStakers), stakerShare);
    assert.equal(asBigInt(lpAfterFee.feesTreasury) - asBigInt(lpBeforeFee.feesTreasury), expected.feeE6 - stakerShare);
    const expectedReward = stakeAmount * (stakerShare * 1_000_000_000_000n / stakeAmount) / 1_000_000_000_000n;
    const beforeClaim = await tokenBalance(wickedHolder.usdc);
    await method("claimRewards")().accountsStrict({
      owner: wickedHolder.keypair.publicKey,
      lp,
      vault,
      usdcMint,
      ownerUsdc: wickedHolder.usdc,
      stakeAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([wickedHolder.keypair]).rpc();
    assert.equal(await tokenBalance(wickedHolder.usdc) - beforeClaim, expectedReward);
    assert.equal(asBigInt((await program.account.stakeAccount.fetch(stakeAccount)).amount), stakeAmount);
  });
});

async function createTrader(usdcAmount: bigint): Promise<Trader> {
  const keypair = web3.Keypair.generate();
  await web3.sendAndConfirmTransaction(provider.connection, new web3.Transaction().add(web3.SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: keypair.publicKey,
    lamports: 2 * web3.LAMPORTS_PER_SOL,
  })), [payer]);
  const ata = await getOrCreateAssociatedTokenAccount(provider.connection, payer, usdcMint, keypair.publicKey);
  await mintTo(provider.connection, payer, usdcMint, ata.address, payer, usdcAmount);
  return { keypair, usdc: ata.address };
}

async function createMarket(options: { markE6: number; spreadE6?: number; maxLeverage?: number; expiryDelta?: number; cutoffSecs?: number }): Promise<MarketFixture> {
  const symbol = `GEMI-WICK-ANCHOR-${symbolCounter++}`;
  const digest = createHash("sha256").update(symbol).digest();
  const [address] = web3.PublicKey.findProgramAddressSync([Buffer.from("market"), digest], program.programId);
  const now = await chainNow();
  const expiry = now + (options.expiryDelta ?? 600);
  const spreadE6 = options.spreadE6 ?? 0;
  await method("createMarket")(
    symbol,
    [...digest],
    { upDown: {} },
    new BN((65_000n * E6).toString()),
    new BN(now - 5),
    new BN(expiry),
    options.cutoffSecs ?? 60,
    spreadE6,
  ).accountsStrict({ keeper: payer.publicKey, config, market: address, systemProgram: web3.SystemProgram.programId }).rpc();
  const fixture = { symbol, address, expiry, markE6: options.markE6, spreadE6 };
  await updateMark(fixture, options.markE6, options.maxLeverage ?? 10);
  return fixture;
}

async function updateMark(market: MarketFixture, markE6: number, maxLeverage: number): Promise<void> {
  await method("updateMarks")([{ marketIndex: 0, markE6, maxLeverage }]).accountsStrict({
    keeper: payer.publicKey,
    config,
  }).remainingAccounts([{ pubkey: market.address, isSigner: false, isWritable: true }]).rpc();
  market.markE6 = markE6;
}

async function openPosition(trader: Trader, market: MarketFixture, side: Side, margin: bigint, leverage: number): Promise<PositionFixture> {
  const nonce = nonceCounter++;
  const [address] = web3.PublicKey.findProgramAddressSync([
    Buffer.from("pos"),
    market.address.toBuffer(),
    trader.keypair.publicKey.toBuffer(),
    u64le(nonce),
  ], program.programId);
  await method("openPosition")(
    side === "yes" ? { yes: {} } : { no: {} },
    new BN(margin.toString()),
    leverage,
    990_000,
    new BN(nonce.toString()),
  ).accountsStrict({
    trader: trader.keypair.publicKey,
    config,
    market: market.address,
    lp,
    vault,
    usdcMint,
    traderUsdc: trader.usdc,
    position: address,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId,
  }).signers([trader.keypair]).rpc();
  return { address, trader, market, nonce };
}

async function closePosition(position: PositionFixture, minExitE6: number): Promise<void> {
  const queueTail = asBigInt((await program.account.lpState.fetch(lp)).queueTail);
  await method("closePosition")(minExitE6, new BN(queueTail.toString())).accountsStrict({
    owner: position.trader.keypair.publicKey,
    config,
    market: position.market.address,
    position: position.address,
    lp,
    vault,
    usdcMint,
    ownerUsdc: position.trader.usdc,
    loserMint,
    ownerWicked: getAssociatedTokenAddressSync(loserMint, position.trader.keypair.publicKey),
    claim: claimPda(queueTail),
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId,
  }).signers([position.trader.keypair]).rpc();
}

async function liquidate(position: PositionFixture): Promise<void> {
  await method("liquidate")().accountsStrict({
    liquidator: payer.publicKey,
    config,
    market: position.market.address,
    position: position.address,
    owner: position.trader.keypair.publicKey,
    lp,
    loserMint,
    ownerWicked: getAssociatedTokenAddressSync(loserMint, position.trader.keypair.publicKey),
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId,
  }).rpc();
}

async function settleMarket(market: MarketFixture, outcome: Side): Promise<void> {
  await method("settleMarket")(outcome === "yes" ? { yes: {} } : { no: {} }, new BN((65_000n * E6).toString())).accountsStrict({
    keeper: payer.publicKey,
    config,
    market: market.address,
  }).rpc();
}

async function voidMarket(market: MarketFixture): Promise<void> {
  await method("voidMarket")().accountsStrict({ keeper: payer.publicKey, config, market: market.address }).rpc();
}

async function settlePosition(position: PositionFixture, explicitClaimIndex?: bigint): Promise<void> {
  const state = await program.account.lpState.fetch(lp);
  const claimIndex = explicitClaimIndex ?? asBigInt(state.queueTail);
  await method("settlePosition")(new BN(claimIndex.toString())).accountsStrict({
    payer: payer.publicKey,
    config,
    market: position.market.address,
    position: position.address,
    owner: position.trader.keypair.publicKey,
    lp,
    vault,
    usdcMint,
    ownerUsdc: position.trader.usdc,
    loserMint,
    ownerWicked: getAssociatedTokenAddressSync(loserMint, position.trader.keypair.publicKey),
    claim: claimPda(claimIndex),
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId,
  }).rpc();
}

async function claimQueue(claim: web3.PublicKey, owner: Trader): Promise<void> {
  await method("claimQueue")().accountsStrict({
    payer: payer.publicKey,
    config,
    lp,
    vault,
    usdcMint,
    claim,
    owner: owner.keypair.publicKey,
    ownerUsdc: owner.usdc,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId,
  }).rpc();
}

async function setParams(patch: Partial<ConfigParams>): Promise<void> {
  currentParams = { ...currentParams, ...patch };
  await method("setParams")(anchorMutableParams(currentParams)).accountsStrict({ admin: payer.publicKey, config }).rpc();
}

function anchorParams(params: ConfigParams, keeper: web3.PublicKey): Record<string, unknown> {
  return { keeper, ...anchorMutableParams(params) };
}

function anchorMutableParams(params: ConfigParams): Record<string, unknown> {
  return {
    globalMaxLeverage: params.globalMaxLeverage,
    maintenanceBps: params.maintenanceBps,
    profitFeeBps: params.profitFeeBps,
    liqFeeBps: params.liqFeeBps,
    maxPayoutBpsOfVault: params.maxPayoutBpsOfVault,
    maxMarketExposureBps: params.maxMarketExposureBps,
    liabilityAllowance: new BN(params.liabilityAllowance.toString()),
    staleAfterSecs: params.staleAfterSecs,
    emissionThreshold: new BN(params.emissionThreshold.toString()),
    emissionC: new BN(params.emissionC.toString()),
    stakerCap: new BN(params.stakerCap.toString()),
  };
}

function method(name: string): (...args: unknown[]) => any {
  const value = program.methods[name];
  if (!value) throw new Error(`Generated Wick IDL is missing ${name}`);
  return value;
}

async function expectProgramError(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    const value = error as { error?: { errorCode?: { code?: string } }; logs?: string[]; message?: string };
    const text = [value.message, ...(value.logs ?? [])].join("\n");
    return value.error?.errorCode?.code === code || text.includes(code);
  }, `expected Anchor error ${code}`);
}

async function chainNow(): Promise<number> {
  const slot = await provider.connection.getSlot("confirmed");
  const timestamp = await provider.connection.getBlockTime(slot);
  if (timestamp === null) throw new Error(`Local validator returned no block time for slot ${slot}`);
  return timestamp;
}

async function waitForChainTime(target: number): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (await chainNow() < target) {
    if (Date.now() > deadline) throw new Error(`Local validator clock did not reach ${target}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
}

async function tokenBalance(address: web3.PublicKey): Promise<bigint> {
  return (await getAccount(provider.connection, address)).amount;
}

async function optionalTokenBalance(address: web3.PublicKey): Promise<bigint> {
  try { return await tokenBalance(address); }
  catch { return 0n; }
}

function claimPda(index: bigint): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync([Buffer.from("claim"), u64le(index)], program.programId)[0];
}

function stakePda(owner: web3.PublicKey): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync([Buffer.from("stake"), owner.toBuffer()], program.programId)[0];
}

function u64le(value: bigint): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (value && typeof value === "object" && "toString" in value) return BigInt(String(value));
  throw new TypeError("Expected an Anchor integer");
}

function variant(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object") return Object.keys(value)[0]?.toLowerCase() ?? "";
  return "";
}

function xorshift64(value: bigint): bigint {
  let result = value & U64_MASK;
  result ^= (result << 13n) & U64_MASK;
  result ^= result >> 7n;
  result ^= (result << 17n) & U64_MASK;
  return result & U64_MASK;
}

function vectorAccumulators(seed: bigint, count: number): bigint[] {
  let state = seed;
  const accumulators = [0n, 0n, 0n, 0n];
  for (let index = 0; index < count; index += 1) {
    state = xorshift64(state);
    const margin = 1_000_000n + state % 1_000_000_000n;
    state = xorshift64(state);
    const leverage = Number(1n + state % 1_000n);
    state = xorshift64(state);
    const entry = Number(10_000n + state % 980_001n);
    state = xorshift64(state);
    const maintenanceBps = Number(state % 1_001n);
    state = xorshift64(state);
    const mark = Number(10_000n + state % 980_001n);
    const contracts = contractsE6(margin, leverage, entry);
    const liquidation = BigInt(liquidationMarkE6(entry, leverage, maintenanceBps));
    const pnl = BigInt.asUintN(64, pnlE6(contracts, mark, entry));
    const payout = maxPayoutE6(contracts, entry);
    accumulators[0] = (accumulators[0]! + contracts) & U64_MASK;
    accumulators[1] = (accumulators[1]! + liquidation) & U64_MASK;
    accumulators[2] = (accumulators[2]! + pnl) & U64_MASK;
    accumulators[3] = (accumulators[3]! + payout) & U64_MASK;
  }
  return accumulators;
}
