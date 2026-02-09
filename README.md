# VibeShift

*Yield at the speed of intent.*

An autonomous liquidity orchestrator on **Sui** that shifts stablecoin assets between **Stablelayer** and **Cetus** based on agentic market analysis. Built with Move 2026, powered by an AI agent.

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
   ┌────┴────┐     ┌────┴────┐
   │Stablelayer│   │  Cetus  │
   │ (Mint)  │     │ (Swap)  │
   └─────────┘     └─────────┘
```

1. **Flux Vault** - Move 2024 contract that holds user deposits and manages LP shares
2. **The Sentinel** - OpenClaw AI agent that monitors yields across Stablelayer and Cetus, then triggers rebalances
3. **Proof of Vibe** - Every rebalance generates an on-chain reasoning proof explaining *why* the shift happened

## Tech Stack

- **Smart Contract:** Move 2024 on Sui (`public struct`, `mut` syntax)
- **Frontend:** React 19, Vite, TanStack Router, TailwindCSS v4, shadcn/ui
- **Stablelayer:** [`stable-layer-sdk`](https://github.com/StableLayer/stable-layer-sdk) - Mint/burn stablecoins, claim yield rewards
- **Cetus:** [`@cetusprotocol/cetus-sui-clmm-sdk`](https://github.com/CetusProtocol/cetus-clmm-sui-sdk) - Swap and LP on Sui's leading DEX
- **Agent:** OpenClaw skill (Python) - Autonomous market monitoring and rebalance triggering
- **Storage:** Walrus for off-chain reasoning proof archival

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
bun install stable-layer-sdk @mysten/sui @mysten/bcs @cetusprotocol/cetus-sui-clmm-sdk
```

Start the dev server:

```bash
bun run dev
```

### Deploy the Contract

```bash
cd contracts
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
│           └── vault.move        # Flux Vault - Move 2024 contract
├── skills/
│   └── vibeshift-sentinel/
│       ├── SKILL.md              # OpenClaw skill definition
│       └── sentinel.py           # AI agent logic
├── docs/
│   ├── todo.md                   # 72-hour build plan
│   └── stablelayersdk.md         # Stablelayer SDK reference
├── src/
│   ├── components/
│   │   └── ui/                   # shadcn/ui components
│   ├── lib/
│   │   └── utils.ts              # Utility functions
│   ├── pages/                    # Page components
│   ├── routes/                   # TanStack Router file-based routes
│   │   ├── __root.tsx            # Root route
│   │   └── index.tsx             # Home / Dashboard
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
```

## Track Qualification

| Track | How |
|-------|-----|
| **Stablelayer** | Manages $USD-Sui stablecoins via Stablelayer SDK (mint, burn, claim) |
| **Safety** | Only `AgentCap` holder can trigger rebalances - permissioned fund movement |
| **Move 2024** | Uses `public struct`, `mut`, and modern Move syntax throughout |

## License

MIT
