import { errorFromResponse, VerixError } from "./errors";

export interface VerixOptions {
  /** Project API key — `vx_test_...` or `vx_live_...`. */
  apiKey: string;
  /** API base URL. Defaults to https://api.verix.xyz. */
  baseUrl?: string;
  /** Per-request timeout in ms (default 30000). */
  timeoutMs?: number;
  /** Override the fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.verix.xyz";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Minimal HTTP transport for the Verix `/api/v1` gateway. Bearer-authenticated,
 * JSON in/out, native fetch, zero runtime dependencies. Non-2xx responses are
 * thrown as typed VerixErrors.
 */
export class VerixClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VerixOptions) {
    if (!options?.apiKey) {
      throw new VerixError("A Verix apiKey is required", { code: "config_error" });
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new VerixError(
        "No fetch implementation found. Use Node 18+ or pass `fetch` in options.",
        { code: "config_error" }
      );
    }
    this.fetchImpl = f;
  }

  /** Perform a JSON request against `/api/v1{path}` and return the parsed body. */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new VerixError(`Request timed out after ${this.timeoutMs}ms`, {
          code: "timeout",
        });
      }
      throw new VerixError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
        { code: "network_error" }
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const parsed: unknown = text ? safeJson(text) : undefined;

    if (!res.ok) {
      throw errorFromResponse(res.status, parsed);
    }
    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
