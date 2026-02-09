import { Transaction } from "@mysten/sui/transactions";
import { VIBESHIFT_PACKAGE_ID, AGENT_CAP_ID } from "./constants";
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
