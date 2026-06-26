import { NextRequest, NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/v1-auth";
import { resumeExecution } from "@/services/coordinator";

/**
 * POST /api/v1/executions/:id/resume
 *
 * Resume a paused wallet-mode execution by submitting the user's signed XDR.
 * Project-scoped + idempotent: a duplicate resume returns the existing state
 * without resubmitting. Continues submit → confirm → receipt → proof → anchor.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: { signedXdr?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const signedXdr = typeof body.signedXdr === "string" ? body.signedXdr.trim() : "";
  if (!signedXdr) {
    return NextResponse.json({ error: "signedXdr is required" }, { status: 422 });
  }

  let outcome;
  try {
    outcome = await resumeExecution(auth.context.project.id, id, signedXdr);
  } catch (e) {
    return NextResponse.json(
      { error: `Resume failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  switch (outcome.kind) {
    case "not_found":
      return NextResponse.json({ error: "No signature request for this execution" }, { status: 404 });
    case "expired":
      return NextResponse.json({ error: "Signature request has expired" }, { status: 409 });
    case "not_awaiting":
      return NextResponse.json({ error: "Execution is not awaiting a signature" }, { status: 409 });
    case "already":
      // Idempotent: already resumed / in progress.
      return NextResponse.json({
        execution: { id, status: "already_resumed", signatureStatus: outcome.status, txHash: outcome.txHash },
      });
    case "resumed":
      return NextResponse.json({
        execution: { id, status: "resumed", txHash: outcome.txHash },
      });
  }
}
