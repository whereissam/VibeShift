import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import {
  VIBESHIFT_PACKAGE_ID,
  AGENT_CAP_ID,
  DEEPBOOK_PACKAGE_ID,
  DEEPBOOK_SUI_USDC_POOL,
  SUI_RPC_URL,
} from "./constants";
import { getVaultState } from "./vault";

const MODULE = "vault";

/**
 * Build an atomic flash-shift PTB: request → (caller can insert ops) → complete.
 *
 * Returns a Transaction with the request and complete steps. The caller can
 * extend the transaction with additional moveCall steps between the two for
 * protocol operations (Cetus swaps, Stablelayer redemptions, DeepBook ops).
 */
export function buildFlashShiftTx(
  vaultId: string,
  coinType: string,
  amount: bigint,
  protocol: string,
): Transaction {
  const tx = new Transaction();

  // Step 1: request_flash_shift → returns [Coin<T>, FlashReceipt]
  const [borrowedCoin, receipt] = tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::request_flash_shift`,
    typeArguments: [coinType],
    arguments: [
      tx.object(AGENT_CAP_ID),
      tx.object(vaultId),
      tx.pure.u64(amount),
    ],
  });

  // Step 2: complete_flash_shift — consumes receipt with repayment
  // In a real scenario, the caller would insert DeFi operations between
  // request and complete, transforming borrowedCoin through protocol ops.
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::complete_flash_shift`,
    typeArguments: [coinType],
    arguments: [
      tx.object(vaultId),
      borrowedCoin,
      receipt,
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(protocol))),
    ],
  });

  return tx;
}

/**
 * Read the vault's current balance to determine the maximum amount
 * available for a flash-shift operation.
 */
export async function getFlashShiftCapacity(
  vaultId: string,
): Promise<bigint> {
  const state = await getVaultState(vaultId);
  if (!state) return 0n;
  return BigInt(state.balance);
}

// ===== DeepBook V3 Liquidity Injection =====

/**
 * Build a compound PTB that combines a vault Flash-Shift with a DeepBook V3
 * flash loan for when the desired shift amount exceeds the vault balance.
 *
 * Flow (all atomic in one PTB):
 *   1. request_flash_shift(vault) → vault coin + FlashReceipt
 *   2. deepbook::flash_loan() → DeepBook coin + DeepBook FlashReceipt
 *   3. Merge coins → deploy combined capital to target protocol
 *   4. Split repayments → repay DeepBook, then complete_flash_shift
 */
export function buildFlashShiftWithDeepBookTx(
  vaultId: string,
  coinType: string,
  vaultAmount: bigint,
  deepbookAmount: bigint,
  protocol: string,
  poolId: string = DEEPBOOK_SUI_USDC_POOL,
): Transaction {
  const tx = new Transaction();

  // Step 1: Flash-shift from vault
  const [vaultCoin, vaultReceipt] = tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::request_flash_shift`,
    typeArguments: [coinType],
    arguments: [
      tx.object(AGENT_CAP_ID),
      tx.object(vaultId),
      tx.pure.u64(vaultAmount),
    ],
  });

  // Step 2: Flash loan from DeepBook V3
  const [deepbookCoin, deepbookReceipt] = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::borrow_flashloan_base`,
    typeArguments: [coinType, coinType], // base/quote types
    arguments: [tx.object(poolId), tx.pure.u64(deepbookAmount)],
  });

  // Step 3: Merge coins for combined capital deployment
  tx.mergeCoins(vaultCoin, [deepbookCoin]);

  // Step 4: (Caller inserts DeFi operations here — Cetus LP, Stablelayer, etc.)
  // The merged vaultCoin now holds vaultAmount + deepbookAmount

  // Step 5: Split repayment for DeepBook (must repay exact amount borrowed)
  const [deepbookRepayment] = tx.splitCoins(vaultCoin, [
    tx.pure.u64(deepbookAmount),
  ]);

  // Step 6: Repay DeepBook flash loan
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::return_flashloan_base`,
    typeArguments: [coinType, coinType],
    arguments: [tx.object(poolId), deepbookRepayment, deepbookReceipt],
  });

  // Step 7: Complete vault flash-shift with remaining coin
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::complete_flash_shift`,
    typeArguments: [coinType],
    arguments: [
      tx.object(vaultId),
      vaultCoin,
      vaultReceipt,
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(protocol))),
    ],
  });

  return tx;
}

/**
 * Query available DeepBook V3 flash loan liquidity for a given pool.
 */
export async function getDeepBookFlashLoanCapacity(
  poolId: string = DEEPBOOK_SUI_USDC_POOL,
): Promise<bigint> {
  const client = new SuiClient({ url: SUI_RPC_URL });
  const obj = await client.getObject({
    id: poolId,
    options: { showContent: true },
  });

  if (obj.data?.content?.dataType !== "moveObject") return 0n;
  const fields = obj.data.content.fields as Record<string, unknown>;

  // DeepBook V3 pool stores base/quote vault balances
  const baseVault = fields.base_vault as Record<string, unknown> | undefined;
  if (!baseVault) return 0n;
  return BigInt(String(baseVault.value ?? "0"));
}
