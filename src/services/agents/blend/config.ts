import { env } from "@/lib/env";
import type { BlendAgentSettings, BlendNetwork, BlendPoolEntry } from "./types";

/**
 * Blend configuration: the vetted pool allowlist + network resolution.
 *
 * Funds are NEVER routed to a pool that is not on this allowlist (security:
 * pool authenticity — see BLEND-INTEGRATION-SPEC Part 6). The allowlist can be
 * overridden via the BLEND_POOLS env JSON; otherwise the built-in defaults apply.
 */

const DEFAULT_ALLOWLIST: Record<BlendNetwork, BlendPoolEntry[]> = {
  // Known Blend testnet pools (carried from services/defi/blend-agent.ts).
  testnet: [
    { asset: "USDC", poolId: "CCMZ5BNMXXQYJMR7UAZQB5J2GGU5GVQQY6MZQQKNABHJMSDXFMYV6YZ", name: "USDC Lending Pool" },
    { asset: "XLM", poolId: "CCKDJ3CAASNXDH5BMVPZV4WOE4YGDFJZPGMHCTQH67V6K7EJEFVNXLY", name: "XLM Lending Pool" },
  ],
  // Mainnet pools must be supplied explicitly via BLEND_POOLS — no defaults
  // (we will not ship unverified mainnet contract ids).
  mainnet: [],
};

const DEFAULT_API_URL: Record<BlendNetwork, string> = {
  testnet: "https://blend.testnet.stellar.org",
  mainnet: "https://api.blend.capital",
};

/** The network whose allowlist drives discovery/selection. */
export function resolveBlendNetwork(): BlendNetwork {
  return env.BLEND_NETWORK;
}

/** Blend rates API base URL for the active network (env override wins). */
export function blendApiBaseUrl(network: BlendNetwork = resolveBlendNetwork()): string {
  return env.BLEND_API_URL ?? DEFAULT_API_URL[network];
}

function parseEnvAllowlist(): Partial<Record<BlendNetwork, BlendPoolEntry[]>> | null {
  if (!env.BLEND_POOLS) return null;
  try {
    const parsed = JSON.parse(env.BLEND_POOLS) as Partial<Record<BlendNetwork, BlendPoolEntry[]>>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    console.warn("[blend] BLEND_POOLS is not valid JSON — falling back to built-in allowlist");
    return null;
  }
}

/** The vetted pool allowlist for a network (BLEND_POOLS override or defaults). */
export function getPoolAllowlist(network: BlendNetwork = resolveBlendNetwork()): BlendPoolEntry[] {
  const override = parseEnvAllowlist();
  const entries = override?.[network] ?? DEFAULT_ALLOWLIST[network];
  return entries.filter((e) => e && typeof e.poolId === "string" && typeof e.asset === "string");
}

export function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase();
}

/** True when `asset` has a vetted pool on `network`. */
export function isSupportedAsset(
  asset: string,
  network: BlendNetwork = resolveBlendNetwork()
): boolean {
  const target = normalizeAsset(asset);
  return getPoolAllowlist(network).some((e) => normalizeAsset(e.asset) === target);
}

/** Allowlisted pool entries for a single asset on a network. */
export function poolsForAsset(
  asset: string,
  network: BlendNetwork = resolveBlendNetwork()
): BlendPoolEntry[] {
  const target = normalizeAsset(asset);
  return getPoolAllowlist(network).filter((e) => normalizeAsset(e.asset) === target);
}

/**
 * Reserve asset SAC (Stellar Asset Contract) id for an asset, from the vetted
 * allowlist. Undefined when not configured — supply must fail before signing
 * rather than guess a contract id.
 */
export function getAssetContractId(
  asset: string,
  network: BlendNetwork = resolveBlendNetwork()
): string | undefined {
  const entry = poolsForAsset(asset, network).find((e) => e.assetContractId);
  return entry?.assetContractId;
}

/**
 * Parse + validate the agent's Blend settings from Specialist.config.settings.
 * Discovery (7A) only needs `asset` and optional `minApy`; `amount`/`operation`
 * are parsed leniently for later sprints. Throws on clearly invalid values.
 */
export function parseBlendSettings(config: Record<string, unknown> | null): BlendAgentSettings {
  const cfg = config ?? {};

  const rawAsset = typeof cfg.asset === "string" && cfg.asset.trim() ? cfg.asset : "USDC";
  const asset = normalizeAsset(rawAsset);

  let minApy: number | undefined;
  if (cfg.minApy !== undefined) {
    const n = Number(cfg.minApy);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      throw new Error(`Invalid minApy: ${String(cfg.minApy)} (expected a fraction between 0 and 1)`);
    }
    minApy = n;
  }

  let amount: number | "max" | undefined;
  if (typeof cfg.amount === "string" && cfg.amount.trim().toLowerCase() === "max") {
    amount = "max";
  } else if (cfg.amount !== undefined) {
    const n = Number(cfg.amount);
    if (Number.isFinite(n) && n > 0) amount = n;
  }

  const operation =
    cfg.operation === "supply" || cfg.operation === "withdraw" ? cfg.operation : undefined;

  return { asset, minApy, amount, operation };
}
