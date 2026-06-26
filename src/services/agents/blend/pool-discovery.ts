import {
  blendApiBaseUrl,
  getPoolAllowlist,
  isSupportedAsset,
  normalizeAsset,
  poolsForAsset,
  resolveBlendNetwork,
} from "./config";
import type {
  BlendNetwork,
  BlendPool,
  BlendPoolEntry,
  PoolSelectionResult,
  SelectedPool,
  SelectPoolInput,
} from "./types";

/**
 * Blend pool discovery (Sprint 7A) — read-only. Resolves live market data for
 * the vetted allowlist, with a deterministic mock fallback when the Blend API
 * is unreachable (testnet/local). No funds move; no transactions are built.
 */

interface MockProfile {
  apy: number; // fraction
  utilization: number; // 0..1
  totalSupply: number; // pool asset units
}

// Deterministic mock profiles (NO randomness — stable traces/receipts/tests).
const MOCK_PROFILES: Record<string, MockProfile> = {
  USDC: { apy: 0.0524, utilization: 0.71, totalSupply: 1_500_000 },
  XLM: { apy: 0.0302, utilization: 0.58, totalSupply: 850_000 },
};
const DEFAULT_MOCK: MockProfile = { apy: 0.04, utilization: 0.5, totalSupply: 500_000 };

function mockPool(entry: BlendPoolEntry): BlendPool {
  const p = MOCK_PROFILES[normalizeAsset(entry.asset)] ?? DEFAULT_MOCK;
  const totalBorrow = p.totalSupply * p.utilization;
  return {
    poolId: entry.poolId,
    asset: normalizeAsset(entry.asset),
    name: entry.name,
    apy: p.apy,
    liquidity: p.totalSupply,
    utilization: p.utilization,
    reserve: {
      totalSupply: p.totalSupply,
      totalBorrow,
      availableLiquidity: p.totalSupply - totalBorrow,
    },
    source: "mock",
    fetchedAt: new Date().toISOString(),
  };
}

/** Best-effort live fetch of one pool's rates; returns null on any failure. */
async function fetchLivePool(
  entry: BlendPoolEntry,
  network: BlendNetwork
): Promise<BlendPool | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${blendApiBaseUrl(network).replace(/\/$/, "")}/v1/pools/${entry.poolId}/rates`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    const apy = Number(data.supply_apy ?? data.supplyApy);
    const utilization = Number(data.utilization ?? 0);
    const totalSupply = Number(data.total_supply ?? data.totalSupply ?? 0);
    const totalBorrow = Number(data.total_borrow ?? data.totalBorrow ?? totalSupply * utilization);
    if (!Number.isFinite(apy)) return null;

    return {
      poolId: entry.poolId,
      asset: normalizeAsset(entry.asset),
      name: entry.name,
      apy,
      liquidity: Number.isFinite(totalSupply) ? totalSupply : 0,
      utilization: Number.isFinite(utilization) ? utilization : 0,
      reserve: {
        totalSupply: Number.isFinite(totalSupply) ? totalSupply : 0,
        totalBorrow: Number.isFinite(totalBorrow) ? totalBorrow : 0,
        availableLiquidity: Math.max(0, (totalSupply || 0) - (totalBorrow || 0)),
      },
      source: "live",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface GetPoolsOptions {
  network?: BlendNetwork;
  /** Restrict discovery to a single asset (allowlisted). */
  asset?: string;
}

/**
 * Discover Blend pools from the vetted allowlist with live data (mock fallback).
 * Returns pools sorted by APY descending.
 */
export async function getPools(options: GetPoolsOptions = {}): Promise<BlendPool[]> {
  const network = options.network ?? resolveBlendNetwork();
  const entries = options.asset
    ? poolsForAsset(options.asset, network)
    : getPoolAllowlist(network);

  const pools = await Promise.all(
    entries.map(async (entry) => (await fetchLivePool(entry, network)) ?? mockPool(entry))
  );
  return pools.sort((a, b) => b.apy - a.apy);
}

/**
 * Pick the best pool for an asset: highest APY wins, subject to minApy.
 * Pure + deterministic — does not touch the network.
 */
export function selectBestPool(pools: BlendPool[], input: SelectPoolInput): PoolSelectionResult {
  const asset = normalizeAsset(input.asset);

  if (!isSupportedAsset(asset)) {
    return { selected: null, reason: "unsupported_asset" };
  }

  const candidates = pools
    .filter((p) => normalizeAsset(p.asset) === asset)
    .sort((a, b) => b.apy - a.apy);

  if (candidates.length === 0) {
    return { selected: null, reason: "no_pools_available" };
  }

  const best = candidates[0];
  const bestConsidered: SelectedPool = {
    poolId: best.poolId,
    asset: best.asset,
    apy: best.apy,
    liquidity: best.liquidity,
  };

  if (input.minApy !== undefined && best.apy < input.minApy) {
    return { selected: null, reason: "apy_below_minimum", bestConsidered };
  }

  return { selected: bestConsidered, bestConsidered };
}
