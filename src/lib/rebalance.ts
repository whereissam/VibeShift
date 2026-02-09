import { SuiClient } from "@mysten/sui/client";
import type { Keypair } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import {
  VIBESHIFT_PACKAGE_ID,
  AGENT_CAP_ID,
  CLOCK_ID,
  SUI_RPC_URL,
  MAX_SHIFT_PCT,
  YIELD_THRESHOLD_BPS,
  REBALANCE_COOLDOWN_MS,
  MIN_REBALANCE_AMOUNT,
  WALRUS_PUBLISHER,
  SEAL_ENCRYPTION_VERSION,
} from "./constants";
import { encryptAndUploadProof, type ProofPlaintext } from "./walrus-seal";
import { buildStoreEncryptedProofTx } from "./vault";
import { getVaultState } from "./vault";
import { getPoolStats } from "./cetus";
import { getTotalSupply } from "./stablelayer";

export interface RebalanceDecision {
  shouldRebalance: boolean;
  direction: "to_cetus" | "to_stablelayer" | "hold";
  shiftPct: number;
  shiftAmount: bigint;
  reason: string;
  cetusYieldBps: number;
  stablelayerYieldBps: number;
}

export interface RebalanceResult {
  txDigest: string;
  decision: RebalanceDecision;
  walrusBlobId?: string;
  encrypted?: boolean;
  sealPolicyId?: string;
}

export class RebalanceEngine {
  private client: SuiClient;
  private signer: Keypair;
  private vaultId: string;
  private coinType: string;
  private lastRebalanceTime = 0;
  private sealSecret?: string;

  constructor(
    signer: Keypair,
    vaultId: string,
    coinType: string,
    sealSecret?: string,
  ) {
    this.client = new SuiClient({ url: SUI_RPC_URL });
    this.signer = signer;
    this.vaultId = vaultId;
    this.coinType = coinType;
    this.sealSecret = sealSecret;
  }

  /**
   * Analyze current yield across protocols and decide whether to rebalance.
   */
  async analyze(): Promise<RebalanceDecision> {
    // Fetch vault state
    const vaultState = await getVaultState(this.vaultId);
    if (!vaultState) {
      return {
        shouldRebalance: false,
        direction: "hold",
        shiftPct: 0,
        shiftAmount: 0n,
        reason: "Vault not found",
        cetusYieldBps: 0,
        stablelayerYieldBps: 0,
      };
    }

    const tvl = BigInt(vaultState.balance);
    if (tvl < MIN_REBALANCE_AMOUNT) {
      return {
        shouldRebalance: false,
        direction: "hold",
        shiftPct: 0,
        shiftAmount: 0n,
        reason: `TVL too low: ${tvl}`,
        cetusYieldBps: 0,
        stablelayerYieldBps: 0,
      };
    }

    // Check cooldown
    const now = Date.now();
    if (now - this.lastRebalanceTime < REBALANCE_COOLDOWN_MS) {
      return {
        shouldRebalance: false,
        direction: "hold",
        shiftPct: 0,
        shiftAmount: 0n,
        reason: "Cooldown active",
        cetusYieldBps: 0,
        stablelayerYieldBps: 0,
      };
    }

    // Fetch yield data
    const [poolStats, stableSupply] = await Promise.all([
      getPoolStats(),
      getTotalSupply(this.signer.toSuiAddress()),
    ]);

    // Estimate yields (simplified - in production use historical fee data)
    // Cetus: fee_rate is in bps (e.g., 2500 = 0.25%)
    const cetusYieldBps = poolStats.feeRate;
    // Stablelayer: approximate yield from supply growth (placeholder)
    const stablelayerYieldBps = stableSupply ? 500 : 0; // 5% placeholder

    const yieldDiff = Math.abs(cetusYieldBps - stablelayerYieldBps);
    const direction: RebalanceDecision["direction"] =
      cetusYieldBps > stablelayerYieldBps ? "to_cetus" : "to_stablelayer";

    if (yieldDiff < YIELD_THRESHOLD_BPS) {
      return {
        shouldRebalance: false,
        direction: "hold",
        shiftPct: 0,
        shiftAmount: 0n,
        reason: `Yield differential ${yieldDiff}bps < threshold ${YIELD_THRESHOLD_BPS}bps`,
        cetusYieldBps,
        stablelayerYieldBps,
      };
    }

    // Calculate shift amount
    const shiftPct = Math.min(MAX_SHIFT_PCT, Math.floor(yieldDiff / 10));
    const shiftAmount = (tvl * BigInt(shiftPct)) / 100n;

    return {
      shouldRebalance: true,
      direction,
      shiftPct,
      shiftAmount,
      reason: `Cetus yield ${cetusYieldBps}bps vs Stablelayer ${stablelayerYieldBps}bps, shifting ${shiftPct}% TVL ${direction}`,
      cetusYieldBps,
      stablelayerYieldBps,
    };
  }

  /**
   * Execute a rebalance: withdraw from vault, store proof on-chain.
   */
  async execute(decision: RebalanceDecision): Promise<RebalanceResult> {
    if (!decision.shouldRebalance || decision.shiftAmount === 0n) {
      throw new Error("Nothing to rebalance");
    }

    const tx = new Transaction();
    const encoder = new TextEncoder();

    // 1. Rebalance from vault
    tx.moveCall({
      target: `${VIBESHIFT_PACKAGE_ID}::vault::rebalance_to_protocol`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(AGENT_CAP_ID),
        tx.object(this.vaultId),
        tx.pure.u64(decision.shiftAmount),
        tx.pure.vector(
          "u8",
          Array.from(encoder.encode(decision.direction)),
        ),
        tx.pure.address(this.signer.toSuiAddress()),
      ],
    });

    // 2. Store reasoning proof on-chain
    tx.moveCall({
      target: `${VIBESHIFT_PACKAGE_ID}::vault::store_proof`,
      arguments: [
        tx.object(AGENT_CAP_ID),
        tx.pure.id(this.vaultId),
        tx.pure.vector(
          "u8",
          Array.from(encoder.encode(decision.direction)),
        ),
        tx.pure.vector(
          "u8",
          Array.from(encoder.encode(decision.reason)),
        ),
        tx.pure.u64(BigInt(decision.cetusYieldBps)),
        tx.pure.u64(BigInt(decision.stablelayerYieldBps)),
        tx.pure.u64(BigInt(decision.shiftPct)),
        tx.object(CLOCK_ID),
      ],
    });

    // Sign and execute
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
    });

    this.lastRebalanceTime = Date.now();

    // 3. Store detailed proof on Walrus (best-effort)
    let walrusBlobId: string | undefined;
    let encrypted = false;
    let sealPolicyId: string | undefined;

    try {
      if (this.sealSecret) {
        const uploadResult = await this.storeEncryptedWalrusProof(decision);
        walrusBlobId = uploadResult?.walrusBlobId;
        sealPolicyId = uploadResult?.sealPolicyId;
        encrypted = !!walrusBlobId;

        // Store encrypted proof reference on-chain
        if (walrusBlobId && sealPolicyId) {
          const encTx = buildStoreEncryptedProofTx(
            this.vaultId,
            walrusBlobId,
            decision.direction,
            sealPolicyId,
            SEAL_ENCRYPTION_VERSION,
          );
          await this.client.signAndExecuteTransaction({
            transaction: encTx,
            signer: this.signer,
          });
        }
      } else {
        walrusBlobId = await this.storeWalrusProof(decision);
      }
    } catch {
      // Walrus upload is best-effort
    }

    return {
      txDigest: result.digest,
      decision,
      walrusBlobId,
      encrypted,
      sealPolicyId,
    };
  }

  /**
   * Upload detailed proof JSON to Walrus and return blob ID.
   */
  private async storeWalrusProof(
    decision: RebalanceDecision,
  ): Promise<string | undefined> {
    const proofJson = JSON.stringify({
      timestamp: new Date().toISOString(),
      vault_id: this.vaultId,
      direction: decision.direction,
      shift_pct: decision.shiftPct,
      shift_amount: decision.shiftAmount.toString(),
      reason: decision.reason,
      cetus_yield_bps: decision.cetusYieldBps,
      stablelayer_yield_bps: decision.stablelayerYieldBps,
    });

    const response = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=5`, {
      method: "PUT",
      body: proofJson,
    });

    if (!response.ok) return undefined;

    const data = (await response.json()) as Record<string, unknown>;
    // Response contains either { newlyCreated: { blobObject: { blobId } } }
    // or { alreadyCertified: { blobId } }
    const newlyCreated = data.newlyCreated as
      | Record<string, unknown>
      | undefined;
    const alreadyCertified = data.alreadyCertified as
      | Record<string, unknown>
      | undefined;

    if (newlyCreated) {
      const blobObject = newlyCreated.blobObject as Record<string, unknown>;
      return String(blobObject.blobId);
    }
    if (alreadyCertified) {
      return String(alreadyCertified.blobId);
    }

    return undefined;
  }

  /**
   * Encrypt proof and upload to Walrus. Returns encrypted upload result.
   */
  private async storeEncryptedWalrusProof(
    decision: RebalanceDecision,
  ): Promise<{ walrusBlobId: string; sealPolicyId: string } | undefined> {
    if (!this.sealSecret) return undefined;

    const proof: ProofPlaintext = {
      timestamp: new Date().toISOString(),
      vault_id: this.vaultId,
      direction: decision.direction,
      shift_pct: decision.shiftPct,
      shift_amount: decision.shiftAmount.toString(),
      reason: decision.reason,
      cetus_yield_bps: decision.cetusYieldBps,
      stablelayer_yield_bps: decision.stablelayerYieldBps,
    };

    try {
      const result = await encryptAndUploadProof(
        proof,
        this.sealSecret,
        this.vaultId,
      );
      return {
        walrusBlobId: result.walrusBlobId,
        sealPolicyId: result.sealPolicyId,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Run one analysis + execute cycle. Returns null if no rebalance needed.
   */
  async tick(): Promise<RebalanceResult | null> {
    const decision = await this.analyze();
    if (!decision.shouldRebalance) {
      console.log(`[VibeShift] Hold: ${decision.reason}`);
      return null;
    }

    console.log(`[VibeShift] Rebalancing: ${decision.reason}`);
    const result = await this.execute(decision);
    console.log(`[VibeShift] Done: tx=${result.txDigest}`);
    return result;
  }
}
