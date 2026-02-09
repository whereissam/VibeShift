---
name: vibeshift-sentinel
description: Autonomous yield sentinel that monitors Cetus and Stablelayer on Sui, and triggers VibeShift vault rebalances when yield differentials exceed thresholds.
emoji: "\u26A1"
requires:
  bins: ["python3"]
  env: ["SUI_PRIVATE_KEY", "VIBESHIFT_VAULT_ID"]
  config: ["network"]
install: |
  pip install -r requirements.txt
---

# VibeShift Sentinel

Autonomous AI agent that monitors yield across Cetus DEX and Stablelayer protocol on Sui blockchain, then triggers vault rebalances when profitable.

## When to Use

- Run on a schedule (e.g., every 10 minutes) to monitor yield differentials
- Trigger manually when you suspect market conditions have shifted
- Use "check vibeshift" to get a status report without executing

## Commands

- `check vibeshift` - Analyze current yields and report recommendation
- `rebalance vibeshift` - Analyze and execute a rebalance if threshold is met
- `vibeshift status` - Show vault TVL, current allocation, and recent proofs

## How It Works

1. Polls SUI/USDC pool stats from Cetus (fee rate, liquidity, tick)
2. Queries Stablelayer total supply and yield metrics
3. Compares yields - if differential exceeds 200bps, recommends a shift
4. Executes `rebalance_to_protocol` on the VibeShift vault contract
5. Stores a reasoning proof on-chain and uploads detailed JSON to Walrus
