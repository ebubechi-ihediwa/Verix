import { env } from "@/lib/env";

export const DEMO_OWNER_ID = "demo:golden-path";

export const DEMO_TASK_ID = "demo_verix_golden_path";

export const DEMO_SPEND_CAP_USDC = 5;

export const DEMO_GOLDEN_PROMPT =
  "Supply 100 USDC to the Blend USDC-XLM pool for yield, swap 50 USDC to XLM on Soroswap, add liquidity to the Aquarius XLM/USDC pool, and send a cross-border payment of 500 USDC to NGN via the best anchor route.";

// Coordinator address used as the payout wallet when no per-specialist key is configured.
const COORDINATOR_WALLET = env.COORDINATOR_STELLAR_PUBLIC_KEY ?? "GBRUNF2IITT4B6EUUN7YSWWX5LJMM3SMTBMT75N7OG54CFVISPIO3KQ7";

export const DEMO_SPECIALISTS = [
  {
    id: "specialist_blend_agent",
    name: "BlendYieldAgent",
    description:
      "Supplies and withdraws liquidity on the Blend Protocol lending pools on Stellar, and monitors real-time APY rates across USDC, XLM, and synthetic asset pools.",
    endpoint: "/api/specialists/blend-agent/execute",
    walletAddress: COORDINATOR_WALLET,
    capabilities: [
      "blend-supply",
      "blend-withdraw",
      "yield-optimization",
      "lending-pool",
      "apy-monitoring",
    ],
    priceUsdc: 0.25,
    reputation: 94,
    totalJobs: 318,
    status: "online" as const,
    aiModel: "claude" as const,
    proofPolicy: "escrow-eligible" as const,
    currentVersion: 1,
  },
  {
    id: "specialist_soroswap_agent",
    name: "SoroswapTradingAgent",
    description:
      "Executes token swaps and retrieves price quotes on Soroswap DEX with configurable slippage protection and optimal route selection across Stellar asset pairs.",
    endpoint: "/api/specialists/soroswap-agent/execute",
    walletAddress: COORDINATOR_WALLET,
    capabilities: [
      "token-swap",
      "price-quote",
      "slippage-control",
      "dex-routing",
      "soroswap",
    ],
    priceUsdc: 0.2,
    reputation: 91,
    totalJobs: 502,
    status: "online" as const,
    aiModel: "claude" as const,
    proofPolicy: "escrow-eligible" as const,
    currentVersion: 1,
  },
  {
    id: "specialist_aquarius_agent",
    name: "AquariusLiquidityAgent",
    description:
      "Manages AMM liquidity positions on Aquarius, tracks pool state and fee accrual, and optimises entry/exit timing across XLM, USDC, and AQUA pairs.",
    endpoint: "/api/specialists/aquarius-agent/execute",
    walletAddress: COORDINATOR_WALLET,
    capabilities: [
      "amm-liquidity",
      "aquarius",
      "pool-management",
      "fee-tracking",
      "lp-positions",
    ],
    priceUsdc: 0.2,
    reputation: 89,
    totalJobs: 274,
    status: "online" as const,
    aiModel: "claude" as const,
    proofPolicy: "escrow-eligible" as const,
    currentVersion: 1,
  },
  {
    id: "specialist_anchor_agent",
    name: "AnchorPaymentAgent",
    description:
      "Routes cross-border USDC payments through SEP-24/31 Stellar anchors, compares corridor fees and FX rates, and executes the optimal payout path to fiat destinations.",
    endpoint: "/api/specialists/anchor-agent/execute",
    walletAddress: COORDINATOR_WALLET,
    capabilities: [
      "cross-border-payment",
      "anchor-routing",
      "sep24",
      "sep31",
      "fx-optimization",
    ],
    priceUsdc: 0.3,
    reputation: 93,
    totalJobs: 441,
    status: "online" as const,
    aiModel: "claude" as const,
    proofPolicy: "escrow-eligible" as const,
    currentVersion: 1,
  },
];

export const DEMO_EXPECTED_FLOW = [
  "Coordinator receives the DeFi mandate and snapshots the agent registry.",
  "Router selects BlendYieldAgent, SoroswapTradingAgent, AquariusLiquidityAgent, and AnchorPaymentAgent.",
  "Spend cap check verifies the estimated total is within the configured limit.",
  "Each agent records a Stellar USDC payout intent and executes its DeFi action.",
  "Trace events are hash-chained into a tamper-evident trace root.",
  "A receipt commits to input, agent version snapshots, trace root, spend cap, and all payouts.",
  "The 5-constraint verifier proves receipt integrity, spend compliance, and payment correctness.",
  "Trustless Work milestones are released after proof verification.",
];
