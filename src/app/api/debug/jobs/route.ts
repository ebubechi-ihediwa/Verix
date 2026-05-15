import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { listRecentJobs } from "@/services/jobs";
import { getRecentLogs } from "@/utils/logger";

function canInspect(request: NextRequest): boolean {
  if (isAdminRequest(request)) return true;
  return env.mode !== "production" && !env.ADMIN_SECRET;
}

export async function GET(request: NextRequest) {
  if (!canInspect(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 25)));

  const [recentJobs, failedJobs] = await Promise.all([
    listRecentJobs(limit),
    listRecentJobs(limit, "failed"),
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    recentJobs,
    failedJobs,
    recentLogs: getRecentLogs(limit),
  });
}
