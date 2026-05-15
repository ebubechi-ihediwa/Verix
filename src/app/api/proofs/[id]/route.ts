import { NextRequest, NextResponse } from "next/server";
import { getProof } from "@/services/proof";

// GET /api/proofs/[id] — fetch a single proof record
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const proof = await getProof(id);
  if (!proof) {
    return NextResponse.json({ error: "Proof not found" }, { status: 404 });
  }

  return NextResponse.json(proof);
}
