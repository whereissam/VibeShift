import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import {
  VIBESHIFT_PACKAGE_ID,
  AGENT_CAP_ID,
  SUI_RPC_URL,
  SUI_COIN_TYPE,
  GAS_MIN_SUI_BALANCE,
} from "./constants";

const client = new SuiClient({ url: SUI_RPC_URL });

/**
 * Check the agent's SUI gas balance.
 */
export async function checkAgentGasBalance(
  agentAddress: string,
): Promise<bigint> {
  const balance = await client.getBalance({
    owner: agentAddress,
    coinType: SUI_COIN_TYPE,
  });
  return BigInt(balance.totalBalance);
}

/**
 * Build a transaction that skims yield from the vault for agent gas.
 */
export function buildSkimYieldForGasTx(
  vaultId: string,
  coinType: string,
  amount: bigint,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::vault::skim_yield_for_gas`,
    typeArguments: [coinType],
    arguments: [
      tx.object(AGENT_CAP_ID),
      tx.object(vaultId),
      tx.pure.u64(amount),
    ],
  });
  return tx;
}

/**
 * Check whether the agent needs a gas refuel.
 */
export async function shouldRefuel(
  agentAddress: string,
): Promise<{ needed: boolean; balance: bigint }> {
  const balance = await checkAgentGasBalance(agentAddress);
  return {
    needed: balance < GAS_MIN_SUI_BALANCE,
    balance,
  };
}
