# VibeShift

*Yield at the speed of intent.*

The first **Self-Sustaining Yield Engine** on Sui. An autonomous liquidity orchestrator that shifts stablecoin assets between **Stablelayer** and **Cetus** based on agentic market analysis — with flash-loan capital efficiency, encrypted strategy proofs, and gas autonomy. Built with Move 2026, powered by an AI agent.

Traditional DeFi vaults move capital in two transactions: withdraw from protocol A, then deposit into protocol B. Funds sit idle between steps ("yield drag"). VibeShift eliminates this with a **hot-potato flash loan** pattern: borrow, deploy, and repay in a single atomic Programmable Transaction Block. If repayment fails, the entire PTB reverts — making vault drain mathematically impossible at the Move VM level.

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

4. **Flash-Shift** - Hot-potato flash loans built directly into the vault. The agent borrows funds via `request_flash_shift`, deploys them into DeFi protocols, and repays via `complete_flash_shift` — all in a single atomic PTB. The `FlashReceipt` struct has **no abilities** (no `store`, `drop`, or `copy`), so the Move VM enforces that every borrow is repaid within the same transaction. If repayment falls short, the entire PTB reverts. Zero yield drag, zero risk.
5. **Verifiable Intent** - Walrus Seal encrypts strategy reasoning to prevent copy-trading while keeping proofs 100% auditable
6. **The Eternal Agent** - Self-sustaining gas: the agent auto-swaps yield (never principal) for SUI, creating a perpetual motion vault

### Flash-Shift: How It Works

```
Single Programmable Transaction Block (PTB):
┌──────────────────────────────────────────────────┐
│ 1. request_flash_shift(vault, 10000)             │
│    → Returns: Coin<USDC> + FlashReceipt          │
│                                                   │
│ 2. [DeFi operations with borrowed coin]           │
│    → Cetus swap, Stablelayer mint, DeepBook arb   │
│                                                   │
│ 3. complete_flash_shift(vault, coin, receipt)     │
│    → Asserts: repayment >= borrowed amount        │
│    → Consumes hot-potato receipt (no abilities)   │
└──────────────────────────────────────────────────┘
        If step 3 fails → entire PTB reverts
        FlashReceipt cannot be stored or dropped
```

The `FlashReceipt` is a **hot-potato** struct with no Move abilities — it cannot be stored, copied, or dropped. The only way to consume it is by calling `complete_flash_shift` with sufficient repayment. This is enforced by the Move VM itself, not by runtime checks.

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
│   │   ├── deepbook.ts             # Flash-shift PTB builder + capacity query
│   │   ├── gas-autonomy.ts         # Agent gas balance check + skim yield
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
