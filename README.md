# VibeShift

*Yield at the speed of intent.*

The first **Self-Sustaining Yield Engine** on Sui. An autonomous liquidity orchestrator that shifts stablecoin assets between **Stablelayer** and **Cetus** based on agentic market analysis — with flash-loan capital efficiency, encrypted strategy proofs, and gas autonomy. Built with Move 2026, powered by an AI agent.

## How It Works

```
User deposits USDC
        │
        ▼
   ┌─────────┐     ┌────────────┐     ┌──────────┐
   │  Flux   │◀───▶│  Sentinel  │────▶│ Proof of │
   │  Vault  │     │  (Agent)   │     │   Vibe   │
   └────┬────┘     └────────────┘     └──────────┘
        │               │
   ┌────┴────┐     ┌────┴────┐     ┌────────────┐
   │Stablelayer│   │  Cetus  │     │ DeepBook V3│
   │ (Mint)  │     │ (Swap)  │     │(Flash Loan)│
   └─────────┘     └─────────┘     └────────────┘
```

### Core Components

1. **Flux Vault** - Move 2026 contract that holds user deposits and manages LP shares
2. **The Sentinel** - OpenClaw AI agent that monitors yields across Stablelayer and Cetus, then triggers rebalances
3. **Proof of Vibe** - Every rebalance generates an on-chain reasoning proof explaining *why* the shift happened

### Advanced Features

4. **Flash-Shift** - DeepBook V3 flash loans enable zero-drag capital movement between protocols in a single atomic PTB
5. **Verifiable Intent** - Walrus Seal encrypts strategy reasoning to prevent copy-trading while keeping proofs 100% auditable
6. **The Eternal Agent** - Self-sustaining gas: the agent auto-swaps yield (never principal) for SUI, creating a perpetual motion vault

## Tech Stack

- **Smart Contract:** Move 2026 on Sui (`public struct`, `mut` syntax, hot-potato `FlashReceipt` pattern)
- **Frontend:** React 19, Vite, TanStack Router, TailwindCSS v4, shadcn/ui, `@mysten/dapp-kit`
- **Stablelayer:** [`stable-layer-sdk`](https://github.com/StableLayer/stable-layer-sdk) - Mint/burn stablecoins, claim yield rewards
- **Cetus:** [`@cetusprotocol/cetus-sui-clmm-sdk`](https://github.com/CetusProtocol/cetus-clmm-sui-sdk) - Swap and LP on Sui's leading DEX
- **DeepBook V3:** Flash loans for zero-drag capital rebalancing
- **Cetus Aggregator:** [`@cetusprotocol/aggregator`](https://github.com/CetusProtocol) - Multi-hop swaps for yield-to-gas conversion
- **Agent:** OpenClaw skill (Python) - Autonomous market monitoring, rebalance triggering, gas self-refueling
- **Storage:** Walrus + Walrus Seal for encrypted off-chain reasoning proof archival

## Getting Started

### Prerequisites

- Node.js 20.19.0+ or 22.12.0+
- Sui CLI (`sui` command)
- Python 3.10+ (for the agent)

### Installation

```bash
git clone <repository-url>
cd vibeshift
```

Install frontend dependencies:

```bash
bun install
```

Install protocol SDKs:

```bash
bun install stable-layer-sdk @mysten/sui @mysten/bcs @mysten/walrus @cetusprotocol/cetus-sui-clmm-sdk @cetusprotocol/aggregator
```

Start the dev server:

```bash
bun run dev
```

### Deploy the Contract

```bash
cd contracts/vibeshift
sui move build
sui client publish --gas-budget 100000000
```

## Available Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run lint` - Run ESLint

## Project Structure

```
├── contracts/
│   └── vibeshift/
│       └── sources/
│           └── vault.move          # Flux Vault + Flash-Orchestrator (Move 2026)
├── skills/
│   └── vibeshift-sentinel/
│       ├── SKILL.md                # OpenClaw skill definition
│       └── sentinel.py             # AI agent (monitoring + gas autonomy)
├── docs/
│   ├── todo.md                     # Build plan + advanced feature roadmap
│   └── stablelayersdk.md           # Stablelayer SDK reference
├── src/
│   ├── components/
│   │   └── ui/                     # shadcn/ui components
│   ├── lib/
│   │   ├── cetus.ts                # Cetus SDK integration
│   │   ├── stablelayer.ts          # Stablelayer SDK integration
│   │   ├── vault.ts                # Vault client (PTB builders)
│   │   ├── rebalance.ts            # Rebalance orchestrator
│   │   ├── constants.ts            # Deployed contract IDs + config
│   │   └── utils.ts                # Utility functions
│   ├── routes/
│   │   ├── __root.tsx              # Root layout (wallet + balance)
│   │   ├── index.tsx               # Dashboard (TVL, yields, deposit/withdraw)
│   │   └── about.tsx               # Architecture + track qualification
│   ├── main.tsx                    # App entry (SuiClientProvider + WalletProvider)
│   └── index.css
```

## Track Qualification

| Track | How |
|-------|-----|
| **Stablelayer** | Manages $USD-Sui stablecoins via Stablelayer SDK (mint, burn, claim); uses Stablelayer as the "Base Stability" layer for yield maximization |
| **Safety** | `AgentCap`-gated fund movement; `FlashReceipt` hot-potato pattern makes vault drain mathematically impossible — if repayment fails, the entire PTB reverts |
| **Move 2026** | Uses `public struct`, `mut`, modern Move syntax, and hot-potato receipt pattern throughout |

## License

MIT
