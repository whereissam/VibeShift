import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { AggregatorClient, Env } from "@cetusprotocol/aggregator-sdk";
import {
  VIBESHIFT_PACKAGE_ID,
  AGENT_CAP_ID,
  USDC_TYPE,
  SUI_COIN_TYPE,
  NETWORK,
  SUI_RPC_URL,
  REFUEL_SLIPPAGE,
} from "./constants";

function getAggregator(): AggregatorClient {
  return new AggregatorClient({
    client: new SuiClient({ url: SUI_RPC_URL }),
    env: NETWORK === "mainnet" ? Env.Mainnet : Env.Testnet,
  });
}

/**
 * Build an atomic refuel PTB:
 *   1. skim_yield_for_gas → Coin<USDC> from vault yield (never principal)
 *   2. Cetus Aggregator swap USDC → SUI (best multi-hop route)
 *   3. Transfer Coin<SUI> to agent address
 *
 * The agent triggers this when its SUI balance drops below 0.5 SUI.
 */
export async function buildRefuelPTB(
  agentAddress: string,
  vaultId: string,
  amount: bigint,
  slippage: number = REFUEL_SLIPPAGE,
): Promise<Transaction> {
  const tx = new Transaction();

  // Step 1: Skim yield from the vault (AgentCap-gated, yield only)
  const [yieldCoin] = tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::vault::skim_yield_for_gas`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(AGENT_CAP_ID),
      tx.object(vaultId),
      tx.pure.u64(amount),
    ],
  });

  // Step 2: Find best USDC → SUI route via Cetus Aggregator V3
  const aggregator = getAggregator();

  const routerData = await aggregator.findRouters({
    from: USDC_TYPE,
    target: SUI_COIN_TYPE,
    amount: amount.toString(),
    byAmountIn: true,
  });

  if (!routerData || routerData.paths.length === 0) {
    throw new Error(
      "No USDC→SUI route found via Cetus Aggregator. Cannot refuel.",
    );
  }

  // Step 3: Execute the aggregator swap within the PTB
  const suiCoin = await aggregator.routerSwap({
    router: routerData,
    txb: tx,
    inputCoin: yieldCoin,
    slippage,
  });

  // Step 4: Transfer the swapped SUI to the agent's wallet for gas
  tx.transferObjects([suiCoin], agentAddress);

  return tx;
}

/**
 * Estimate the SUI output for a given USDC refuel amount.
 */
export async function estimateRefuelOutput(
  amount: bigint,
): Promise<{ estimatedSui: bigint; route: string } | null> {
  const aggregator = getAggregator();

  const routerData = await aggregator.findRouters({
    from: USDC_TYPE,
    target: SUI_COIN_TYPE,
    amount: amount.toString(),
    byAmountIn: true,
  });

  if (!routerData || routerData.paths.length === 0) {
    return null;
  }

  return {
    estimatedSui: BigInt(routerData.amountOut.toString()),
    route: routerData.paths
      .map((p) => `${p.from} → ${p.target}`)
      .join(", "),
  };
}
