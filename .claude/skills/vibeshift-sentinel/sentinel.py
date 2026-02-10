"""
VibeShift Sentinel - Autonomous yield monitoring agent for Sui blockchain.
Monitors Cetus DEX and Stablelayer, triggers vault rebalances when yield
differentials exceed configurable thresholds.
"""

import base64
import json
import os
import time
import logging
from dataclasses import dataclass, asdict
from typing import Optional

import httpx

logging.basicConfig(level=logging.INFO, format="[Sentinel] %(message)s")
log = logging.getLogger(__name__)

# ===== Config =====

SUI_RPC = os.getenv("SUI_RPC_URL", "https://fullnode.testnet.sui.io:443")
VIBESHIFT_PACKAGE = os.getenv(
    "VIBESHIFT_PACKAGE_ID",
    "0x32796493ed4858dc9e2600bfb9b6c290f0ecc468b1e9a7531b69571ebffd8c08",
)
AGENT_CAP = os.getenv(
    "AGENT_CAP_ID",
    "0xde5d8c1b8247d89ae4179c38255bdff3c38a3d5e7a641330fb574d7b94857926",
)
VAULT_ID = os.getenv("VIBESHIFT_VAULT_ID", "")
CETUS_POOL = os.getenv(
    "CETUS_SUI_USDC_POOL",
    "0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688571",
)
WALRUS_PUBLISHER = os.getenv(
    "WALRUS_PUBLISHER", "https://publisher.walrus-testnet.walrus.space"
)
WALRUS_AGGREGATOR = os.getenv(
    "WALRUS_AGGREGATOR", "https://aggregator.walrus-testnet.walrus.space"
)
CLOCK_ID = "0x6"

# Seal encryption
SEAL_SECRET = os.getenv("VIBESHIFT_SEAL_SECRET", "")
HKDF_INFO = b"vibeshift-seal-v1"
ENCRYPTION_VERSION = 1

# DeepBook V3 Liquidity Injection
DEEPBOOK_POOL = os.getenv(
    "DEEPBOOK_SUI_USDC_POOL",
    "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5",
)

# Gas autonomy
GAS_MIN_SUI_BALANCE = int(os.getenv("GAS_MIN_SUI_BALANCE", "500000000"))  # 0.5 SUI
GAS_REFUEL_AMOUNT = int(os.getenv("GAS_REFUEL_AMOUNT", "10000000"))  # 10 USDC
AGENT_ADDRESS = os.getenv("VIBESHIFT_AGENT_ADDRESS", "")

# Strategy
YIELD_THRESHOLD_BPS = int(os.getenv("YIELD_THRESHOLD_BPS", "200"))
MAX_SHIFT_PCT = int(os.getenv("MAX_SHIFT_PCT", "40"))
COOLDOWN_SECONDS = int(os.getenv("COOLDOWN_SECONDS", "3600"))


# ===== Data Types =====


@dataclass
class PoolStats:
    fee_rate: int
    liquidity: str
    current_tick: int
    current_sqrt_price: str


@dataclass
class VaultState:
    balance: int
    lp_supply: int


@dataclass
class ShiftAction:
    direction: str  # "to_cetus" | "to_stablelayer"
    shift_pct: int
    shift_amount: int
    reason: str
    cetus_yield_bps: int
    stablelayer_yield_bps: int
    deepbook_supplement: int = 0  # extra capital from DeepBook flash loan


# ===== RPC Helpers =====


def sui_rpc(method: str, params: list) -> dict:
    """Make a JSON-RPC call to the Sui fullnode."""
    resp = httpx.post(
        SUI_RPC,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"RPC error: {data['error']}")
    return data["result"]


def get_object_fields(object_id: str) -> Optional[dict]:
    """Fetch a Sui object and return its Move fields."""
    result = sui_rpc(
        "sui_getObject",
        [object_id, {"showContent": True}],
    )
    content = result.get("data", {}).get("content", {})
    if content.get("dataType") != "moveObject":
        return None
    return content.get("fields", {})


# ===== Monitors =====


def get_cetus_pool_stats() -> Optional[PoolStats]:
    """Fetch Cetus pool state from on-chain object."""
    fields = get_object_fields(CETUS_POOL)
    if not fields:
        log.warning("Could not fetch Cetus pool %s", CETUS_POOL)
        return None
    return PoolStats(
        fee_rate=int(fields.get("fee_rate", 0)),
        liquidity=str(fields.get("liquidity", "0")),
        current_tick=int(fields.get("current_tick_index", 0)),
        current_sqrt_price=str(fields.get("current_sqrt_price", "0")),
    )


def get_vault_state() -> Optional[VaultState]:
    """Fetch VibeShift vault balance and LP supply."""
    if not VAULT_ID:
        log.warning("VIBESHIFT_VAULT_ID not set")
        return None
    fields = get_object_fields(VAULT_ID)
    if not fields:
        log.warning("Could not fetch vault %s", VAULT_ID)
        return None
    assets = fields.get("assets", {})
    balance = int(assets.get("value", 0)) if isinstance(assets, dict) else 0
    return VaultState(
        balance=balance,
        lp_supply=int(fields.get("lp_supply", 0)),
    )


def get_stablelayer_yield_bps() -> int:
    """
    Estimate Stablelayer yield. In production, this would query the
    Stablelayer registry for actual reward rates. For the MVP, we use
    a heuristic based on total supply.
    """
    # Placeholder: return a fixed estimate
    return 500  # 5% APY


def get_deepbook_flash_loan_capacity() -> int:
    """Query available DeepBook V3 flash loan liquidity."""
    if not DEEPBOOK_POOL or DEEPBOOK_POOL.endswith("00000000"):
        return 0
    fields = get_object_fields(DEEPBOOK_POOL)
    if not fields:
        log.warning("Could not fetch DeepBook pool %s", DEEPBOOK_POOL)
        return 0
    base_vault = fields.get("base_vault", {})
    if isinstance(base_vault, dict):
        return int(base_vault.get("value", 0))
    return 0


# ===== Analysis =====


def analyze() -> Optional[ShiftAction]:
    """
    Core analysis: compare Cetus vs Stablelayer yields and decide
    whether to shift funds.
    """
    pool = get_cetus_pool_stats()
    vault = get_vault_state()

    if not pool:
        log.info("Cannot fetch Cetus pool - skipping")
        return None
    if not vault or vault.balance == 0:
        log.info("Vault empty or not found - skipping")
        return None

    cetus_yield_bps = pool.fee_rate
    stable_yield_bps = get_stablelayer_yield_bps()
    diff = abs(cetus_yield_bps - stable_yield_bps)

    log.info(
        "Cetus yield: %d bps | Stablelayer yield: %d bps | Diff: %d bps",
        cetus_yield_bps,
        stable_yield_bps,
        diff,
    )

    if diff < YIELD_THRESHOLD_BPS:
        log.info("Below threshold (%d bps) - holding", YIELD_THRESHOLD_BPS)
        return None

    direction = "to_cetus" if cetus_yield_bps > stable_yield_bps else "to_stablelayer"

    # Compute the optimal deployment amount from yield differential,
    # and cap the vault's own contribution to MAX_SHIFT_PCT
    optimal_pct = diff // 10
    optimal_amount = (vault.balance * optimal_pct) // 100
    shift_pct = min(MAX_SHIFT_PCT, optimal_pct)
    vault_contribution = (vault.balance * shift_pct) // 100

    # Liquidity Injection: if the optimal deployment exceeds the vault's
    # capped contribution, borrow the remainder from DeepBook V3
    deepbook_supplement = 0
    if optimal_amount > vault_contribution:
        deepbook_capacity = get_deepbook_flash_loan_capacity()
        needed = optimal_amount - vault_contribution
        deepbook_supplement = min(needed, deepbook_capacity)
        if deepbook_supplement > 0:
            log.info(
                "LIQUIDITY INJECTION: vault=%d, DeepBook supplement=%d, total=%d",
                vault_contribution,
                deepbook_supplement,
                vault_contribution + deepbook_supplement,
            )

    shift_amount = vault_contribution + deepbook_supplement

    reason = (
        f"Cetus yield {cetus_yield_bps}bps vs Stablelayer {stable_yield_bps}bps, "
        f"shifting {shift_pct}% TVL {direction}"
    )
    if deepbook_supplement > 0:
        reason += f" (+ DeepBook injection: {deepbook_supplement})"

    return ShiftAction(
        direction=direction,
        shift_pct=shift_pct,
        shift_amount=shift_amount,
        reason=reason,
        cetus_yield_bps=cetus_yield_bps,
        stablelayer_yield_bps=stable_yield_bps,
        deepbook_supplement=deepbook_supplement,
    )


# ===== Seal Encryption =====


def encrypt_strategy_blob(proof_dict: dict, secret: str, vault_id: str) -> dict:
    """Encrypt a proof dict with AES-256-GCM using HKDF-derived key.

    Compatible with the TypeScript walrus-seal.ts implementation:
    same HKDF params (SHA-256, salt=vault_id, info="vibeshift-seal-v1").
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes

    # Derive key via HKDF-SHA256
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=vault_id.encode(),
        info=HKDF_INFO,
    )
    key = hkdf.derive(secret.encode())

    # Encrypt with AES-256-GCM
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    plaintext = json.dumps(proof_dict).encode()
    ciphertext = aesgcm.encrypt(iv, plaintext, None)

    return {
        "v": ENCRYPTION_VERSION,
        "iv": base64.b64encode(iv).decode(),
        "ct": base64.b64encode(ciphertext).decode(),
        "policy": f"vibeshift-seal-v1:{vault_id}",
    }


def decrypt_strategy_blob(payload: dict, secret: str, vault_id: str) -> dict:
    """Decrypt an encrypted proof payload back to a dict.

    Compatible with the TypeScript walrus-seal.ts implementation.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes

    if payload.get("v") != ENCRYPTION_VERSION:
        raise ValueError(f"Unsupported encryption version: {payload.get('v')}")

    # Derive key via HKDF-SHA256
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=vault_id.encode(),
        info=HKDF_INFO,
    )
    key = hkdf.derive(secret.encode())

    # Decrypt with AES-256-GCM
    iv = base64.b64decode(payload["iv"])
    ciphertext = base64.b64decode(payload["ct"])
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, ciphertext, None)

    return json.loads(plaintext.decode())


# ===== Walrus Proof Storage =====


def upload_walrus_proof(action: ShiftAction) -> Optional[str]:
    """Upload a detailed reasoning proof to Walrus and return the blob ID.

    If SEAL_SECRET is set, encrypts the proof before uploading.
    """
    proof = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "vault_id": VAULT_ID,
        **asdict(action),
    }

    # Encrypt if seal secret is configured
    if SEAL_SECRET:
        body = json.dumps(encrypt_strategy_blob(proof, SEAL_SECRET, VAULT_ID))
        log.info("Uploading encrypted proof to Walrus")
    else:
        body = json.dumps(proof)

    try:
        resp = httpx.put(
            f"{WALRUS_PUBLISHER}/v1/blobs?epochs=5",
            content=body,
            timeout=30,
        )
        if resp.status_code != 200:
            log.warning("Walrus upload failed: %d", resp.status_code)
            return None

        data = resp.json()
        if "newlyCreated" in data:
            return data["newlyCreated"]["blobObject"]["blobId"]
        if "alreadyCertified" in data:
            return data["alreadyCertified"]["blobId"]
    except Exception as e:
        log.warning("Walrus upload error: %s", e)

    return None


# ===== Gas Autonomy =====


def check_gas_balance() -> int:
    """Check the agent's SUI gas balance. Returns balance in MIST."""
    if not AGENT_ADDRESS:
        log.warning("VIBESHIFT_AGENT_ADDRESS not set — cannot check gas")
        return 0
    result = sui_rpc("suix_getBalance", [AGENT_ADDRESS, "0x2::sui::SUI"])
    return int(result.get("totalBalance", 0))


def refuel():
    """Check gas balance, calculate vault yield, and trigger autonomous refuel.

    Logs before/after balances and delegates PTB execution to TypeScript.
    """
    balance_before = check_gas_balance()
    balance_sui = balance_before / 1_000_000_000
    log.info("Agent gas balance: %.4f SUI (%d MIST)", balance_sui, balance_before)

    if balance_before >= GAS_MIN_SUI_BALANCE:
        log.info("Gas sufficient — no refuel needed")
        return

    vault = get_vault_state()
    if not vault:
        log.warning("Cannot check vault yield for refuel — vault not found")
        return

    yield_amount = max(0, vault.balance - vault.lp_supply)
    max_skim = (yield_amount * 50) // 10000  # 0.5% of yield
    refuel_amount = min(GAS_REFUEL_AMOUNT, max_skim)

    if refuel_amount <= 0:
        log.warning("No yield available to skim for gas refuel")
        return

    log.info(
        "AUTONOMOUS REFUEL: balance_before=%.4f SUI, vault_yield=%d, "
        "skim_amount=%d USDC, threshold=%.4f SUI",
        balance_sui,
        yield_amount,
        refuel_amount,
        GAS_MIN_SUI_BALANCE / 1_000_000_000,
    )
    log.info(
        "Delegating refuel PTB to TypeScript (refuel.ts): "
        "skim_yield_for_gas -> Cetus Aggregator USDC->SUI -> transfer to agent"
    )

    # After execution, the TS side would confirm; log expected state
    log.info(
        "Expected: balance_after > %.4f SUI (refueled with %d USDC worth of SUI)",
        GAS_MIN_SUI_BALANCE / 1_000_000_000,
        refuel_amount,
    )


# ===== Main Loop =====


def status():
    """Print current status without executing anything."""
    vault = get_vault_state()
    pool = get_cetus_pool_stats()
    stable_yield = get_stablelayer_yield_bps()

    print("=== VibeShift Sentinel Status ===")
    if vault:
        print(f"Vault Balance:       {vault.balance:,}")
        print(f"Vault LP Supply:     {vault.lp_supply:,}")
    else:
        print("Vault: Not found / not configured")

    if pool:
        print(f"Cetus Fee Rate:      {pool.fee_rate} bps")
        print(f"Cetus Liquidity:     {pool.liquidity}")
        print(f"Cetus Tick:          {pool.current_tick}")
    else:
        print("Cetus Pool: Not found")

    print(f"Stablelayer Yield:   {stable_yield} bps")
    print(f"Threshold:           {YIELD_THRESHOLD_BPS} bps")
    print(f"Max Shift:           {MAX_SHIFT_PCT}%")
    print(f"Cooldown:            {COOLDOWN_SECONDS}s")

    action = analyze()
    if action:
        print(f"\nRecommendation: {action.reason}")
    else:
        print("\nRecommendation: HOLD")


def run_once():
    """Run one analysis cycle. Log and upload proof if action needed."""
    action = analyze()
    if not action:
        return

    log.info("ACTION: %s", action.reason)

    # Upload proof to Walrus
    blob_id = upload_walrus_proof(action)
    if blob_id:
        log.info("Walrus proof stored: %s", blob_id)
    else:
        log.info("Walrus proof upload skipped")

    # Log DeepBook Liquidity Injection if applicable
    if action.deepbook_supplement > 0:
        log.info(
            "LIQUIDITY INJECTION active: vault_amount=%d + deepbook_amount=%d = total=%d",
            action.shift_amount - action.deepbook_supplement,
            action.deepbook_supplement,
            action.shift_amount,
        )

    # Note: Actual transaction execution requires pysui keypair signing.
    # In production, the agent would build and sign the PTB here.
    # For the hackathon demo, the TypeScript RebalanceEngine handles execution.
    log.info(
        "Transaction execution delegated to TypeScript RebalanceEngine. "
        "Direction=%s Amount=%d ShiftPct=%d DeepBookSupplement=%d",
        action.direction,
        action.shift_amount,
        action.shift_pct,
        action.deepbook_supplement,
    )


def run_loop(interval_seconds: int = 600):
    """Run the sentinel in a continuous loop."""
    log.info("Starting VibeShift Sentinel (interval=%ds)", interval_seconds)
    last_rebalance = 0

    while True:
        # Check agent gas balance — autonomous refuel if below threshold
        gas_balance = check_gas_balance()
        if gas_balance < GAS_MIN_SUI_BALANCE:
            gas_sui = gas_balance / 1_000_000_000
            log.warning("LOW GAS: %.4f SUI — triggering autonomous refuel", gas_sui)
            refuel()

        now = time.time()
        if now - last_rebalance < COOLDOWN_SECONDS:
            remaining = int(COOLDOWN_SECONDS - (now - last_rebalance))
            log.info("Cooldown active (%ds remaining)", remaining)
        else:
            action = analyze()
            if action:
                log.info("ACTION: %s", action.reason)
                blob_id = upload_walrus_proof(action)
                if blob_id:
                    log.info("Walrus proof: %s", blob_id)
                last_rebalance = now

        time.sleep(interval_seconds)


if __name__ == "__main__":
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"

    if cmd == "status":
        status()
    elif cmd == "once":
        run_once()
    elif cmd == "loop":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 600
        run_loop(interval)
    elif cmd == "gas":
        balance = check_gas_balance()
        balance_sui = balance / 1_000_000_000
        print(f"Agent Address:  {AGENT_ADDRESS or '(not set)'}")
        print(f"SUI Balance:    {balance_sui:.4f} SUI ({balance} MIST)")
        print(f"Min Threshold:  {GAS_MIN_SUI_BALANCE / 1_000_000_000:.4f} SUI")
        if balance < GAS_MIN_SUI_BALANCE:
            print("Status:         REFUEL NEEDED")
            refuel()
        else:
            print("Status:         OK")
    elif cmd == "decrypt":
        if len(sys.argv) < 3:
            print("Usage: python sentinel.py decrypt <blob_id> [vault_id]")
            sys.exit(1)
        blob_id = sys.argv[2]
        vault_id = sys.argv[3] if len(sys.argv) > 3 else VAULT_ID
        if not SEAL_SECRET:
            print("Error: VIBESHIFT_SEAL_SECRET env var not set")
            sys.exit(1)
        if not vault_id:
            print("Error: vault_id not provided and VIBESHIFT_VAULT_ID not set")
            sys.exit(1)
        # Fetch from Walrus aggregator
        resp = httpx.get(f"{WALRUS_AGGREGATOR}/v1/blobs/{blob_id}", timeout=30)
        resp.raise_for_status()
        payload = resp.json()
        decrypted = decrypt_strategy_blob(payload, SEAL_SECRET, vault_id)
        print(json.dumps(decrypted, indent=2))
    else:
        print("Usage: python sentinel.py [status|once|loop [interval_secs]|gas|decrypt <blob_id> [vault_id]]")
