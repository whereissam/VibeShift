import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowDownUp,
  TrendingUp,
  Vault,
  Activity,
  ExternalLink,
  RefreshCw,
  Shield,
  ArrowUpFromLine,
  ArrowDownToLine,
} from "lucide-react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { VIBESHIFT_PACKAGE_ID, NETWORK, WALRUS_AGGREGATOR } from "@/lib/constants";

// ===== Types =====

interface VaultData {
  balance: string;
  lpSupply: string;
}

interface PoolData {
  feeRate: number;
  liquidity: string;
  currentTick: number;
}

interface RebalanceProof {
  action: string;
  reason: string;
  cetusYieldBps: number;
  stablelayerYieldBps: number;
  shiftPct: number;
  timestamp: string;
  txDigest?: string;
  walrusBlobId?: string;
}

// ===== Mock Data (replace with live queries) =====

const MOCK_VAULT: VaultData = { balance: "5000000000", lpSupply: "5000000000" };
const MOCK_POOL: PoolData = { feeRate: 2500, liquidity: "184920000000", currentTick: -22 };
const MOCK_PROOFS: RebalanceProof[] = [
  {
    action: "to_cetus",
    reason: "Cetus yield 2500bps vs Stablelayer 500bps, shifting 40% TVL to_cetus",
    cetusYieldBps: 2500,
    stablelayerYieldBps: 500,
    shiftPct: 40,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    txDigest: "GmkW4Hw7r8Wd3ca62M6otBFjp1v684pEXjvYwQ67v3Zw",
  },
  {
    action: "to_stablelayer",
    reason: "Cetus yield 300bps vs Stablelayer 800bps, shifting 20% TVL to_stablelayer",
    cetusYieldBps: 300,
    stablelayerYieldBps: 800,
    shiftPct: 20,
    timestamp: new Date(Date.now() - 86400000).toISOString(),
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

const explorerBase =
  NETWORK === "mainnet"
    ? "https://suiscan.xyz/mainnet"
    : "https://suiscan.xyz/testnet";

// ===== Components =====

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-card rounded-lg border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function YieldBar({
  label,
  bps,
  color,
}: {
  label: string;
  bps: number;
  color: string;
}) {
  const pct = Math.min(100, bps / 50); // Scale: 5000bps = 100%
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{bpsToPercent(bps)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ProofCard({ proof }: { proof: RebalanceProof }) {
  const directionColor =
    proof.action === "to_cetus"
      ? "text-blue-500 bg-blue-500/10"
      : "text-green-500 bg-green-500/10";

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${directionColor}`}>
          {proof.action === "to_cetus" ? "CETUS" : "STABLELAYER"}
        </span>
        <span className="text-xs text-muted-foreground">{timeAgo(proof.timestamp)}</span>
      </div>
      <p className="text-sm text-foreground mb-3">{proof.reason}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Shift: {proof.shiftPct}%</span>
        <span>Cetus: {bpsToPercent(proof.cetusYieldBps)}</span>
        <span>Stable: {bpsToPercent(proof.stablelayerYieldBps)}</span>
      </div>
      <div className="flex gap-2 mt-3">
        {proof.txDigest && (
          <a
            href={`${explorerBase}/tx/${proof.txDigest}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View Tx <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {proof.walrusBlobId && (
          <a
            href={`${WALRUS_AGGREGATOR}/v1/blobs/${proof.walrusBlobId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Walrus Proof <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// Testnet vault ID from E2E test
const VAULT_ID =
  "0x946cd5d3f1ec50c9597c7840bcb590ec3a58ac6e7c535e4a4c9b78037e84df80";
const SUI_TYPE = "0x2::sui::SUI";

function VaultActions({ onSuccess }: { onSuccess: () => void }) {
  const account = useCurrentAccount();
  const { mutate: signAndExecute, isPending } =
    useSignAndExecuteTransaction();
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [status, setStatus] = useState("");

  const handleSubmit = () => {
    if (!account || !amount) return;
    const mist = BigInt(Math.floor(parseFloat(amount) * 1e9));
    if (mist <= 0n) return;

    const tx = new Transaction();

    if (mode === "deposit") {
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(mist)]);
      tx.moveCall({
        target: `${VIBESHIFT_PACKAGE_ID}::vault::deposit`,
        typeArguments: [SUI_TYPE],
        arguments: [tx.object(VAULT_ID), coin],
      });
    } else {
      tx.moveCall({
        target: `${VIBESHIFT_PACKAGE_ID}::vault::withdraw`,
        typeArguments: [SUI_TYPE],
        arguments: [tx.object(VAULT_ID), tx.pure.u64(mist)],
      });
    }

    setStatus("Signing...");
    signAndExecute(
      { transaction: tx as never },
      {
        onSuccess: (result) => {
          setStatus(`Success: ${result.digest.slice(0, 12)}...`);
          setAmount("");
          onSuccess();
        },
        onError: (err) => {
          setStatus(`Error: ${err.message.slice(0, 60)}`);
        },
      },
    );
  };

  if (!account) {
    return (
      <div className="bg-card rounded-lg border border-border p-5">
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Vault className="h-5 w-5" />
          Vault Actions
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect your wallet to deposit or withdraw.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-5">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Vault className="h-5 w-5" />
        Vault Actions
      </h2>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode("deposit")}
          className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
            mode === "deposit"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowDownToLine className="inline h-3.5 w-3.5 mr-1" />
          Deposit
        </button>
        <button
          onClick={() => setMode("withdraw")}
          className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
            mode === "withdraw"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowUpFromLine className="inline h-3.5 w-3.5 mr-1" />
          Withdraw
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">
            {mode === "deposit" ? "Amount (SUI)" : "LP Shares (SUI units)"}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full mt-1 px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground"
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={isPending || !amount}
          className="w-full"
          size="sm"
        >
          {isPending
            ? "Confirming..."
            : mode === "deposit"
              ? "Deposit SUI"
              : "Withdraw SUI"}
        </Button>
        {status && (
          <p className="text-xs text-muted-foreground truncate">{status}</p>
        )}
      </div>
    </div>
  );
}

// ===== Page =====

function Dashboard() {
  const [vault, setVault] = useState<VaultData>(MOCK_VAULT);
  const [pool, setPool] = useState<PoolData>(MOCK_POOL);
  const [proofs] = useState<RebalanceProof[]>(MOCK_PROOFS);
  const [refreshing, setRefreshing] = useState(false);
  const suiClient = useSuiClient();

  const stablelayerYield = 500; // 5% placeholder

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const obj = await suiClient.getObject({
        id: VAULT_ID,
        options: { showContent: true },
      });
      if (obj.data?.content?.dataType === "moveObject") {
        const fields = obj.data.content.fields as Record<string, unknown>;
        const assets = fields.assets as Record<string, unknown> | undefined;
        setVault({
          balance: String(assets?.value ?? fields.assets ?? "0"),
          lpSupply: String(fields.lp_supply ?? "0"),
        });
      }
    } catch {
      // fallback to mock
    }
    setPool(MOCK_POOL);
    setRefreshing(false);
  }, [suiClient]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-foreground">
              <img src="/logo.svg" alt="VibeShift" className="h-10 w-10" />
              VibeShift
            </h1>
            <p className="text-muted-foreground mt-1">
              Yield at the speed of intent
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <a
              href={`${explorerBase}/object/${VIBESHIFT_PACKAGE_ID}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-1" />
                Explorer
              </Button>
            </a>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Vault TVL"
            value={`$${formatAmount(vault.balance, 6)}`}
            sub={`${formatAmount(vault.lpSupply, 6)} LP shares`}
            icon={Vault}
          />
          <StatCard
            label="Cetus Yield"
            value={bpsToPercent(pool.feeRate)}
            sub={`Pool liquidity: ${formatAmount(pool.liquidity, 6)}`}
            icon={TrendingUp}
          />
          <StatCard
            label="Stablelayer Yield"
            value={bpsToPercent(stablelayerYield)}
            sub="Estimated APY"
            icon={Shield}
          />
          <StatCard
            label="Rebalances"
            value={String(proofs.length)}
            sub={proofs.length > 0 ? `Last: ${timeAgo(proofs[0].timestamp)}` : "None yet"}
            icon={ArrowDownUp}
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Yield Comparison */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-card rounded-lg border border-border p-5">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Yield Comparison
              </h2>
              <div className="space-y-4">
                <YieldBar label="Cetus SUI/USDC" bps={pool.feeRate} color="bg-blue-500" />
                <YieldBar label="Stablelayer" bps={stablelayerYield} color="bg-green-500" />
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Differential</span>
                  <span className="font-medium text-foreground">
                    {bpsToPercent(Math.abs(pool.feeRate - stablelayerYield))}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Threshold: {bpsToPercent(200)} | Max shift: 40% TVL
                </p>
              </div>
            </div>

            {/* Deposit/Withdraw */}
            <VaultActions onSuccess={refresh} />

            {/* Contract Info */}
            <div className="bg-card rounded-lg border border-border p-5">
              <h2 className="text-lg font-semibold text-foreground mb-3">Contract</h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network</span>
                  <span className="font-mono text-foreground">{NETWORK}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package</span>
                  <a
                    href={`${explorerBase}/object/${VIBESHIFT_PACKAGE_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-primary hover:underline"
                  >
                    {VIBESHIFT_PACKAGE_ID.slice(0, 8)}...{VIBESHIFT_PACKAGE_ID.slice(-6)}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Rebalance History */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <ArrowDownUp className="h-5 w-5" />
              Rebalance History (Proof of Vibe)
            </h2>
            {proofs.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
                No rebalances yet. The Sentinel is monitoring yields...
              </div>
            ) : (
              <div className="space-y-3">
                {proofs.map((proof, i) => (
                  <ProofCard key={i} proof={proof} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: Dashboard,
});
