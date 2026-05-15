/**
 * Centralized environment variable access with startup validation.
 *
 * Import `env` from this module instead of reading process.env directly.
 *
 * Three modes (set APP_MODE explicitly or let it auto-detect):
 *   demo        — no DATABASE_URL or wallet keys required; all blockchain/DB ops are mocked.
 *   local       — DATABASE_URL required; AI + blockchain keys are optional (fall back to mock).
 *   production  — DATABASE_URL, ENCRYPTION_KEY, and all wallet keys are required; no defaults.
 *
 * Auto-detection rules (when APP_MODE is not set):
 *   NODE_ENV=production → production
 *   DATABASE_URL present → local
 *   otherwise           → demo
 */

export type AppMode = "demo" | "local" | "production";

// Sentinel used as a dev-only fallback so the value is always a string.
// Blocked in production mode.
const DEV_ENCRYPTION_SENTINEL = "dev-insecure-default-do-not-use-in-production";

const DEFAULT_STELLAR_HORIZON = "https://horizon-testnet.stellar.org";
const DEFAULT_SOROBAN_RPC = "https://soroban-testnet.stellar.org";
const DEFAULT_STELLAR_EXPLORER = "https://stellar.expert/explorer/testnet";
const DEFAULT_STELLAR_PASSPHRASE = "Test SDF Network ; September 2015";

function detectMode(): AppMode {
  const explicit = process.env.APP_MODE;
  if (explicit === "demo" || explicit === "local" || explicit === "production") {
    return explicit;
  }
  if (process.env.NODE_ENV === "production") return "production";
  if (!process.env.DATABASE_URL) return "demo";
  return "local";
}

function missingVar(name: string, mode: AppMode): never {
  throw new Error(
    `\n` +
    `╔══════════════════════════════════════════════════════╗\n` +
    `║  Missing required environment variable               ║\n` +
    `╠══════════════════════════════════════════════════════╣\n` +
    `║  Variable : ${name.padEnd(38)}║\n` +
    `║  Mode     : ${mode.padEnd(38)}║\n` +
    `╠══════════════════════════════════════════════════════╣\n` +
    `║  Fix: add  ${name}=<value>  to .env.local           \n` +
    `║  Or run in demo mode:  APP_MODE=demo npm run dev    \n` +
    `╚══════════════════════════════════════════════════════╝\n`
  );
}

function requireVar(name: string, mode: AppMode): string {
  const val = process.env[name];
  if (!val) missingVar(name, mode);
  return val as string;
}

function buildEnv() {
  const mode = detectMode();
  const isProd = mode === "production";
  const isDemo = mode === "demo";

  // Production-only hard guards (checked before any requireVar calls)
  if (isProd) {
    const encKey = process.env.ENCRYPTION_KEY;
    if (!encKey || encKey === DEV_ENCRYPTION_SENTINEL) {
      throw new Error(
        `\n[env] ENCRYPTION_KEY must be a strong secret in production mode.\n` +
        `  Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\n` +
        `  Then set ENCRYPTION_KEY=<that value> in your deployment environment.\n`
      );
    }
  }

  return {
    /** Active configuration mode. */
    mode,

    /**
     * PostgreSQL connection string for Prisma.
     * Required in local + production; undefined in demo mode.
     */
    DATABASE_URL: isDemo
      ? process.env.DATABASE_URL
      : requireVar("DATABASE_URL", mode),

    /**
     * 32-byte hex key for AES-256-GCM field encryption.
     * Never has a usable default in production — caught by the guard above.
     */
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? (isProd ? "" : DEV_ENCRYPTION_SENTINEL),

    // ── AI APIs — always optional; service layer falls back to mock ──────────

    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",

    // ── Blockchain ───────────────────────────────────────────────────────────

    STELLAR_NETWORK: (process.env.STELLAR_NETWORK ?? "testnet") as "testnet" | "mainnet",
    STELLAR_HORIZON_URL: process.env.STELLAR_HORIZON_URL ?? DEFAULT_STELLAR_HORIZON,
    SOROBAN_RPC_URL: process.env.SOROBAN_RPC_URL ?? DEFAULT_SOROBAN_RPC,
    STELLAR_NETWORK_PASSPHRASE: process.env.STELLAR_NETWORK_PASSPHRASE ?? DEFAULT_STELLAR_PASSPHRASE,
    STELLAR_EXPLORER_URL: process.env.STELLAR_EXPLORER_URL ?? DEFAULT_STELLAR_EXPLORER,
    STELLAR_USDC_CODE: process.env.STELLAR_USDC_CODE ?? "USDC",
    STELLAR_USDC_ISSUER: process.env.STELLAR_USDC_ISSUER,
    SOROBAN_AGENT_REGISTRY_CONTRACT_ID: process.env.SOROBAN_AGENT_REGISTRY_CONTRACT_ID,
    SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID: process.env.SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID,

    // ── Wallets — required in production; optional in demo/local ─────────────

    COORDINATOR_STELLAR_PUBLIC_KEY: isProd
      ? requireVar("COORDINATOR_STELLAR_PUBLIC_KEY", mode)
      : process.env.COORDINATOR_STELLAR_PUBLIC_KEY,

    CODE_AUDITOR_STELLAR_PUBLIC_KEY: process.env.CODE_AUDITOR_STELLAR_PUBLIC_KEY,
    MARKET_ANALYST_STELLAR_PUBLIC_KEY: process.env.MARKET_ANALYST_STELLAR_PUBLIC_KEY,
    CREATIVE_WRITER_STELLAR_PUBLIC_KEY: process.env.CREATIVE_WRITER_STELLAR_PUBLIC_KEY,

    /**
     * Optional secret that grants admin-level access to mutating APIs via
     * the X-Admin-Token request header. Useful for judge demos and manual
     * cleanup. If unset, only session-based ownership is enforced.
     */
    ADMIN_SECRET: process.env.ADMIN_SECRET,

    // ── Escrow ───────────────────────────────────────────────────────────────

    /**
     * Controls which escrow path is active:
     *   "disabled" — skips escrow entirely; coordinator uses direct USDC transfer (current default)
     *   "demo"     — uses the in-process DemoEscrowAdapter with deterministic fake IDs
     *   "live"     — calls the Trustless Work API at TRUSTLESS_WORK_API_URL
     */
    ESCROW_MODE: (process.env.ESCROW_MODE ?? "disabled") as "disabled" | "demo" | "live",

    /** Base URL for the Trustless Work REST API (required when ESCROW_MODE=live). */
    TRUSTLESS_WORK_API_URL: process.env.TRUSTLESS_WORK_API_URL,

    /** API key for Trustless Work (required when ESCROW_MODE=live). */
    TRUSTLESS_WORK_API_KEY: process.env.TRUSTLESS_WORK_API_KEY,

    /**
     * Stellar signer address used as releaseSigner when calling TW release-funds.
     * Typically the TW key ID (e.g. "RL_ZDxkj7Rf…"). Maps to TRUSTLESS_WORK_KEY_ID in .env.
     */
    TRUSTLESS_WORK_SIGNER_ADDRESS: process.env.TRUSTLESS_WORK_SIGNER_ADDRESS ?? process.env.TRUSTLESS_WORK_KEY_ID,
    TRUSTLESS_WORK_ESCROW_TYPE: (process.env.TRUSTLESS_WORK_ESCROW_TYPE ?? "multi-release") as "single-release" | "multi-release",
    TRUSTLESS_WORK_SIGNING_MODE: (process.env.TRUSTLESS_WORK_SIGNING_MODE ?? "server") as "server" | "wallet",

    // ── Proof ─────────────────────────────────────────────────────────────────

    /**
     * Controls which proof backend is used:
     *   "disabled" — no proof generation; receipt stays at "proof_ready" status
     *   "local"    — runs the TypeScript deterministic verifier in-process
     *
     * Proof verification automatically triggers Trustless Work escrow milestone
     * release for milestones with releaseCondition === "proof_verified".
     */
    PROOF_MODE: (process.env.PROOF_MODE ?? "local") as "disabled" | "local",

    /**
     * Maximum concurrent specialist AI calls per coordinator run. Defaults to 1 (sequential).
     * Payments always run sequentially regardless of this setting.
     */
    COORDINATOR_CONCURRENCY_LIMIT: Math.max(1, parseInt(process.env.COORDINATOR_CONCURRENCY_LIMIT ?? "1", 10) || 1),
  } as const;
}

export const env = buildEnv();

export const isDemo = () => env.mode === "demo";
export const isLocal = () => env.mode === "local";
export const isProd = () => env.mode === "production";
