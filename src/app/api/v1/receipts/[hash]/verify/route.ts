import { NextRequest, NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/v1-auth";
import { verifyReceiptForProject } from "@/lib/v1-executions";

const HASH_RE = /^[0-9a-f]{64}$/;

/**
 * POST /api/v1/receipts/:hash/verify
 *
 * Runs the existing deterministic verifier against the proof backing this
 * receipt (idempotent). Project-scoped: a receipt not owned by the caller's
 * project returns 404 with no existence leak.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  const { hash } = await params;
  if (!HASH_RE.test(hash)) {
    return NextResponse.json(
      { error: "receiptHash must be a 64-character lowercase hex SHA-256" },
      { status: 400 }
    );
  }

  const result = await verifyReceiptForProject(auth.context.project.id, hash);
  if (!result) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  return NextResponse.json(result);
}
