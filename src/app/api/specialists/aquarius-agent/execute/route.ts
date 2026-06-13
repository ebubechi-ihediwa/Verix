import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runAquariusAgent } from "@/services/defi";
import { AquariusAgentInput, DeFiAgentContext } from "@/services/defi/types";

export async function POST(request: NextRequest) {
  let body: { taskId?: string; subtaskId?: string; walletAddress?: string; spendCap?: number; input?: AquariusAgentInput };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { taskId, subtaskId, walletAddress, spendCap = 10, input } = body;
  if (!taskId || !input?.action) {
    return NextResponse.json({ error: "taskId and input.action are required" }, { status: 400 });
  }

  const ctx: DeFiAgentContext = {
    taskId,
    subtaskId: subtaskId ?? taskId,
    agentName: "AquariusLiquidityAgent",
    walletAddress,
    spendCap,
    stellarNetwork: env.STELLAR_NETWORK,
  };

  const result = await runAquariusAgent(input, ctx);
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
