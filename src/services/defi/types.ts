export interface DeFiAgentContext {
  taskId: string;
  subtaskId: string;
  agentName: string;
  walletAddress?: string;
  spendCap: number;
  stellarNetwork: "testnet" | "mainnet";
}

export interface BlendAgentInput {
  action: "supply" | "withdraw" | "check-rates" | "rebalance";
  pool?: string;
  amount?: number;
  minApy?: number;
  currency?: string;
}

export interface SoroswapAgentInput {
  action: "quote" | "swap" | "monitor-price";
  assetIn?: string;
  assetOut?: string;
  amount?: number;
  slippagePct?: number;
  priceThreshold?: number;
}

export interface AquariusAgentInput {
  action: "read-pool" | "add-liquidity" | "remove-liquidity" | "claim-fees" | "rebalance";
  tokenPair?: string;
  amount?: number;
  positionId?: string;
  rebalanceThreshold?: number;
}

export interface AnchorAgentInput {
  action: "query-anchors" | "compare-routes" | "execute-payment";
  destination?: string;
  amount?: number;
  currency?: string;
  maxFeePercent?: number;
  maxSettlementMinutes?: number;
}

export interface DeFiAgentResult {
  success: boolean;
  action: string;
  protocol: "blend" | "soroswap" | "aquarius" | "anchor";
  summary: string;
  data: Record<string, unknown>;
  txHash?: string;
  traceEvents: Array<{
    type: string;
    message: string;
    metadata: Record<string, unknown>;
  }>;
  error?: string;
}
