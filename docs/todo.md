# VibeShift

**Tagline:** *Yield at the speed of intent.*

A fully autonomous liquidity orchestrator on Sui that "shifts" stablecoin assets between **Stablelayer** and **Cetus** based on agentic market analysis.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  VibeShift                       │
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌─────────────┐ │
│  │ Sentinel │──▶│FluxVault │──▶│ Proof of    │ │
│  │ (Agent)  │   │ (Move)   │   │ Vibe (Walrus)│ │
│  └──────────┘   └──────────┘   └─────────────┘ │
│       │              │                           │
│       ▼              ▼                           │
│  ┌──────────┐   ┌──────────┐                    │
│  │ OpenClaw │   │Stablelayer│                    │
│  │  Skill   │   │ + Cetus  │                    │
│  └──────────┘   └──────────┘                    │
└─────────────────────────────────────────────────┘
```

### Core Components

1. **The Sentinel (Agent)** - OpenClaw skill that monitors SUI/USDC on Cetus and stability fees on Stablelayer
2. **The Flux Vault** - Move 2026 contract handling atomic swaps and liquidity provision
3. **Proof of Vibe** - On-chain reasoning proofs (via Walrus) explaining each rebalance decision

---

## Day 1: Smart Contract Foundation

### Move Contract (`vault.move`)

- [x] Set up Move 2026 project structure with `sui move new vibeshift`
- [x] Implement `Vault<T>` shared object with `Balance<T>` and `lp_supply`
- [x] Implement `AgentCap` capability object for AI agent authorization
- [x] Implement `AdminCap` capability object for vault management
- [x] Write `init` function - transfers `AgentCap` + `AdminCap` to deployer
- [x] Write `create_vault<T>` entry function - creates and shares a new vault
- [x] Write `deposit<T>` entry function - accepts stablecoins, updates LP supply
- [x] Write `withdraw<T>` entry function - burns LP shares, returns proportional stablecoins
- [x] Write `rebalance_to_protocol<T>` entry function - restricted to `AgentCap` holder
- [x] Write `receive_from_protocol<T>` entry function - receives funds back after rebalance
- [x] Add event emissions for all state changes (`DepositEvent`, `WithdrawEvent`, `RebalanceEvent`)
- [x] Write unit tests for deposit/withdraw/rebalance flows (13/13 passing)
- [x] Publish to Sui testnet
  - Package ID: `0x32796493ed4858dc9e2600bfb9b6c290f0ecc468b1e9a7531b69571ebffd8c08`
  - AdminCap: `0x70b124576d8ce15e5ac3aabf3bce0dfe79f3696b02276fb27a0a10bc4fd5c4e3`
  - AgentCap: `0xde5d8c1b8247d89ae4179c38255bdff3c38a3d5e7a641330fb574d7b94857926`
  - Tx: `GmkW4Hw7r8Wd3ca62M6otBFjp1v684pEXjvYwQ67v3Zw`

### Proof of Vibe

- [x] Define `ReasoningProof` struct (timestamp, action, rationale, metrics)
- [x] Write `store_proof` function to emit reasoning proofs on-chain (uses `Clock` for timestamp)
- [x] `WalrusProofStored` event + `store_walrus_proof` function for off-chain Walrus blob ID linking

---

## Day 2: Protocol Integration Logic

### Stablelayer SDK Integration (`src/lib/stablelayer.ts`)

Uses [`stable-layer-sdk`](https://github.com/StableLayer/stable-layer-sdk) for minting/burning stablecoins.

- [x] Install dependencies: `stable-layer-sdk @mysten/sui @mysten/bcs @mysten/walrus`
- [x] Initialize `StableLayerClient` with singleton pattern and network config
- [x] Implement mint flow: `buildMint()` - deposit USDC to mint stablecoins
- [x] Implement burn flow: `buildBurn()` / `buildBurnAll()` - burn stablecoins to redeem USDC
- [x] Implement claim flow: `buildClaim()` - claim yield farming rewards
- [x] Add `getTotalSupply` / `getTotalSupplyByCoinType` queries for monitoring
- [x] Wire up transaction signing with `SuiClient.signAndExecuteTransaction`

### Cetus SDK Integration (`src/lib/cetus.ts`)

Uses [`@cetusprotocol/cetus-sui-clmm-sdk`](https://github.com/CetusProtocol/cetus-clmm-sui-sdk) for swaps and liquidity.

- [x] Install: `@cetusprotocol/cetus-sui-clmm-sdk@5.4.0`
- [x] Initialize Cetus SDK singleton: `initCetusSDK({ network })`
- [x] Implement swap logic for SUI/USDC pair
  - [x] Fetch pool via `getPool(poolAddress)`
  - [x] Pre-calculate swap with `preswap()`
  - [x] Apply slippage tolerance with `adjustForSlippage()`
  - [x] Execute via `buildSwapTx()`
- [x] Implement add liquidity flow
  - [x] Calculate tick range from current pool state
  - [x] Estimate liquidity via `ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts()`
  - [x] Create position via `buildAddLiquidityTx()`
- [x] Implement remove liquidity flow via `buildRemoveLiquidityTx()`
- [x] Add yield monitoring via `getPoolStats()` and `getPositions()`

### Vault Client (`src/lib/vault.ts`)

- [x] `buildCreateVaultTx` / `buildDepositTx` / `buildWithdrawTx`
- [x] `buildRebalanceTx` / `buildReceiveFromProtocolTx`
- [x] `buildStoreProofTx` / `buildStoreWalrusProofTx`
- [x] `buildTransferAgentCapTx`
- [x] `getVaultState()` read helper

### Rebalance Orchestrator (`src/lib/rebalance.ts`)

- [x] Create `RebalanceEngine` class that coordinates vault <-> Stablelayer <-> Cetus
- [x] Implement strategy logic: `analyze()` compares Cetus LP yield vs Stablelayer yield
- [x] Build atomic transaction batches (rebalance + store_proof in one PTB)
- [x] Add safety checks: max 40% shift, min TVL threshold, 1hr cooldown, yield threshold 200bps
- [x] Walrus proof upload: `storeWalrusProof()` uploads detailed JSON to Walrus publisher
- [x] `tick()` method for one-shot analyze + execute cycle

### Config (`src/lib/constants.ts`)

- [x] All deployed contract IDs, coin types, pool addresses, network config, strategy defaults

---

## Day 3: AI Agent (The Sentinel)

### OpenClaw Skill (`skills/vibeshift-sentinel/`)

- [x] Create skill directory structure (`SKILL.md`, `sentinel.py`, `requirements.txt`)
- [x] Write `SKILL.md` with skill metadata, env requirements, and trigger docs
- [x] Implement `sentinel.py`:
  - [x] `get_cetus_pool_stats()` - Monitor SUI/USDC pool via Sui RPC
  - [x] `get_vault_state()` - Monitor vault balance and LP supply
  - [x] `get_stablelayer_yield_bps()` - Estimate Stablelayer yield
  - [x] `analyze()` - Calculate optimal allocation, generate ShiftAction
  - [x] `upload_walrus_proof()` - Store reasoning proof on Walrus
- [x] Configurable thresholds via env vars:
  - `YIELD_THRESHOLD_BPS=200` (2% spread)
  - `COOLDOWN_SECONDS=3600` (1 hour)
  - `MAX_SHIFT_PCT=40` (40% TVL)
- [x] CLI modes: `python sentinel.py status|once|loop [interval]`

---

## Final Hours: Deploy & Demo

### Testnet Deployment

- [x] Deploy `vibeshift.move` to Sui testnet (Package: `0x3279...8c08`)
- [x] Verify contract on Sui Explorer - package, AgentCap, AdminCap all confirmed
- [x] Fund test wallet with testnet SUI (0.97 SUI via faucet)
- [x] Run end-to-end flow:
  - [x] `create_vault<SUI>` -> Vault `0x946c...df80` (shared object)
  - [x] `deposit` 0.1 SUI -> assets: 100M MIST, lp_supply: 100M
  - [x] `rebalance_to_protocol` 40% (40M MIST) "to_cetus" -> assets: 60M MIST
  - [x] `withdraw` all LP -> assets: 0, lp_supply: 0, user receives 60M MIST

### Frontend (Dashboard)

- [x] Build dashboard page (`src/routes/index.tsx`) showing:
  - [x] Vault TVL stat card with LP share count
  - [x] Cetus yield and Stablelayer yield stat cards
  - [x] Yield comparison bars with differential and threshold display
  - [x] Rebalance history with Proof of Vibe cards
  - [x] Links to Sui Explorer and Walrus proofs
- [x] About page (`src/routes/about.tsx`) with architecture, tech stack, track qualification
- [x] Updated nav to VibeShift branding
- [x] Connect wallet (Sui Wallet adapter) - `@mysten/dapp-kit` WalletProvider + ConnectButton in nav
- [x] Deposit/withdraw UI for the vault - VaultActions component with deposit/withdraw toggle

---

## Advanced Features: Machine-Native Efficiency ("God-Tier" Enhancements)

### 1. Flash-Shift (Capital Efficiency via Hot-Potato Pattern)

Use Move's hot-potato pattern for zero-drag capital rebalancing. `FlashReceipt` has **no abilities** — the Move VM enforces repayment at the type-system level, making vault drain mathematically impossible.

#### Contract (`vault.move` — Flash-Orchestrator)

- [x] Implement `FlashReceipt` hot-potato struct (`amount`, `vault_id`) — zero abilities
- [x] Write `request_flash_shift` — AgentCap-gated, issues `FlashReceipt`
- [x] Write `complete_flash_shift` — consumes `FlashReceipt`, asserts repayment >= borrowed amount
- [x] Integrate DeepBook V3 `FlashLoan` borrow/repay within atomic PTB
- [x] Add `FlashShiftEvent` emission (amount, protocol, receipt_id)
- [x] Write unit tests for flash-shift happy path and repayment failure

#### SDK (`src/lib/deepbook.ts`)

- [x] Install `@deepbook/sdk` or use DeepBook V3 move calls directly
- [x] Implement `buildFlashShiftTx()` — atomic PTB: borrow -> deposit to Cetus -> redeem from Stablelayer -> repay
- [x] Add flash loan pool discovery and available liquidity check

### 1b. DeepBook V3 "Liquidity Injection" (Overflow Capital)

When a yield spike requires *more* capital than the vault currently holds, combine Flash-Shift with a DeepBook V3 flash loan for extra liquidity — all in one atomic PTB.

#### Contract

- [ ] Add `request_deepbook_flash_loan` helper that wraps DeepBook V3 borrow into the Flash-Shift PTB
- [ ] Ensure DeepBook repayment is enforced within the same PTB alongside vault `FlashReceipt`

#### SDK (`src/lib/deepbook.ts`)

- [ ] Implement `buildFlashShiftWithDeepBookTx()` — compound PTB: vault flash-shift + DeepBook flash loan -> deploy combined capital -> repay both
- [ ] Add `getDeepBookFlashLoanCapacity()` — query available DeepBook V3 liquidity

#### Agent (`sentinel.py`)

- [ ] Add logic: if optimal shift amount > vault balance, calculate DeepBook supplement needed
- [ ] Log "Liquidity Injection" events with both vault and DeepBook amounts

### 2. Verifiable Intent — "Strategy Black-Box" (Walrus + Seal Encrypted Proofs)

In 2026, "Strategy Leakage" is a real concern — if the agent is good, copy-trading bots will front-run it. Use **Walrus Seal** to encrypt the agent's reasoning while keeping proofs 100% auditable.

The Agent uploads raw metrics (Cetus depth, Stablelayer fee history) to Walrus as an encrypted blob. Only the **Blob ID** and a **Zk-Proof of Intent** go on-chain. This satisfies the **Safety Track** by protecting the user's "Financial Alpha" from being stolen by other agents.

#### Contract

- [x] Add `EncryptedProofStored` event with `walrus_blob_id` and `seal_policy_id`
- [x] Write `store_encrypted_proof` function — stores encrypted blob reference on-chain

#### SDK (`src/lib/walrus-seal.ts`)

- [x] Implement `encryptAndUploadProof()` — encrypts strategy blob (pool state, confidence score, shift params) with AES-256-GCM + HKDF
- [x] Implement `decryptProof()` — authorized users/auditors can decrypt and verify
- [x] Update `RebalanceEngine` to use encrypted proofs by default

#### Agent (`sentinel.py`)

- [x] Add `encrypt_strategy_blob()` — encrypt reasoning + pool state snapshot
- [x] Update `upload_walrus_proof()` to use Seal encryption
- [x] Add `decrypt` CLI command for auditor proof verification

### 3. The Eternal Agent (Gas Autonomy + Cetus Aggregator Refuel)

Self-sustaining gas: the agent auto-swaps a fraction of *yield* (never principal) for SUI when its balance drops below threshold. The vault becomes a perpetual motion machine — a truly "God Mode" agent that never needs a human to top up its wallet.

#### Contract (`vault.move`)

- [x] Add error codes (`ENoYield`, `ESkimExceedsLimit`) and `GAS_SKIM_BPS` constant
- [x] Write `skim_yield_for_gas` — AgentCap-gated, caps at 0.5% of yield, never touches principal
- [x] Add `GasRefuelEvent` emission (yield_skimmed, vault_yield, total_assets_after)

#### SDK (`src/lib/gas-autonomy.ts`)

- [x] Implement `checkAgentGasBalance()` — query agent address SUI balance
- [x] Implement `buildSkimYieldForGasTx()` — build skim yield transaction
- [x] Implement `shouldRefuel()` — check if SUI balance below threshold

#### Cetus Aggregator Refueler (`src/lib/refuel.ts`)

- [ ] Implement `buildRefuelPTB()` — atomic PTB: skim yield from vault -> Cetus Aggregator swap (USDC->SUI) -> transfer SUI to agent wallet
- [ ] Use `@cetusprotocol/aggregator` `findRouters()` for best USDC->SUI route
- [ ] Use `routerSwap()` to execute multi-hop swap within the PTB
- [ ] Configure slippage tolerance (default 1%)

#### Agent (`sentinel.py`)

- [x] Add `check_gas_balance()` — query agent SUI balance via RPC
- [x] Implement `refuel()` — check yield, log refuel recommendation (execution delegated to TS)
- [x] Add gas check at start of every `run_loop()` cycle + `gas` CLI command
- [ ] Add 0.5 SUI threshold trigger for autonomous refuel
- [ ] Log refuel events with before/after balances

---

## Submission Prep (Vibe Sui Spring Fest 2026 — Due Feb 11)

### AI Disclosure

- [ ] Create `AI_DISCLOSURE.md` in repo root
  - Architecture designed by Gemini (v2026)
  - Move boilerplate generated via Sui Stack Claude Plugin
  - Refactoring and implementation by [Your Name]

### Pre-Submit Checklist

- [x] **Move 2026 Syntax** — Uses `public struct` (old `struct` is instant DQ)
- [x] **Open Source** — GitHub repo is public with `README.md` and deployment instructions
- [x] **Stablelayer/Cetus** — Code calls their SDKs (imports in `package.json`)
- [ ] **AI Disclosure** — `AI_DISCLOSURE.md` created and linked in README
- [ ] **Live Demo** — Video shows the Agent making a decision (the "Vibe" comes from seeing AI think)
- [ ] **Yield Drag Counter** — Demo shows "Saved X% via Atomic Flash-Shift" metric
- [ ] **PTB Flow Diagram** — Visual in README and flash-shift docs (judges skim text but look at diagrams)

### Demo Enhancements

- [ ] Record demo video showing:
  - [ ] Agent detecting yield differential
  - [ ] Autonomous rebalance transaction (Flash-Shift in one PTB)
  - [ ] Reasoning proof appearing on-chain (encrypted via Walrus Seal)
  - [ ] Dashboard updating in real-time
  - [ ] "Yield Drag Saved" live counter
  - [ ] Agent gas self-refuel in action
- [ ] Write submission description highlighting:
  - Move 2026 compliance (`public struct`, `mut` syntax)
  - Agent-centric design (`AgentCap` + hot-potato `FlashReceipt`)
  - Triple-track qualification (Stablelayer + Safety + Move 2026)
  - Machine-native architecture: Flash-Shift + Autonomous Refuel = first self-sustaining financial organism on Sui

---

## Track Qualification

| Track | Qualification |
|-------|--------------|
| **Stablelayer Track** | Holds and manages $USD-Sui stablecoins via Stablelayer SDK (mint, burn, claim); uses Stablelayer as the "Base Stability" layer |
| **Safety Track** | `AgentCap`-gated fund movement; `FlashReceipt` hot-potato makes vault drain *mathematically impossible* at the Move VM level; Walrus Seal encrypts strategy to prevent copy-trading |
| **Move 2026** | Uses `public struct`, `mut`, hot-potato receipt pattern, and modern Move syntax throughout |

---

## Dependencies

```json
{
  "stable-layer-sdk": "latest",
  "@mysten/sui": "latest",
  "@mysten/bcs": "latest",
  "@mysten/walrus": "latest",
  "@cetusprotocol/cetus-sui-clmm-sdk": "latest",
  "@cetusprotocol/aggregator": "latest"
}
```

## Resources

- [Stablelayer SDK Docs](./stablelayersdk.md)
- [Cetus Developer Docs](https://cetus-1.gitbook.io/cetus-developer-docs)
- [DeepBook V3 Docs](https://docs.deepbook.tech/)
- [OpenClaw Skills Docs](https://docs.openclaw.ai/tools/skills)
- [Sui Move 2026 Migration Guide](https://docs.sui.io/concepts/sui-move-concepts/packages/custom-policies)
- [Walrus Storage](https://docs.walrus.site/)
- [Walrus Seal](https://docs.walrus.site/walrus-sites/seal.html)
- [Cetus Aggregator SDK](https://github.com/CetusProtocol/cetus-aggregator)
