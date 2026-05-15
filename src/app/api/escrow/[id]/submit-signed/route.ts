import { NextRequest, NextResponse } from "next/server";
import { submitSignedEscrowTransaction } from "@/services/escrow";
import { prisma } from "@/lib/db";
import { EscrowSignaturePhase } from "@/types/escrow";
import { executeCoordinator } from "@/services/coordinator";
import { getExecution, startExecution } from "@/services/execution";

const VALID_PHASES: EscrowSignaturePhase[] = ["create", "fund"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { signedXdr?: string; phase?: EscrowSignaturePhase; signerAddress?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const signedXdr = body.signedXdr?.trim();
  const phase = body.phase;
  if (!signedXdr || !phase || !VALID_PHASES.includes(phase)) {
    return NextResponse.json(
      { error: "Missing required fields: signedXdr and phase=create|fund" },
      { status: 400 }
    );
  }

  try {
    const escrow = await prisma.escrow.findUnique({
      where: { id },
      select: { payerAddress: true, taskId: true },
    });
    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }
    if (body.signerAddress && body.signerAddress !== escrow.payerAddress) {
      return NextResponse.json(
        { error: "Signed transaction signer does not match escrow payer wallet" },
        { status: 403 }
      );
    }

    const result = await submitSignedEscrowTransaction(id, signedXdr, phase);
    if (phase === "fund" && result.status === "funded") {
      const task = await getExecution(escrow.taskId);
      if (task?.status === "funding_pending") {
        await startExecution(task, executeCoordinator, "coordinator_execution_resume");
      }
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown signed transaction error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
