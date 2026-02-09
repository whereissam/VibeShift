import { createFileRoute } from "@tanstack/react-router";
import { Shield, Cpu, ArrowDownUp, Database, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: () => (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            About VibeShift
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            An autonomous liquidity orchestrator on Sui that shifts stablecoin
            assets between Stablelayer and Cetus based on agentic market
            analysis.
          </p>
        </div>

        {/* Architecture */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="bg-card rounded-lg border border-border p-8">
            <div className="flex items-center mb-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg mr-3">
                <Cpu className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                The Sentinel
              </h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              An OpenClaw AI agent that continuously monitors yields across Cetus
              DEX and Stablelayer protocol. When it detects a profitable
              differential, it triggers an autonomous rebalance.
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-8">
            <div className="flex items-center mb-4">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg mr-3">
                <ArrowDownUp className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                Flux Vault
              </h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              A Move 2024 smart contract that holds user deposits, issues LP
              shares, and enables permissioned rebalancing. Only the AgentCap
              holder can move funds between protocols.
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-8">
            <div className="flex items-center mb-4">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg mr-3">
                <Database className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                Proof of Vibe
              </h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Every rebalance generates a reasoning proof stored on-chain and
              archived on Walrus. This creates a verifiable audit trail
              explaining <em>why</em> each shift happened.
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-8">
            <div className="flex items-center mb-4">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg mr-3">
                <Shield className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                Safety First
              </h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              The AgentCap capability pattern ensures only authorized agents can
              move funds. Built-in safeguards include max shift limits, cooldown
              periods, and minimum TVL thresholds.
            </p>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="bg-card rounded-lg border border-border p-8 mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-6 text-center">
            Tech Stack
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              ["Smart Contract", "Move 2024 on Sui"],
              ["Frontend", "React 19, Vite, TanStack Router, TailwindCSS v4"],
              ["Stablelayer", "stable-layer-sdk - Mint/burn stablecoins"],
              ["Cetus", "@cetusprotocol/cetus-sui-clmm-sdk - Swap & LP"],
              ["Agent", "OpenClaw skill (Python) - Autonomous monitoring"],
              ["Storage", "Walrus - Off-chain proof archival"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                <div>
                  <span className="font-medium text-foreground">{label}</span>
                  <p className="text-sm text-muted-foreground">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Track Qualification */}
        <div className="bg-card rounded-lg border border-border p-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6 text-center">
            Track Qualification
          </h2>
          <div className="space-y-4">
            {[
              [
                "Stablelayer Track",
                "Manages stablecoins via Stablelayer SDK (mint, burn, claim)",
              ],
              [
                "Safety Track",
                "Only AgentCap holder can trigger rebalances - permissioned fund movement",
              ],
              [
                "Move 2024",
                "Uses public struct, mut, and modern Move syntax throughout",
              ],
            ].map(([track, desc]) => (
              <div
                key={track}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
              >
                <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-foreground">{track}</span>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Links */}
        <div className="flex justify-center gap-4 mt-12">
          <a
            href="https://github.com/StableLayer/stable-layer-sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            Stablelayer SDK <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://github.com/CetusProtocol/cetus-clmm-sui-sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            Cetus SDK <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://docs.walrus.site/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            Walrus Docs <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  ),
});
