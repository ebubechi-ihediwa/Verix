import { NextRequest, NextResponse } from "next/server";
import { syncEscrowStatus } from "@/services/escrow";
import { recordTraceEvent } from "@/services/trace";
import { prisma } from "@/lib/db";

// POST /api/escrow/[id]/sync — manually refresh local escrow state from provider
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const result = await syncEscrowStatus(id);

  if (result.error && !result.escrow) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  // Record a trace event for sync failures so they are visible in the dashboard
  if (result.error && result.escrow) {
    recordTraceEvent(
      result.escrow.taskId,
      "escrow_sync_failed",
      "system",
      `Escrow sync failed for escrow ${id}: ${result.error}`,
      { metadata: { escrowId: id, error: result.error } }
    ).catch(() => { /* trace write failure is non-fatal */ });
  }

  return NextResponse.json({
    escrowId: id,
    synced: result.synced,
    status: result.escrow?.status ?? null,
    milestoneCount: result.escrow?.milestones?.length ?? 0,
    error: result.error ?? null,
  });
}

// GET /api/escrow/[id]/sync — return current local escrow state without syncing
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const escrow = await prisma.escrow.findUnique({
    where: { id },
    include: { milestones: { orderBy: { createdAt: "asc" } } },
  }).catch(() => null);

  if (!escrow) {
    return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
  }

  return NextResponse.json(escrow);
}
