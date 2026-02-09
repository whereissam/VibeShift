import { StableLayerClient } from "stable-layer-sdk";
import { Transaction } from "@mysten/sui/transactions";
import { coinWithBalance } from "@mysten/sui/transactions";
import { NETWORK, USDC_TYPE, BTC_USDC_TYPE } from "./constants";

let clientInstance: StableLayerClient | null = null;

/**
 * Get or create a StableLayerClient singleton.
 */
export function getStableLayerClient(sender: string): StableLayerClient {
  if (!clientInstance) {
    clientInstance = new StableLayerClient({
      network: NETWORK,
      sender,
    });
  }
  return clientInstance;
}

/**
 * Build a mint transaction: deposit USDC to mint stablecoins.
 * Returns the Transaction for signing.
 */
export async function buildMint(
  sender: string,
  amount: bigint,
  stableCoinType: string = BTC_USDC_TYPE,
): Promise<Transaction> {
  const client = getStableLayerClient(sender);
  const tx = new Transaction();

  await client.buildMintTx({
    tx,
    stableCoinType,
    usdcCoin: coinWithBalance({
      balance: amount,
      type: USDC_TYPE,
    })(tx),
    amount,
  });

  return tx;
}

/**
 * Build a burn transaction: burn stablecoins to redeem USDC.
 */
export async function buildBurn(
  sender: string,
  amount: bigint,
  stableCoinType: string = BTC_USDC_TYPE,
): Promise<Transaction> {
  const client = getStableLayerClient(sender);
  const tx = new Transaction();

  await client.buildBurnTx({
    tx,
    stableCoinType,
    amount,
  });

  return tx;
}

/**
 * Build a burn-all transaction.
 */
export async function buildBurnAll(
  sender: string,
  stableCoinType: string = BTC_USDC_TYPE,
): Promise<Transaction> {
  const client = getStableLayerClient(sender);
  const tx = new Transaction();

  await client.buildBurnTx({
    tx,
    stableCoinType,
    all: true,
  });

  return tx;
}

/**
 * Build a claim rewards transaction.
 */
export async function buildClaim(
  sender: string,
  stableCoinType: string = BTC_USDC_TYPE,
): Promise<Transaction> {
  const client = getStableLayerClient(sender);
  const tx = new Transaction();

  await client.buildClaimTx({
    tx,
    stableCoinType,
  });

  return tx;
}

/**
 * Query total supply across all Stablelayer coin types.
 */
export async function getTotalSupply(
  sender: string,
): Promise<string | undefined> {
  const client = getStableLayerClient(sender);
  return client.getTotalSupply();
}

/**
 * Query total supply for a specific stablecoin type.
 */
export async function getTotalSupplyByCoinType(
  sender: string,
  stableCoinType: string = BTC_USDC_TYPE,
): Promise<string | undefined> {
  const client = getStableLayerClient(sender);
  return client.getTotalSupplyByCoinType(stableCoinType);
}
