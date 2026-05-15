import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { fetchWithTimeout } from "@/lib/timeout";

type DependencyStatus = {
  status: "online" | "degraded" | "disabled";
  detail?: string;
};

async function checkDb(): Promise<DependencyStatus> {
  if (!env.DATABASE_URL) return { status: "disabled", detail: "DATABASE_URL not configured" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "online" };
  } catch (err) {
    return { status: "degraded", detail: err instanceof Error ? err.message : "DB check failed" };
  }
}

async function checkHttp(name: string, url?: string): Promise<DependencyStatus> {
  if (!url) return { status: "disabled", detail: `${name} URL not configured` };
  try {
    const response = await fetchWithTimeout(url, { method: "GET" }, 2500, `${name} health`);
    return response.ok || response.status < 500
      ? { status: "online", detail: `HTTP ${response.status}` }
      : { status: "degraded", detail: `HTTP ${response.status}` };
  } catch (err) {
    return { status: "degraded", detail: err instanceof Error ? err.message : `${name} unavailable` };
  }
}

export async function GET() {
  const services = {
    database: await checkDb(),
    stellarHorizon: await checkHttp("Stellar Horizon", env.STELLAR_HORIZON_URL),
    sorobanRpc: await checkHttp("Soroban RPC", env.SOROBAN_RPC_URL),
    escrow: env.ESCROW_MODE === "live"
      ? {
          status: env.TRUSTLESS_WORK_API_URL && env.TRUSTLESS_WORK_API_KEY ? "online" : "degraded",
          detail: env.TRUSTLESS_WORK_API_URL ? "Trustless Work live mode configured" : "TRUSTLESS_WORK_API_URL missing",
        } satisfies DependencyStatus
      : { status: env.ESCROW_MODE === "disabled" ? "disabled" : "online", detail: `ESCROW_MODE=${env.ESCROW_MODE}` } satisfies DependencyStatus,
    proof: { status: env.PROOF_MODE === "disabled" ? "disabled" : "online", detail: `PROOF_MODE=${env.PROOF_MODE}` } satisfies DependencyStatus,
    demoFallbacks: { status: env.DEMO_FALLBACKS_ENABLED ? "online" : "disabled" } satisfies DependencyStatus,
  };

  const degraded = Object.values(services).some((service) => service.status === "degraded");

  return NextResponse.json({
    status: degraded ? "degraded" : "healthy",
    timestamp: new Date().toISOString(),
    services,
  });
}
