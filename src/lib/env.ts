export type RuntimeMode = "demo" | "local" | "production";

export const DEFAULT_ENCRYPTION_SECRET = "default-dev-key-change-in-production!!";

type RuntimeProfile = {
  mode: RuntimeMode;
  databaseUrl: string;
  encryptionSecret: string;
  mockedComponents: string[];
};

let cachedProfile: RuntimeProfile | null = null;

function normalizeMode(value: string | undefined): RuntimeMode {
  const raw = (value || "").trim().toLowerCase();

  if (!raw) {
    return process.env.NODE_ENV === "production" ? "production" : "local";
  }

  if (raw === "demo" || raw === "local" || raw === "production") {
    return raw;
  }

  throw new Error(
    `invalid 'VERIX_MODE': '${value}'. expected one of: demo, local, production`
  );
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  if (name === "DATABASE_URL") {
    throw new Error(
      "missing 'DATABASE_URL'. create .env.local and set DATABASE_URL (example: postgresql://USER:PASSWORD@HOST:5432/DB?schema=public)"
    );
  }

  throw new Error(`missing '${name}' in environment`);
}

function resolveMockedComponents(mode: RuntimeMode): string[] {
  const mocked = new Set<string>();

  if (!process.env.OPENAI_API_KEY?.trim()) {
    mocked.add("openai");
  }
  if (!process.env.CLAUDE_API_KEY?.trim()) {
    mocked.add("claude");
  }
  if (!process.env.COORDINATOR_PRIVATE_KEY?.trim()) {
    mocked.add("payments");
  }

  if (mode === "production") {
    mocked.delete("payments");
  }

  return Array.from(mocked);
}

function buildProfile(): RuntimeProfile {
  const mode = normalizeMode(process.env.VERIX_MODE);
  const databaseUrl = readRequiredEnv("DATABASE_URL");
  const encryptionSecret = (
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    DEFAULT_ENCRYPTION_SECRET
  ).trim();

  if (mode === "production" && encryptionSecret === DEFAULT_ENCRYPTION_SECRET) {
    throw new Error(
      "production mode cannot use the default encryption secret. set ENCRYPTION_KEY (preferred) or JWT_SECRET"
    );
  }

  return {
    mode,
    databaseUrl,
    encryptionSecret,
    mockedComponents: resolveMockedComponents(mode),
  };
}

export function getRuntimeProfile(): RuntimeProfile {
  if (!cachedProfile) {
    cachedProfile = buildProfile();
  }
  return cachedProfile;
}

export function getRuntimeMode(): RuntimeMode {
  return getRuntimeProfile().mode;
}

export function getDatabaseUrl(): string {
  return getRuntimeProfile().databaseUrl;
}

export function getEncryptionSecret(): string {
  return getRuntimeProfile().encryptionSecret;
}

export function getMockedComponents(): string[] {
  return getRuntimeProfile().mockedComponents;
}
