export const DEMO_OWNER_ID = "demo:golden-path";

export const DEMO_TASK_ID = "demo_verix_golden_path";

export const DEMO_SPEND_CAP_USDC = 5;

export const DEMO_GOLDEN_PROMPT =
  "Audit a Soroban escrow milestone release flow for security risks, compare the market positioning against existing AI work platforms, and produce a concise investor-ready launch memo with proof-backed settlement requirements.";

export const DEMO_SPECIALISTS = [
  {
    id: "specialist_code_auditor",
    name: "CodeAuditor",
    description:
      "Reviews Soroban contracts, escrow release logic, and application code for security risks and verification gaps.",
    endpoint: "/api/specialists/code-auditor/execute",
    walletAddress: "G" + "A".repeat(55),
    capabilities: [
      "security-analysis",
      "code-review",
      "vulnerability-detection",
      "smart-contract-audit",
      "soroban-audit",
    ],
    priceUsdc: 1,
    reputation: 95,
    totalJobs: 142,
    status: "online" as const,
    aiModel: "claude" as const,
    proofPolicy: "receipt-proof" as const,
    currentVersion: 1,
  },
  {
    id: "specialist_market_analyst",
    name: "MarketAnalyst",
    description:
      "Analyzes market demand, competitor positioning, pricing, and go-to-market strategy for autonomous work products.",
    endpoint: "/api/specialists/market-analyst/execute",
    walletAddress: "G" + "B".repeat(55),
    capabilities: [
      "market-research",
      "financial-analysis",
      "competitive-intelligence",
      "defi-analytics",
      "market-positioning",
    ],
    priceUsdc: 0.75,
    reputation: 88,
    totalJobs: 98,
    status: "online" as const,
    aiModel: "openai" as const,
    proofPolicy: "trace-only" as const,
    currentVersion: 1,
  },
  {
    id: "specialist_creative_writer",
    name: "CreativeWriter",
    description:
      "Synthesizes technical and market findings into polished launch memos, product narratives, and investor-ready reports.",
    endpoint: "/api/specialists/creative-writer/execute",
    walletAddress: "G" + "C".repeat(55),
    capabilities: [
      "creative-writing",
      "report-writing",
      "business-documents",
      "whitepaper-drafting",
      "launch-memo",
    ],
    priceUsdc: 0.5,
    reputation: 92,
    totalJobs: 215,
    status: "online" as const,
    aiModel: "openai" as const,
    proofPolicy: "escrow-eligible" as const,
    currentVersion: 1,
  },
];

export const DEMO_EXPECTED_FLOW = [
  "Coordinator receives the golden prompt and snapshots the agent registry.",
  "Router selects CodeAuditor, MarketAnalyst, and CreativeWriter.",
  "Spend cap verifies the expected total is within the demo cap.",
  "Each specialist records a Stellar/Trustless Work payout intent and executes.",
  "Trace events are hash-chained into a trace root.",
  "A receipt commits to input, agent versions, trace root, spend cap, outputs, and payouts.",
  "The workflow verifier proves receipt integrity and spend/payment consistency.",
  "The payer approves the result before payout release.",
  "Trustless Work milestones can be released after proof verification and approval.",
  "Viewer links show live escrow records when Trustless Work is configured, or demo labels when ESCROW_MODE=demo.",
];
