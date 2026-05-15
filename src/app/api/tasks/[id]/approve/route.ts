import { NextRequest, NextResponse } from "next/server";
import { canMutate, forbiddenResponse, getSessionId, unauthorizedResponse } from "@/lib/auth";
import { hashCanonical } from "@/lib/hash";
import { isStellarPublicKey } from "@/lib/stellar-config";
import { updateExecution, getExecution } from "@/services/execution";
import { recordTraceEvent } from "@/services/trace";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = await getExecution(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const sessionId = getSessionId(request);
  if (!sessionId && !request.headers.get("x-admin-token")) {
    return unauthorizedResponse("A session is required to approve task results");
  }
  if (!canMutate(request, task.ownerId)) {
    return forbiddenResponse("You can only approve tasks you created");
  }
  if (task.status !== "completed" || !task.result) {
    return NextResponse.json(
      { error: "Only completed tasks with results can be approved" },
      { status: 400 }
    );
  }
  if (task.approvalStatus === "approved") {
    return NextResponse.json({
      approvalStatus: task.approvalStatus,
      approvedAt: task.approvedAt,
      approvedByWallet: task.approvedByWallet,
      approvalResultHash: task.approvalResultHash,
    });
  }

  let body: { walletAddress?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const walletAddress = body.walletAddress?.trim();
  if (!isStellarPublicKey(walletAddress)) {
    return NextResponse.json(
      { error: "A connected Stellar wallet is required to approve payout release" },
      { status: 400 }
    );
  }
  if (task.walletAddress && walletAddress !== task.walletAddress) {
    return NextResponse.json(
      { error: "Approval wallet must match the task payer wallet" },
      { status: 403 }
    );
  }

  const approvedAt = new Date().toISOString();
  const approvalResultHash = hashCanonical({
    taskId: task.id,
    result: task.result,
    totalCost: task.totalCost ?? null,
  });

  await updateExecution(task.id, {
    approvalStatus: "approved",
    approvedAt,
    approvedByWallet: walletAddress,
    approvalResultHash,
  });

  await recordTraceEvent(
    task.id,
    "result_approved",
    "user",
    `Result approved by payer wallet ${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`,
    {
      outputHash: approvalResultHash,
      metadata: {
        approvedAt,
        approvedByWallet: walletAddress,
        approvalResultHash,
      },
    }
  ).catch(() => { /* non-fatal */ });

  return NextResponse.json({
    approvalStatus: "approved",
    approvedAt,
    approvedByWallet: walletAddress,
    approvalResultHash,
  });
}
