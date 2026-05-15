import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getEscrowProvider, createEscrow } from "@/services/escrow";
import { prisma } from "@/lib/db";

// GET /api/escrow — health check, or ?taskId= to fetch escrow + milestones for a task
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");

  if (taskId) {
    const escrow = await prisma.escrow.findFirst({
      where: { taskId },
      include: { milestones: { orderBy: { createdAt: "asc" } } },
    }).catch(() => null);

    if (!escrow) {
      return NextResponse.json({ escrow: null }, { status: 200 });
    }
    return NextResponse.json({ escrow });
  }

  const mode = env.ESCROW_MODE;
  const provider = getEscrowProvider();

  return NextResponse.json({
    mode,
    available: provider !== null,
    adapterType: mode === "live" ? "trustless_work" : mode === "demo" ? "demo" : "none",
  });
}

// POST /api/escrow — create a new escrow for a task
export async function POST(request: NextRequest) {
  if (env.ESCROW_MODE === "disabled") {
    return NextResponse.json(
      { error: "Escrow is disabled. Set ESCROW_MODE=demo or ESCROW_MODE=live to enable." },
      { status: 400 }
    );
  }

  let body: { taskId?: string; payerAddress?: string; totalAmount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { taskId, payerAddress, totalAmount } = body;
  if (!taskId || !payerAddress || totalAmount == null) {
    return NextResponse.json(
      { error: "Missing required fields: taskId, payerAddress, totalAmount" },
      { status: 400 }
    );
  }

  try {
    const result = await createEscrow({ taskId, payerAddress, totalAmount });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
