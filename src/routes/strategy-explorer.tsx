import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import {
  Eye,
  EyeOff,
  ExternalLink,
  TrendingUp,
  ArrowDownUp,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  BarChart3,
  Droplets,
  Gauge,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NETWORK,
  WALRUS_AGGREGATOR,
  YIELD_THRESHOLD_BPS,
  MAX_SHIFT_PCT,
} from "@/lib/constants";
import {
  downloadAndDecryptProof,
  type ProofPlaintext,
  type EncryptedProofPayload,
} from "@/lib/walrus-seal";
import {
  getRebalanceEvents,
  type RebalanceEventData,
  type FlashShiftEventData,
} from "@/lib/vault";

// ===== Types =====

interface ProofEntry {
  id: string;
  action: string;
  reason: string;
  cetusYieldBps: number;
  stablelayerYieldBps: number;
  shiftPct: number;
  shiftAmount: string;
  timestamp: string;
  txDigest?: string;
  walrusBlobId?: string;
  poolSnapshot?: PoolSnapshot;
  confidence?: number;
  flashShift?: boolean;
  yieldDragSavedBps?: number;
}

interface PoolSnapshot {
  liquidity: string;
  volume24h: string;
  feeRate: number;
  currentTick: number;
}

// ===== Mock Data =====

const MOCK_PROOFS: ProofEntry[] = [
  {
    id: "proof-001",
    action: "to_cetus",
    reason:
      "Cetus SUI/USDC pool fee rate spiked to 25% APY due to increased trading volume from SUI price movement. Stablelayer holding steady at 5%. Differential of 20% exceeds 2% threshold. Shifting 40% TVL via Flash-Shift for zero-drag rebalance.",
    cetusYieldBps: 2500,
    stablelayerYieldBps: 500,
    shiftPct: 40,
    shiftAmount: "2000000000",
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    txDigest: "GmkW4Hw7r8Wd3ca62M6otBFjp1v684pEXjvYwQ67v3Zw",
    walrusBlobId: "abc123def456",
    poolSnapshot: {
      liquidity: "184920000000",
      volume24h: "52300000000",
      feeRate: 2500,
      currentTick: -22,
    },
    confidence: 94,
    flashShift: true,
    yieldDragSavedBps: 340,
  },
  {
    id: "proof-002",
    action: "to_stablelayer",
    reason:
      "Cetus yield dropped to 3% as trading volume normalized. Stablelayer offering stable 8% from new incentive program. Shifting 20% TVL back to Stablelayer for higher risk-adjusted returns.",
    cetusYieldBps: 300,
    stablelayerYieldBps: 800,
    shiftPct: 20,
    shiftAmount: "1000000000",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    txDigest: "Hj8kP2Qr5tVw9xB3nM7oR4sY6fC1gD0eI8jK2lA5nZ3",
    poolSnapshot: {
      liquidity: "142000000000",
      volume24h: "18700000000",
      feeRate: 300,
      currentTick: -18,
    },
    confidence: 87,
    flashShift: false,
    yieldDragSavedBps: 0,
  },
  {
    id: "proof-003",
    action: "to_cetus",
    reason:
      "Flash-Shift with DeepBook V3 Liquidity Injection. Vault capital $10k + DeepBook flash loan $5k = $15k deployed to Cetus LP. Yield spike from DEX aggregator routing through SUI/USDC. Repaid both flash receipts atomically.",
    cetusYieldBps: 3200,
    stablelayerYieldBps: 500,
    shiftPct: 40,
    shiftAmount: "3000000000",
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    txDigest: "Lm4nO6pQ8rS0tU2vW4xY6zA8bC0dE2fG4hI6jK8lM0n",
    walrusBlobId: "ghi789jkl012",
    poolSnapshot: {
      liquidity: "210400000000",
      volume24h: "89100000000",
      feeRate: 3200,
      currentTick: -26,
    },
    confidence: 91,
    flashShift: true,
    yieldDragSavedBps: 520,
  },
];

// ===== Helpers =====

function formatAmount(raw: string, decimals = 9): string {
  const num = Number(raw) / 10 ** decimals;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(2);
}

function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const explorerBase =
  NETWORK === "mainnet"
    ? "https://suiscan.xyz/mainnet"
    : "https://suiscan.xyz/testnet";

// ===== Proof Cache (localStorage) =====

const CACHE_KEY = "vibeshift:decrypted-proofs";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CachedProof {
  proof: ProofPlaintext;
  cachedAt: number;
}

function getCachedProof(blobId: string): ProofPlaintext | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, CachedProof>;
    const entry = cache[blobId];
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      delete cache[blobId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return null;
    }
    return entry.proof;
  } catch {
    return null;
  }
}

function setCachedProof(blobId: string, proof: ProofPlaintext): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cache = raw ? (JSON.parse(raw) as Record<string, CachedProof>) : {};
    cache[blobId] = { proof, cachedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

// ===== On-chain event → ProofEntry conversion =====

function rebalanceEventToProof(ev: RebalanceEventData): ProofEntry {
  return {
    id: `rebalance-${ev.txDigest}`,
    action: ev.direction,
    reason: `Rebalanced ${formatAmount(ev.amount, 9)} to ${ev.direction}`,
    cetusYieldBps: 0,
    stablelayerYieldBps: 0,
    shiftPct: 0,
    shiftAmount: ev.amount,
    timestamp: new Date(Number(ev.timestampMs)).toISOString(),
    txDigest: ev.txDigest,
    flashShift: false,
  };
}

function flashShiftEventToProof(ev: FlashShiftEventData): ProofEntry {
  return {
    id: `flash-${ev.txDigest}`,
    action: ev.protocol || "to_cetus",
    reason: `Flash-Shift: borrowed ${formatAmount(ev.amount, 9)}, repaid ${formatAmount(ev.repaid, 9)} via ${ev.protocol}`,
    cetusYieldBps: 0,
    stablelayerYieldBps: 0,
    shiftPct: 0,
    shiftAmount: ev.amount,
    timestamp: new Date(Number(ev.timestampMs)).toISOString(),
    txDigest: ev.txDigest,
    flashShift: true,
    yieldDragSavedBps:
      Number(ev.amount) > 0
        ? Math.max(
            0,
            Math.round(
              ((Number(ev.repaid) - Number(ev.amount)) / Number(ev.amount)) *
                10_000,
            ),
          )
        : 0,
  };
}

// ===== Components =====

function YieldComparisonChart({
  cetusYieldBps,
  stablelayerYieldBps,
}: {
  cetusYieldBps: number;
  stablelayerYieldBps: number;
}) {
  const maxBps = Math.max(cetusYieldBps, stablelayerYieldBps, 1000);
  const cetusPct = (cetusYieldBps / maxBps) * 100;
  const stablePct = (stablelayerYieldBps / maxBps) * 100;
  const diff = cetusYieldBps - stablelayerYieldBps;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>Yield at time of decision</span>
        <span
          className={`font-medium ${diff > 0 ? "text-blue-500" : "text-green-500"}`}
        >
          {diff > 0 ? "+" : ""}
          {bpsToPercent(diff)} differential
        </span>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cetus SUI/USDC</span>
            <span className="font-medium text-foreground">
              {bpsToPercent(cetusYieldBps)}
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${cetusPct}%` }}
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stablelayer</span>
            <span className="font-medium text-foreground">
              {bpsToPercent(stablelayerYieldBps)}
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${stablePct}%` }}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>Threshold: {bpsToPercent(YIELD_THRESHOLD_BPS)}</span>
        <span className="mx-1">|</span>
        <span>Max shift: {MAX_SHIFT_PCT}% TVL</span>
      </div>
    </div>
  );
}

function PoolSnapshotCard({ snapshot }: { snapshot: PoolSnapshot }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Droplets className="h-3 w-3" />
          Liquidity
        </div>
        <div className="text-sm font-medium text-foreground">
          ${formatAmount(snapshot.liquidity, 9)}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <BarChart3 className="h-3 w-3" />
          24h Volume
        </div>
        <div className="text-sm font-medium text-foreground">
          ${formatAmount(snapshot.volume24h, 9)}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          Fee Rate
        </div>
        <div className="text-sm font-medium text-foreground">
          {bpsToPercent(snapshot.feeRate)}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Gauge className="h-3 w-3" />
          Tick
        </div>
        <div className="text-sm font-mono text-foreground">
          {snapshot.currentTick}
        </div>
      </div>
    </div>
  );
}

function EncryptedView({ blobId }: { blobId: string }) {
  const mockEncrypted: EncryptedProofPayload = {
    v: 1,
    iv: "dGhpcyBpcyBhIHRlc3Q=",
    ct: "ZW5jcnlwdGVkX3N0cmF0ZWd5X3JlYXNvbmluZ19ibG9iX3dpdGhfcG9vbF9zdGF0ZV9zbmFwc2hvdF9hbmRfY29uZmlkZW5jZV9zY29yZQ==",
    policy: `vibeshift-seal-v1:vault-001`,
  };

  return (
    <div className="bg-muted/50 rounded-md p-3 font-mono text-xs space-y-2 overflow-x-auto">
      <div className="flex items-center gap-1 text-muted-foreground mb-2">
        <Lock className="h-3 w-3" />
        Encrypted Blob (Walrus Seal)
      </div>
      <div>
        <span className="text-muted-foreground">blob_id: </span>
        <span className="text-foreground">{blobId}</span>
      </div>
      <div>
        <span className="text-muted-foreground">version: </span>
        <span className="text-foreground">{mockEncrypted.v}</span>
      </div>
      <div>
        <span className="text-muted-foreground">iv: </span>
        <span className="text-foreground break-all">{mockEncrypted.iv}</span>
      </div>
      <div>
        <span className="text-muted-foreground">ciphertext: </span>
        <span className="text-foreground break-all">
          {mockEncrypted.ct.slice(0, 48)}...
        </span>
      </div>
      <div>
        <span className="text-muted-foreground">policy: </span>
        <span className="text-foreground">{mockEncrypted.policy}</span>
      </div>
    </div>
  );
}

function DecryptedView({
  proof,
  liveDecrypted,
}: {
  proof: ProofEntry;
  liveDecrypted: ProofPlaintext | null;
}) {
  const plaintext: ProofPlaintext = liveDecrypted ?? {
    timestamp: proof.timestamp,
    vault_id: "0x946c...df80",
    direction: proof.action,
    shift_pct: proof.shiftPct,
    shift_amount: proof.shiftAmount,
    reason: proof.reason,
    cetus_yield_bps: proof.cetusYieldBps,
    stablelayer_yield_bps: proof.stablelayerYieldBps,
  };

  return (
    <div className="bg-muted/50 rounded-md p-3 font-mono text-xs space-y-1 overflow-x-auto">
      <div className="flex items-center gap-1 text-muted-foreground mb-2">
        <Unlock className="h-3 w-3" />
        {liveDecrypted ? "Decrypted from Walrus" : "Decrypted Plaintext (local)"}
      </div>
      <pre className="text-foreground whitespace-pre-wrap">
        {JSON.stringify(plaintext, null, 2)}
      </pre>
    </div>
  );
}

function ProofDetailCard({ proof }: { proof: ProofEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [showEncrypted, setShowEncrypted] = useState(false);
  const [decryptedProof, setDecryptedProof] = useState<ProofPlaintext | null>(
    null,
  );
  const [decrypting, setDecrypting] = useState(false);

  const directionColor =
    proof.action === "to_cetus"
      ? "text-blue-500 bg-blue-500/10 border-blue-500/20"
      : "text-green-500 bg-green-500/10 border-green-500/20";

  const directionLabel =
    proof.action === "to_cetus" ? "CETUS" : "STABLELAYER";

  const handleDecrypt = useCallback(async () => {
    if (!proof.walrusBlobId) return;

    // Check localStorage cache first
    const cached = getCachedProof(proof.walrusBlobId);
    if (cached) {
      setDecryptedProof(cached);
      return;
    }

    setDecrypting(true);
    try {
      const result = await downloadAndDecryptProof(
        proof.walrusBlobId,
        "vibeshift-demo-secret",
        "0x946cd5d3f1ec50c9597c7840bcb590ec3a58ac6e7c535e4a4c9b78037e84df80",
      );
      setDecryptedProof(result);
      setCachedProof(proof.walrusBlobId, result);
    } catch {
      // Fallback — Walrus testnet may not have the blob
      setDecryptedProof(null);
    }
    setDecrypting(false);
  }, [proof.walrusBlobId]);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
      >
        {/* Direction badge */}
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full border ${directionColor}`}
        >
          {directionLabel}
        </span>

        {/* Summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {proof.shiftPct}% TVL shift
            </span>
            {proof.flashShift && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Zap className="inline h-2.5 w-2.5 mr-0.5" />
                FLASH
              </span>
            )}
            {proof.confidence && (
              <span className="text-xs text-muted-foreground">
                {proof.confidence}% confidence
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <span>{formatDate(proof.timestamp)}</span>
            <span className="text-muted-foreground/50">({timeAgo(proof.timestamp)})</span>
          </div>
        </div>

        {/* Yield pills */}
        <div className="hidden sm:flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-500">
            Cetus {bpsToPercent(proof.cetusYieldBps)}
          </span>
          <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500">
            Stable {bpsToPercent(proof.stablelayerYieldBps)}
          </span>
        </div>

        {/* Expand icon */}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-5">
          {/* Reasoning */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Agent Reasoning
            </h4>
            <p className="text-sm text-foreground leading-relaxed">
              {proof.reason}
            </p>
          </div>

          {/* Yield chart */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Yield Comparison
            </h4>
            <YieldComparisonChart
              cetusYieldBps={proof.cetusYieldBps}
              stablelayerYieldBps={proof.stablelayerYieldBps}
            />
          </div>

          {/* Pool state snapshot */}
          {proof.poolSnapshot && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Pool State Snapshot
              </h4>
              <PoolSnapshotCard snapshot={proof.poolSnapshot} />
            </div>
          )}

          {/* Metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-muted/50 rounded-md p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase">
                Shift Amount
              </div>
              <div className="text-sm font-medium text-foreground">
                ${formatAmount(proof.shiftAmount, 9)}
              </div>
            </div>
            <div className="bg-muted/50 rounded-md p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase">
                Confidence
              </div>
              <div className="text-sm font-medium text-foreground">
                {proof.confidence ?? "—"}%
              </div>
            </div>
            <div className="bg-muted/50 rounded-md p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase">
                Method
              </div>
              <div className="text-sm font-medium text-foreground">
                {proof.flashShift ? "Flash-Shift" : "Standard"}
              </div>
            </div>
            <div className="bg-muted/50 rounded-md p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase">
                Drag Saved
              </div>
              <div className="text-sm font-medium text-foreground">
                {proof.yieldDragSavedBps
                  ? bpsToPercent(proof.yieldDragSavedBps)
                  : "—"}
              </div>
            </div>
          </div>

          {/* Encryption toggle */}
          {proof.walrusBlobId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Strategy Proof (Walrus Seal)
                </h4>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleDecrypt}
                    disabled={decrypting}
                  >
                    {decrypting ? "Decrypting..." : "Fetch & Decrypt"}
                  </Button>
                  <button
                    onClick={() => setShowEncrypted(!showEncrypted)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showEncrypted ? (
                      <>
                        <EyeOff className="h-3 w-3" /> Decrypted
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" /> Encrypted
                      </>
                    )}
                  </button>
                </div>
              </div>
              {showEncrypted ? (
                <EncryptedView blobId={proof.walrusBlobId} />
              ) : (
                <DecryptedView proof={proof} liveDecrypted={decryptedProof} />
              )}
            </div>
          )}

          {/* Links */}
          <div className="flex gap-3 pt-2 border-t border-border">
            {proof.txDigest && (
              <a
                href={`${explorerBase}/tx/${proof.txDigest}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View Transaction <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {proof.walrusBlobId && (
              <a
                href={`${WALRUS_AGGREGATOR}/v1/blobs/${proof.walrusBlobId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Walrus Blob <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Page =====

function StrategyExplorer() {
  const [proofs, setProofs] = useState<ProofEntry[]>(MOCK_PROOFS);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const fetchOnChainEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const events = await getRebalanceEvents();
      const onChainProofs: ProofEntry[] = [
        ...events.rebalances.map(rebalanceEventToProof),
        ...events.flashShifts.map(flashShiftEventToProof),
      ];

      if (onChainProofs.length > 0) {
        // Merge: on-chain events first, then mock data as fallback
        const onChainIds = new Set(onChainProofs.map((p) => p.txDigest));
        const deduped = [
          ...onChainProofs,
          ...MOCK_PROOFS.filter((m) => !onChainIds.has(m.txDigest)),
        ];
        deduped.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        setProofs(deduped);
      }
    } catch {
      // On-chain query failed — keep mock data
    }
    setLoadingEvents(false);
  }, []);

  useEffect(() => {
    fetchOnChainEvents();
  }, [fetchOnChainEvents]);

  // Calculate cumulative yield drag saved
  const totalDragSavedBps = proofs.reduce(
    (sum, p) => sum + (p.yieldDragSavedBps ?? 0),
    0,
  );
  const flashShiftCount = proofs.filter((p) => p.flashShift).length;
  const totalShiftVolume = proofs.reduce(
    (sum, p) => sum + Number(p.shiftAmount),
    0,
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-foreground">
            <img src="/logo.svg" alt="VibeShift" className="h-10 w-10" />
            Strategy Explorer
          </h1>
          <p className="text-muted-foreground mt-1">
            Decrypted agent reasoning — every rebalance decision, explained
          </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchOnChainEvents} disabled={loadingEvents}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loadingEvents ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                Total Rebalances
              </span>
              <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {proofs.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {flashShiftCount} via Flash-Shift
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                Yield Drag Saved
              </span>
              <Zap className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-500">
              {bpsToPercent(totalDragSavedBps)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cumulative via atomic Flash-Shift
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                Shift Volume
              </span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              ${formatAmount(String(totalShiftVolume), 9)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total capital rebalanced
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                Last Activity
              </span>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {proofs.length > 0 ? timeAgo(proofs[0].timestamp) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {proofs.length > 0 ? formatDate(proofs[0].timestamp) : "No activity"}
            </p>
          </div>
        </div>

        {/* Proof Timeline */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <ArrowDownUp className="h-5 w-5" />
            Proof Timeline
          </h2>
          {proofs.length === 0 ? (
            <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
              No rebalances yet. The Sentinel is monitoring yields...
            </div>
          ) : (
            <div className="space-y-3">
              {proofs.map((proof) => (
                <ProofDetailCard key={proof.id} proof={proof} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/strategy-explorer")({
  component: StrategyExplorer,
});
