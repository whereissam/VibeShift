import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import {
  VIBESHIFT_PACKAGE_ID,
  ADMIN_CAP_ID,
  AGENT_CAP_ID,
  CLOCK_ID,
  SUI_RPC_URL,
} from "./constants";

const MODULE = "vault";

export function getSuiClient(): SuiClient {
  return new SuiClient({ url: SUI_RPC_URL });
}

/**
 * Create a new vault for a specific coin type.
 * Requires AdminCap.
 */
export function buildCreateVaultTx(coinType: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::create_vault`,
    typeArguments: [coinType],
    arguments: [tx.object(ADMIN_CAP_ID)],
  });
  return tx;
}

/**
 * Deposit coins into a vault.
 */
export function buildDepositTx(
  vaultId: string,
  coinType: string,
  coinObjectId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::deposit`,
    typeArguments: [coinType],
    arguments: [tx.object(vaultId), tx.object(coinObjectId)],
  });
  return tx;
}

/**
 * Withdraw from a vault by burning LP shares.
 */
export function buildWithdrawTx(
  vaultId: string,
  coinType: string,
  lpAmount: bigint,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::withdraw`,
    typeArguments: [coinType],
    arguments: [tx.object(vaultId), tx.pure.u64(lpAmount)],
  });
  return tx;
}

/**
 * Rebalance vault funds to an external protocol.
 * Requires AgentCap.
 */
export function buildRebalanceTx(
  vaultId: string,
  coinType: string,
  amount: bigint,
  direction: string,
  recipient: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::rebalance_to_protocol`,
    typeArguments: [coinType],
    arguments: [
      tx.object(AGENT_CAP_ID),
      tx.object(vaultId),
      tx.pure.u64(amount),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(direction))),
      tx.pure.address(recipient),
    ],
  });
  return tx;
}

/**
 * Receive funds back into the vault from a protocol.
 */
export function buildReceiveFromProtocolTx(
  vaultId: string,
  coinType: string,
  coinObjectId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::receive_from_protocol`,
    typeArguments: [coinType],
    arguments: [tx.object(vaultId), tx.object(coinObjectId)],
  });
  return tx;
}

/**
 * Store an on-chain reasoning proof. Requires AgentCap.
 */
export function buildStoreProofTx(
  vaultId: string,
  action: string,
  rationale: string,
  cetusYieldBps: bigint,
  stablelayerYieldBps: bigint,
  shiftPct: bigint,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::store_proof`,
    arguments: [
      tx.object(AGENT_CAP_ID),
      tx.pure.id(vaultId),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(action))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(rationale))),
      tx.pure.u64(cetusYieldBps),
      tx.pure.u64(stablelayerYieldBps),
      tx.pure.u64(shiftPct),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Store a Walrus blob ID on-chain. Requires AgentCap.
 */
export function buildStoreWalrusProofTx(
  vaultId: string,
  walrusBlobId: string,
  action: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::store_walrus_proof`,
    arguments: [
      tx.object(AGENT_CAP_ID),
      tx.pure.id(vaultId),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(walrusBlobId)),
      ),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(action))),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Store an encrypted Walrus blob ID on-chain. Requires AgentCap.
 */
export function buildStoreEncryptedProofTx(
  vaultId: string,
  walrusBlobId: string,
  action: string,
  sealPolicyId: string,
  encryptionVersion: number,
): Transaction {
  const tx = new Transaction();
  const encoder = new TextEncoder();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::store_encrypted_proof`,
    arguments: [
      tx.object(AGENT_CAP_ID),
      tx.pure.id(vaultId),
      tx.pure.vector(
        "u8",
        Array.from(encoder.encode(walrusBlobId)),
      ),
      tx.pure.vector("u8", Array.from(encoder.encode(action))),
      tx.pure.vector("u8", Array.from(encoder.encode(sealPolicyId))),
      tx.pure.u8(encryptionVersion),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Transfer AgentCap to a new agent address.
 */
export function buildTransferAgentCapTx(newAgent: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::transfer_agent_cap`,
    arguments: [tx.object(AGENT_CAP_ID), tx.pure.address(newAgent)],
  });
  return tx;
}

// ===== Read helpers =====

/**
 * Query vault balance and LP supply from on-chain state.
 */
export async function getVaultState(
  vaultId: string,
): Promise<{ balance: string; lpSupply: string } | null> {
  const client = getSuiClient();
  const obj = await client.getObject({
    id: vaultId,
    options: { showContent: true },
  });

  if (obj.data?.content?.dataType !== "moveObject") return null;
  const fields = obj.data.content.fields as Record<string, unknown>;
  return {
    balance: String((fields.assets as Record<string, unknown>)?.value ?? "0"),
    lpSupply: String(fields.lp_supply ?? "0"),
  };
}

// ===== Event types =====

export interface RebalanceEventData {
  vaultId: string;
  agent: string;
  amount: string;
  direction: string;
  totalAssetsAfter: string;
  txDigest: string;
  timestampMs: string;
}

export interface FlashShiftEventData {
  vaultId: string;
  agent: string;
  amount: string;
  repaid: string;
  protocol: string;
  totalAssetsAfter: string;
  txDigest: string;
  timestampMs: string;
}

export interface RebalanceEvents {
  rebalances: RebalanceEventData[];
  flashShifts: FlashShiftEventData[];
}

function decodeBytes(raw: unknown): string {
  if (Array.isArray(raw)) {
    return new TextDecoder().decode(new Uint8Array(raw));
  }
  return String(raw ?? "");
}

/**
 * Query on-chain RebalanceEvent and FlashShiftEvent emissions for a vault.
 */
export async function getRebalanceEvents(
  vaultId?: string,
  limit = 50,
): Promise<RebalanceEvents> {
  const client = getSuiClient();

  const [rebalanceRes, flashShiftRes] = await Promise.all([
    client.queryEvents({
      query: {
        MoveEventType: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::RebalanceEvent`,
      },
      limit,
      order: "descending",
    }),
    client.queryEvents({
      query: {
        MoveEventType: `${VIBESHIFT_PACKAGE_ID}::${MODULE}::FlashShiftEvent`,
      },
      limit,
      order: "descending",
    }),
  ]);

  const rebalances: RebalanceEventData[] = rebalanceRes.data
    .map((ev) => {
      const f = ev.parsedJson as Record<string, unknown>;
      return {
        vaultId: String(f.vault_id ?? ""),
        agent: String(f.agent ?? ""),
        amount: String(f.amount ?? "0"),
        direction: decodeBytes(f.direction),
        totalAssetsAfter: String(f.total_assets_after ?? "0"),
        txDigest: ev.id.txDigest,
        timestampMs: ev.timestampMs ?? "0",
      };
    })
    .filter((e) => !vaultId || e.vaultId === vaultId);

  const flashShifts: FlashShiftEventData[] = flashShiftRes.data
    .map((ev) => {
      const f = ev.parsedJson as Record<string, unknown>;
      return {
        vaultId: String(f.vault_id ?? ""),
        agent: String(f.agent ?? ""),
        amount: String(f.amount ?? "0"),
        repaid: String(f.repaid ?? "0"),
        protocol: decodeBytes(f.protocol),
        totalAssetsAfter: String(f.total_assets_after ?? "0"),
        txDigest: ev.id.txDigest,
        timestampMs: ev.timestampMs ?? "0",
      };
    })
    .filter((e) => !vaultId || e.vaultId === vaultId);

  return { rebalances, flashShifts };
}
