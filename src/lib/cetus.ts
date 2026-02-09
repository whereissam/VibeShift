import {
  initCetusSDK,
  type CetusClmmSDK,
  type Pool,
  adjustForSlippage,
  d,
  Percentage,
  ClmmPoolUtil,
  TickMath,
} from "@cetusprotocol/cetus-sui-clmm-sdk";
import BN from "bn.js";
import { NETWORK, CETUS_SUI_USDC_POOL, DEFAULT_SLIPPAGE_BPS } from "./constants";

let sdkInstance: CetusClmmSDK | null = null;

/**
 * Get or create the Cetus SDK singleton.
 */
export function getCetusSDK(): CetusClmmSDK {
  if (!sdkInstance) {
    sdkInstance = initCetusSDK({ network: NETWORK });
  }
  return sdkInstance;
}

/**
 * Fetch a pool by its address.
 */
export async function getPool(
  poolAddress: string = CETUS_SUI_USDC_POOL,
): Promise<Pool> {
  const sdk = getCetusSDK();
  return sdk.Pool.getPool(poolAddress);
}

// ===== Swap =====

export interface SwapEstimate {
  estimatedAmountIn: string;
  estimatedAmountOut: string;
  estimatedFeeAmount: string;
  isExceed: boolean;
  amount: string;
}

/**
 * Pre-calculate a swap to get estimated output.
 */
export async function preswap(
  poolAddress: string,
  a2b: boolean,
  byAmountIn: boolean,
  amount: string,
  decimalsA: number,
  decimalsB: number,
): Promise<SwapEstimate | null> {
  const sdk = getCetusSDK();
  const pool = await sdk.Pool.getPool(poolAddress);

  const res = await sdk.Swap.preswap({
    pool,
    currentSqrtPrice: pool.current_sqrt_price,
    coinTypeA: pool.coinTypeA,
    coinTypeB: pool.coinTypeB,
    decimalsA,
    decimalsB,
    a2b,
    byAmountIn,
    amount,
  });

  if (!res) return null;

  return {
    estimatedAmountIn: String(res.estimatedAmountIn),
    estimatedAmountOut: String(res.estimatedAmountOut),
    estimatedFeeAmount: String(res.estimatedFeeAmount),
    isExceed: Boolean(res.isExceed),
    amount: String(res.amount),
  };
}

/**
 * Build a swap transaction with slippage protection.
 */
export async function buildSwapTx(
  poolAddress: string,
  a2b: boolean,
  byAmountIn: boolean,
  amount: string,
  decimalsA: number,
  decimalsB: number,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
) {
  const sdk = getCetusSDK();
  const pool = await sdk.Pool.getPool(poolAddress);

  const res = await sdk.Swap.preswap({
    pool,
    currentSqrtPrice: pool.current_sqrt_price,
    coinTypeA: pool.coinTypeA,
    coinTypeB: pool.coinTypeB,
    decimalsA,
    decimalsB,
    a2b,
    byAmountIn,
    amount,
  });

  if (!res) throw new Error("Preswap failed");

  const slippage = Percentage.fromDecimal(d(slippageBps / 100));
  const toAmount = byAmountIn
    ? new BN(res.estimatedAmountOut)
    : new BN(res.estimatedAmountIn);
  const amountLimit = adjustForSlippage(toAmount, slippage, !byAmountIn);

  const swapPayload = await sdk.Swap.createSwapTransactionPayload({
    pool_id: pool.poolAddress,
    coinTypeA: pool.coinTypeA,
    coinTypeB: pool.coinTypeB,
    a2b,
    by_amount_in: byAmountIn,
    amount: res.amount.toString(),
    amount_limit: amountLimit.toString(),
  });

  return { tx: swapPayload, estimate: res };
}

// ===== Liquidity =====

/**
 * Build an add-liquidity transaction with fixed token amount.
 */
export async function buildAddLiquidityTx(
  poolAddress: string,
  fixAmountA: boolean,
  coinAmount: number,
  slippage: number = 0.005,
) {
  const sdk = getCetusSDK();
  const pool = await sdk.Pool.getPool(poolAddress);

  const curSqrtPrice = new BN(pool.current_sqrt_price);
  const tickSpacing = new BN(pool.tickSpacing).toNumber();
  const curTickIndex = new BN(pool.current_tick_index).toNumber();

  // Use one tick range around the current price
  const lowerTick = TickMath.getPrevInitializableTickIndex(
    curTickIndex,
    tickSpacing,
  );
  const upperTick = TickMath.getNextInitializableTickIndex(
    curTickIndex,
    tickSpacing,
  );

  const liquidityInput =
    ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
      lowerTick,
      upperTick,
      new BN(coinAmount),
      fixAmountA,
      true,
      slippage,
      curSqrtPrice,
    );

  const amountA = fixAmountA
    ? coinAmount
    : liquidityInput.tokenMaxA.toNumber();
  const amountB = fixAmountA
    ? liquidityInput.tokenMaxB.toNumber()
    : coinAmount;

  const payload = await sdk.Position.createAddLiquidityFixTokenPayload({
    coinTypeA: pool.coinTypeA,
    coinTypeB: pool.coinTypeB,
    pool_id: pool.poolAddress,
    pos_id: "",
    tick_lower: lowerTick.toString(),
    tick_upper: upperTick.toString(),
    fix_amount_a: fixAmountA,
    amount_a: amountA,
    amount_b: amountB,
    slippage,
    is_open: true,
    rewarder_coin_types: [],
    collect_fee: false,
  });

  return payload;
}

/**
 * Build a remove-liquidity transaction.
 */
export async function buildRemoveLiquidityTx(
  poolAddress: string,
  positionId: string,
  deltaLiquidity: string,
) {
  const sdk = getCetusSDK();
  const pool = await sdk.Pool.getPool(poolAddress);

  const payload = await sdk.Position.removeLiquidityTransactionPayload({
    coinTypeA: pool.coinTypeA,
    coinTypeB: pool.coinTypeB,
    pool_id: pool.poolAddress,
    pos_id: positionId,
    delta_liquidity: deltaLiquidity,
    min_amount_a: "0",
    min_amount_b: "0",
    collect_fee: true,
    rewarder_coin_types: [],
  });

  return payload;
}

// ===== Yield Monitoring =====

/**
 * Get pool info including current price and liquidity stats.
 */
export async function getPoolStats(poolAddress: string = CETUS_SUI_USDC_POOL) {
  const pool = await getPool(poolAddress);
  return {
    poolAddress: pool.poolAddress,
    coinTypeA: pool.coinTypeA,
    coinTypeB: pool.coinTypeB,
    currentSqrtPrice: pool.current_sqrt_price,
    currentTickIndex: pool.current_tick_index,
    feeRate: pool.fee_rate,
    liquidity: pool.liquidity,
    tickSpacing: pool.tickSpacing,
  };
}

/**
 * Get positions for an account on a specific pool.
 */
export async function getPositions(
  accountAddress: string,
  poolIds?: string[],
) {
  const sdk = getCetusSDK();
  return sdk.Position.getPositionList(accountAddress, poolIds);
}
