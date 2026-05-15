import { NextRequest, NextResponse } from "next/server";
import { verifyProof } from "@/services/proof";

/**
 * POST /api/proofs/[id]/verify
 *
 * Verify a proven proof record — validates journal against receiptHash and
 * promotes both Proof and ExecutionReceipt to "verified" status.
 *
 * Idempotent: calling on an already-verified proof returns it unchanged.
 *
 * 404 — proof not found
 * 400 — proof not yet proven, or journal integrity failed
 * 200 — proof verified successfully
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const proof = await verifyProof(id);
    return NextResponse.json(proof);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown verification error";
    const isNotFound = message.includes("not found");
    return NextResponse.json({ error: message }, { status: isNotFound ? 404 : 400 });
  }
}
