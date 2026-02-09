# Flash-Shift: Capital Efficiency via Hot-Potato Flash Loans

*Zero yield drag. VM-level safety. One atomic transaction.*

---

## The 30-Second Elevator Pitch

> "DeFi vaults lose money every time they move capital — funds sit idle between transactions. VibeShift eliminates this with a **hot-potato flash loan** baked directly into the Move contract. An AI agent borrows, deploys to Cetus or Stablelayer, and repays in **one atomic transaction**. If repayment fails, the Move VM itself reverts everything. It's not a runtime check — it's a compile-time guarantee that the vault can never be drained."

---

## The Problem: Yield Drag

Traditional vault rebalancing is a **two-step** process:

```
TX 1: Withdraw $10k from Stablelayer      <-- funds idle here
        ... wait for block ...
TX 2: Deposit $10k into Cetus LP          <-- yield starts here
```

Between TX 1 and TX 2, your capital earns **zero yield**. On a volatile day when Cetus APY spikes to 15%, you miss it entirely while waiting for Stablelayer to clear. This is "yield drag."

---

## The Solution: Hot-Potato Flash Loans

VibeShift solves this with Move's **hot-potato pattern**. The key is this struct in `vault.move`:

```move
public struct FlashReceipt {   // <-- NO abilities: no store, drop, copy
    vault_id: ID,
    amount: u64,
}
```

Because `FlashReceipt` has **zero abilities**, the Move VM enforces:

- It **cannot be stored** — must be consumed in the same transaction
- It **cannot be dropped** — must be explicitly destructured
- It **cannot be copied** — only one exists

The only way to destroy it is `complete_flash_shift`, which asserts `repayment >= borrowed`. This gives you **compile-time safety** — not a check that might be bypassed, but a VM-level guarantee.

---

## The Atomic PTB Flow

Everything happens in a single Sui Programmable Transaction Block:

```
+--- One PTB (atomic) --------------------------------------+
|                                                            |
|  1. request_flash_shift(vault, $10k)                       |
|     -> Agent gets Coin<USDC> + FlashReceipt                |
|                                                            |
|  2. Cetus swap / Stablelayer mint / DeepBook arb           |
|     -> Use the borrowed coin in DeFi protocols             |
|                                                            |
|  3. complete_flash_shift(vault, coin, receipt)              |
|     -> Repay >= $10k, receipt consumed, done               |
|                                                            |
+------------------------------------------------------------+
     If ANY step fails -> entire PTB reverts
     Capital was never idle. Zero yield drag.
```

### Step-by-step:

1. **`request_flash_shift`** (AgentCap-gated) — Splits `amount` from the vault's balance and returns a `Coin<T>` plus a `FlashReceipt`. The vault balance drops temporarily.

2. **DeFi operations** — The agent uses the borrowed coin for protocol operations: Cetus LP, Stablelayer mint, DeepBook arbitrage, or any combination. These are additional `moveCall` steps inserted into the same PTB.

3. **`complete_flash_shift`** — Takes the repayment coin and the receipt. Asserts `coin::value(&payment) >= receipt.amount`. Joins payment back into the vault. Destructures the receipt (consuming the hot-potato). Emits `FlashShiftEvent`.

---

## Contract Architecture

### Error Codes

```move
const EFlashLoanNotRepaid: u64 = 7;   // repayment < borrowed
const EFlashVaultMismatch: u64 = 8;   // receipt vault_id != vault
```

### Event

```move
public struct FlashShiftEvent has copy, drop {
    vault_id: ID,
    agent: address,
    amount: u64,          // borrowed
    repaid: u64,          // actual repayment (>= amount)
    protocol: vector<u8>, // "to_cetus", "to_stablelayer", etc.
    total_assets_after: u64,
}
```

### Access Control

- `request_flash_shift` requires `&AgentCap` — only the authorized AI agent can initiate
- `complete_flash_shift` is public (anyone can repay) but requires the `FlashReceipt` which only `request_flash_shift` creates

---

## TypeScript SDK (`src/lib/deepbook.ts`)

```typescript
// Build an atomic flash-shift PTB
buildFlashShiftTx(vaultId, coinType, amount, protocol): Transaction

// Query max flash-shiftable amount (vault balance)
getFlashShiftCapacity(vaultId): Promise<bigint>
```

The `buildFlashShiftTx` constructs a PTB where:
1. `request_flash_shift` returns coin + receipt as transaction results
2. `complete_flash_shift` consumes receipt with repayment
3. Callers can extend the PTB to insert protocol operations between steps 1 and 2

---

## DeepBook V3 "Liquidity Injection"

When a yield spike requires *more* capital than the vault holds, Flash-Shift combines with a **DeepBook V3 flash loan** for extra liquidity — all in one atomic PTB.

```
+--- Compound PTB (atomic) ---------------------------------+
|                                                            |
|  1. request_flash_shift(vault, $10k)                       |
|     -> Vault Coin<USDC> + FlashReceipt                    |
|                                                            |
|  2. deepbook::flash_loan($5k)                              |
|     -> DeepBook Coin<USDC> + DeepBook FlashReceipt        |
|                                                            |
|  3. Merge coins -> $15k deployed to Cetus LP               |
|     -> Combined capital captures the full yield spike      |
|                                                            |
|  4. Redeem from Cetus -> split repayments                  |
|     -> Repay DeepBook $5k (+ fee)                          |
|     -> complete_flash_shift(vault, $10k, receipt)          |
|                                                            |
+------------------------------------------------------------+
     Both flash receipts consumed. Both protocols made whole.
     The vault captured yield on $15k instead of $10k.
```

This demonstrates orchestrating **multiple flash loans from different protocols** in a single atomic block — a Move-native pattern that has no equivalent on EVM.

---

## How It Differs from Aave/DeFi Flash Loans

| | Aave Flash Loans | VibeShift Flash-Shift |
|---|---|---|
| **Where** | External lending pool | Built into the vault itself |
| **Safety mechanism** | Runtime callback check | Move VM hot-potato (no abilities) |
| **Fee** | 0.05-0.09% | 0% (it's your own vault) |
| **Who can use** | Anyone | AgentCap-gated (only AI agent) |
| **Purpose** | Arbitrage/liquidation | Zero-drag yield rebalancing |
| **Composability** | Single protocol | Stacks with DeepBook V3 flash loans in one PTB |

---

## Safety Argument

**"What if the agent is malicious?"**

The agent holds `AgentCap` and can borrow via `request_flash_shift`, but the hot-potato receipt forces repayment in the same transaction. The worst the agent can do is a no-op (borrow and immediately repay the same amount). It literally cannot steal funds because the Move VM won't let the transaction complete without repayment.

This is enforced at three levels:

1. **Type system** — `FlashReceipt` has no `drop` ability, so the VM rejects any transaction that doesn't consume it
2. **Assertion** — `complete_flash_shift` checks `coin::value(&payment) >= receipt.amount`
3. **Atomicity** — Sui PTBs are all-or-nothing; any failure reverts the entire block

---

## Autonomous Gas Sustainability

The agent never needs a human to top up its wallet. It harvests its own "rent" from yield:

```
+--- Refuel PTB (atomic) -----------------------------------+
|                                                            |
|  1. skim_yield_for_gas(vault, amount)                      |
|     -> Coin<USDC> from yield (never principal)             |
|                                                            |
|  2. Cetus Aggregator: findRouters(USDC -> SUI)            |
|     -> routerSwap() multi-hop swap                         |
|                                                            |
|  3. transfer(Coin<SUI>, agent_address)                     |
|     -> Agent's gas tank refueled                           |
|                                                            |
+------------------------------------------------------------+
     Agent checks: if SUI balance < 0.5 SUI -> trigger refuel
     Yield only. Principal untouched. Vault runs forever.
```

This makes VibeShift a **perpetual motion vault** — the first self-sustaining financial organism on Sui.

---

## Test Coverage

20 Move unit tests pass, including:

- **`test_flash_shift_happy_path`** — Deposit 1000, borrow 400, repay 400, verify vault balance restored to 1000
- **`test_flash_shift_repayment_fails`** — Deposit 1000, borrow 400, attempt repay 300, verify abort with `EFlashLoanNotRepaid`

```bash
cd contracts/vibeshift && sui move test
# Test result: OK. Total tests: 20; passed: 20; failed: 0
```

---

## Why This Pitch Wins

- **The "Safety" Hook:** Judges love "mathematically impossible to drain." The narrative shifts from "our code is audited" to "the VM literally won't let it fail."
- **Atomic Efficiency:** 2 transactions -> 1 atomic PTB is a clear ROI for any DeFi user.
- **Move-Native:** This isn't ported EVM logic. The hot-potato pattern, PTB composability, and DeepBook V3 liquidity injection are architecture that *only works on Sui*.
- **2026-Ready:** Flash-Shift + Autonomous Refuel = a machine-native financial organism, not just another yield aggregator.

---

## Five Killer Points for Judges

1. **Safety Track**: `FlashReceipt` has no abilities — vault drain is *mathematically impossible*, not just "we added a require check." The Move type system enforces it at the VM level.

2. **Capital Efficiency**: Old way = 2 transactions with idle capital. Flash-Shift = 1 atomic PTB. On a 10% yield spike, the difference compounds fast.

3. **DeepBook V3 Composability**: When vault capital isn't enough, stack a DeepBook flash loan on top — multiple flash loans from different protocols in one atomic block.

4. **Strategy Protection**: Walrus Seal encrypts the agent's reasoning. Only Blob ID + Zk-Proof of Intent go on-chain. Financial alpha stays private while proofs remain auditable.

5. **Full Stack**: Move contract (20 tests) -> TypeScript PTB builder (`deepbook.ts` + `refuel.ts`) -> AI agent (`sentinel.py`) that autonomously detects yield opportunities, triggers flash-shifts, and pays its own gas from yield. It runs forever without human intervention.
