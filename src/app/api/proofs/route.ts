import { NextRequest, NextResponse } from "next/server";
import { getProofByTask } from "@/services/proof";

// GET /api/proofs?taskId=... — fetch proof record by task ID
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "taskId query param required" }, { status: 400 });
  }

  const proof = await getProofByTask(taskId);
  if (!proof) {
    return NextResponse.json({ error: "No proof found for this task" }, { status: 404 });
  }

  return NextResponse.json(proof);
}
