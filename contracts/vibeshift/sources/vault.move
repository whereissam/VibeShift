/// VibeShift Flux Vault - Autonomous liquidity orchestrator on Sui.
/// Holds user deposits, issues LP shares, and allows an AI agent
/// (via AgentCap) to rebalance funds across Stablelayer and Cetus.
module vibeshift::vault;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::event;

// ===== Error Codes =====

const EInsufficientBalance: u64 = 0;
const EZeroAmount: u64 = 1;
const EVaultEmpty: u64 = 2;
const EExceedsBalance: u64 = 3;
const EEmptyBlobId: u64 = 4;
const ENoYield: u64 = 5;
const ESkimExceedsLimit: u64 = 6;
const EFlashLoanNotRepaid: u64 = 7;
const EFlashVaultMismatch: u64 = 8;

// ===== Constants =====

const GAS_SKIM_BPS: u64 = 50; // 0.5% of yield

// ===== Events =====

public struct DepositEvent has copy, drop {
    vault_id: ID,
    depositor: address,
    amount: u64,
    lp_minted: u64,
    total_assets: u64,
    total_lp_supply: u64,
}

public struct WithdrawEvent has copy, drop {
    vault_id: ID,
    withdrawer: address,
    amount: u64,
    lp_burned: u64,
    total_assets: u64,
    total_lp_supply: u64,
}

public struct RebalanceEvent has copy, drop {
    vault_id: ID,
    agent: address,
    amount: u64,
    direction: vector<u8>,
    total_assets_after: u64,
}

public struct ReasoningProof has copy, drop {
    vault_id: ID,
    timestamp: u64,
    action: vector<u8>,
    rationale: vector<u8>,
    cetus_yield_bps: u64,
    stablelayer_yield_bps: u64,
    shift_pct: u64,
}

public struct WalrusProofStored has copy, drop {
    vault_id: ID,
    timestamp: u64,
    walrus_blob_id: vector<u8>,
    action: vector<u8>,
}

public struct EncryptedProofStored has copy, drop {
    vault_id: ID,
    timestamp: u64,
    walrus_blob_id: vector<u8>,
    action: vector<u8>,
    seal_policy_id: vector<u8>,
    encryption_version: u8,
}

public struct GasRefuelEvent has copy, drop {
    vault_id: ID,
    agent: address,
    yield_skimmed: u64,
    vault_yield: u64,
    total_assets_after: u64,
}

public struct FlashShiftEvent has copy, drop {
    vault_id: ID,
    agent: address,
    amount: u64,
    repaid: u64,
    protocol: vector<u8>,
    total_assets_after: u64,
}

// ===== Objects =====

/// The main Vault object (Shared Object).
/// Holds stablecoin deposits and tracks LP share supply.
public struct Vault<phantom T> has key {
    id: UID,
    assets: Balance<T>,
    lp_supply: u64,
}

/// Admin capability allowing the AI Agent to trigger rebalances.
/// Only the holder of this cap can move funds out of the vault.
public struct AgentCap has key, store {
    id: UID,
}

/// Flash loan receipt — no abilities (hot-potato).
/// Must be consumed by `complete_flash_shift` in the same transaction.
public struct FlashReceipt {
    vault_id: ID,
    amount: u64,
}

/// Admin capability for vault management (creating vaults, etc.)
public struct AdminCap has key, store {
    id: UID,
}

// ===== Init =====

/// Transfers AgentCap and AdminCap to the deployer on module publish.
fun init(ctx: &mut TxContext) {
    transfer::transfer(AgentCap {
        id: object::new(ctx),
    }, ctx.sender());

    transfer::transfer(AdminCap {
        id: object::new(ctx),
    }, ctx.sender());
}

// ===== Public Entry Functions =====

/// Create a new vault for a specific stablecoin type (e.g., USDC).
/// The vault is shared so anyone can deposit/withdraw.
public fun create_vault<T>(_: &AdminCap, ctx: &mut TxContext) {
    let vault = Vault<T> {
        id: object::new(ctx),
        assets: balance::zero(),
        lp_supply: 0,
    };
    transfer::share_object(vault);
}

/// Deposit stablecoins into the vault and receive LP shares.
/// Uses a simple 1:1 ratio for the MVP (amount deposited = LP minted).
public fun deposit<T>(
    vault: &mut Vault<T>,
    payment: Coin<T>,
    ctx: &mut TxContext,
) {
    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroAmount);

    // Add to vault assets
    let coin_balance = coin::into_balance(payment);
    balance::join(&mut vault.assets, coin_balance);

    // Mint LP shares 1:1
    vault.lp_supply = vault.lp_supply + amount;

    event::emit(DepositEvent {
        vault_id: object::id(vault),
        depositor: ctx.sender(),
        amount,
        lp_minted: amount,
        total_assets: balance::value(&vault.assets),
        total_lp_supply: vault.lp_supply,
    });
}

/// Withdraw stablecoins from the vault by burning LP shares.
/// Burns `lp_amount` shares and returns the proportional stablecoins.
public fun withdraw<T>(
    vault: &mut Vault<T>,
    lp_amount: u64,
    ctx: &mut TxContext,
) {
    assert!(lp_amount > 0, EZeroAmount);
    assert!(vault.lp_supply > 0, EVaultEmpty);
    assert!(lp_amount <= vault.lp_supply, EExceedsBalance);

    // Calculate proportional share of assets
    let total_assets = balance::value(&vault.assets);
    let withdraw_amount = (lp_amount * total_assets) / vault.lp_supply;
    assert!(withdraw_amount > 0, EInsufficientBalance);

    // Burn LP shares
    vault.lp_supply = vault.lp_supply - lp_amount;

    // Withdraw assets
    let withdrawn = balance::split(&mut vault.assets, withdraw_amount);
    let coin_out = coin::from_balance(withdrawn, ctx);
    transfer::public_transfer(coin_out, ctx.sender());

    event::emit(WithdrawEvent {
        vault_id: object::id(vault),
        withdrawer: ctx.sender(),
        amount: withdraw_amount,
        lp_burned: lp_amount,
        total_assets: balance::value(&vault.assets),
        total_lp_supply: vault.lp_supply,
    });
}

/// Rebalance funds to an external protocol (Stablelayer or Cetus).
/// Restricted to the AgentCap holder. Withdraws `amount` from the vault
/// and sends it to `recipient` (a strategy address or the agent itself).
public fun rebalance_to_protocol<T>(
    _: &AgentCap,
    vault: &mut Vault<T>,
    amount: u64,
    direction: vector<u8>,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert!(amount > 0, EZeroAmount);
    let vault_balance = balance::value(&vault.assets);
    assert!(amount <= vault_balance, EExceedsBalance);

    let to_shift = balance::split(&mut vault.assets, amount);
    let coin_to_shift = coin::from_balance(to_shift, ctx);
    transfer::public_transfer(coin_to_shift, recipient);

    event::emit(RebalanceEvent {
        vault_id: object::id(vault),
        agent: ctx.sender(),
        amount,
        direction,
        total_assets_after: balance::value(&vault.assets),
    });
}

/// Receive funds back from a protocol after a rebalance.
/// Anyone can deposit back into the vault (the agent sends coins back).
public fun receive_from_protocol<T>(
    vault: &mut Vault<T>,
    payment: Coin<T>,
) {
    let coin_balance = coin::into_balance(payment);
    balance::join(&mut vault.assets, coin_balance);
}

/// Store a reasoning proof on-chain explaining why a rebalance happened.
/// Only the AgentCap holder can emit proofs.
public fun store_proof(
    _: &AgentCap,
    vault_id: ID,
    action: vector<u8>,
    rationale: vector<u8>,
    cetus_yield_bps: u64,
    stablelayer_yield_bps: u64,
    shift_pct: u64,
    clock: &sui::clock::Clock,
) {
    event::emit(ReasoningProof {
        vault_id,
        timestamp: sui::clock::timestamp_ms(clock),
        action,
        rationale,
        cetus_yield_bps,
        stablelayer_yield_bps,
        shift_pct,
    });
}

/// Store a Walrus blob ID on-chain linking to the full reasoning proof
/// stored off-chain on Walrus. The agent uploads the detailed proof JSON
/// to Walrus first, then records the blob ID here for verifiability.
public fun store_walrus_proof(
    _: &AgentCap,
    vault_id: ID,
    walrus_blob_id: vector<u8>,
    action: vector<u8>,
    clock: &sui::clock::Clock,
) {
    event::emit(WalrusProofStored {
        vault_id,
        timestamp: sui::clock::timestamp_ms(clock),
        walrus_blob_id,
        action,
    });
}

/// Store an encrypted Walrus blob ID on-chain. The blob is AES-256-GCM
/// encrypted; only holders of the seal policy key can decrypt it.
public fun store_encrypted_proof(
    _: &AgentCap,
    vault_id: ID,
    walrus_blob_id: vector<u8>,
    action: vector<u8>,
    seal_policy_id: vector<u8>,
    encryption_version: u8,
    clock: &sui::clock::Clock,
) {
    assert!(walrus_blob_id.length() > 0, EEmptyBlobId);
    event::emit(EncryptedProofStored {
        vault_id,
        timestamp: sui::clock::timestamp_ms(clock),
        walrus_blob_id,
        action,
        seal_policy_id,
        encryption_version,
    });
}

/// Skim a fraction of vault yield for agent gas. Capped at 0.5% of
/// yield (assets - lp_supply). Never touches depositor principal.
public fun skim_yield_for_gas<T>(
    _: &AgentCap,
    vault: &mut Vault<T>,
    amount: u64,
    ctx: &mut TxContext,
) {
    assert!(amount > 0, EZeroAmount);
    let total_assets = balance::value(&vault.assets);
    let yield_amount = if (total_assets > vault.lp_supply) {
        total_assets - vault.lp_supply
    } else {
        0
    };
    assert!(yield_amount > 0, ENoYield);
    let max_skim = (yield_amount * GAS_SKIM_BPS) / 10000;
    assert!(amount <= max_skim, ESkimExceedsLimit);

    let skimmed = balance::split(&mut vault.assets, amount);
    let coin_out = coin::from_balance(skimmed, ctx);
    transfer::public_transfer(coin_out, ctx.sender());

    event::emit(GasRefuelEvent {
        vault_id: object::id(vault),
        agent: ctx.sender(),
        yield_skimmed: amount,
        vault_yield: yield_amount,
        total_assets_after: balance::value(&vault.assets),
    });
}

/// Borrow funds from the vault for an atomic flash-shift operation.
/// Returns a coin and a hot-potato FlashReceipt that must be consumed
/// by `complete_flash_shift` within the same transaction.
public fun request_flash_shift<T>(
    _: &AgentCap,
    vault: &mut Vault<T>,
    amount: u64,
    ctx: &mut TxContext,
): (Coin<T>, FlashReceipt) {
    assert!(amount > 0, EZeroAmount);
    let vault_balance = balance::value(&vault.assets);
    assert!(amount <= vault_balance, EExceedsBalance);

    let borrowed = balance::split(&mut vault.assets, amount);
    let coin_out = coin::from_balance(borrowed, ctx);
    let receipt = FlashReceipt {
        vault_id: object::id(vault),
        amount,
    };
    (coin_out, receipt)
}

/// Repay a flash-shift loan. Consumes the hot-potato FlashReceipt.
/// The repayment coin must have value >= the borrowed amount.
public fun complete_flash_shift<T>(
    vault: &mut Vault<T>,
    payment: Coin<T>,
    receipt: FlashReceipt,
    protocol: vector<u8>,
    ctx: &mut TxContext,
) {
    let FlashReceipt { vault_id, amount } = receipt;
    assert!(vault_id == object::id(vault), EFlashVaultMismatch);
    assert!(coin::value(&payment) >= amount, EFlashLoanNotRepaid);

    let repaid = coin::value(&payment);
    let coin_balance = coin::into_balance(payment);
    balance::join(&mut vault.assets, coin_balance);

    event::emit(FlashShiftEvent {
        vault_id,
        agent: ctx.sender(),
        amount,
        repaid,
        protocol,
        total_assets_after: balance::value(&vault.assets),
    });
}

// ===== View Functions =====

/// Get total assets held in the vault.
public fun vault_balance<T>(vault: &Vault<T>): u64 {
    balance::value(&vault.assets)
}

/// Get total LP supply for the vault.
public fun vault_lp_supply<T>(vault: &Vault<T>): u64 {
    vault.lp_supply
}

/// Get yield amount (assets exceeding LP supply).
public fun vault_yield<T>(vault: &Vault<T>): u64 {
    let total_assets = balance::value(&vault.assets);
    if (total_assets > vault.lp_supply) { total_assets - vault.lp_supply } else { 0 }
}

/// Transfer the AgentCap to a new agent address.
public fun transfer_agent_cap(cap: AgentCap, new_agent: address) {
    transfer::public_transfer(cap, new_agent);
}

// ===== Test Helpers =====

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
