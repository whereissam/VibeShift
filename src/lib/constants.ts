// VibeShift contract addresses (Testnet deployment)
export const VIBESHIFT_PACKAGE_ID =
  "0x32796493ed4858dc9e2600bfb9b6c290f0ecc468b1e9a7531b69571ebffd8c08";
export const ADMIN_CAP_ID =
  "0x70b124576d8ce15e5ac3aabf3bce0dfe79f3696b02276fb27a0a10bc4fd5c4e3";
export const AGENT_CAP_ID =
  "0xde5d8c1b8247d89ae4179c38255bdff3c38a3d5e7a641330fb574d7b94857926";

// Sui system
export const CLOCK_ID = "0x6";

// Network config
export const NETWORK = "testnet" as "testnet" | "mainnet";
export const SUI_RPC_URL =
  NETWORK === "mainnet"
    ? "https://fullnode.mainnet.sui.io:443"
    : "https://fullnode.testnet.sui.io:443";

// Coin types
export const SUI_COIN_TYPE = "0x2::sui::SUI";
export const USDC_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

// Stablelayer stablecoin types
export const BTC_USDC_TYPE =
  "0x6d9fc3e3a8e904a7e73de2c30a5a4097a71fbb5f0c533075ee4e0e9aa5253b64::btc_usdc::BtcUSDC";

// Cetus pool addresses (SUI/USDC)
// Note: Replace with actual pool IDs for the target network
export const CETUS_SUI_USDC_POOL =
  "0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688571";

// DeepBook V3 (note: 0xdee9 is deprecated V2)
export const DEEPBOOK_PACKAGE_ID =
  NETWORK === "mainnet"
    ? "0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497"
    : "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c";
export const DEEPBOOK_SUI_USDC_POOL =
  NETWORK === "mainnet"
    ? "0x18d871e3c3da99046dfc0d3de612c5d88859bc03b8f0568571c2a2d9d010b923"
    : "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5";

// Walrus endpoints
export const WALRUS_AGGREGATOR =
  NETWORK === "mainnet"
    ? "https://aggregator.walrus.space"
    : "https://aggregator.walrus-testnet.walrus.space";
export const WALRUS_PUBLISHER =
  NETWORK === "mainnet"
    ? "https://publisher.walrus.space"
    : "https://publisher.walrus-testnet.walrus.space";

// Rebalance strategy defaults
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
export const MIN_REBALANCE_AMOUNT = 1_000_000n; // 1 USDC (6 decimals)
export const MAX_SHIFT_PCT = 40; // Max 40% of TVL per rebalance
export const YIELD_THRESHOLD_BPS = 200; // 2% differential to trigger rebalance
export const REBALANCE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Gas autonomy
export const GAS_SKIM_BPS = 50; // 0.5% of yield — matches Move contract
export const GAS_MIN_SUI_BALANCE = 500_000_000n; // 0.5 SUI (9 decimals)

// Refuel
export const REFUEL_SLIPPAGE = 0.01; // 1% slippage for USDC->SUI swap
export const REFUEL_DEFAULT_AMOUNT = 10_000_000n; // 10 USDC (6 decimals)

// Walrus Seal encryption
export const SEAL_ENCRYPTION_VERSION = 1;
