import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/escrow/[id] — fetch a single escrow with its milestones
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
