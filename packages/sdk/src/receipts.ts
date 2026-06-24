import type { VerixClient } from "./client";
import type { AnchorView, ReceiptGetResponse, ReceiptVerifyResponse } from "./types";
import { VerixError } from "./errors";
import { poll } from "./polling";

export interface WaitForAnchorOptions {
  /** Poll interval, ms (default 2000). */
  intervalMs?: number;
  /** Timeout, ms (default 60000). */
  timeoutMs?: number;
}

const ANCHOR_POLL_INTERVAL_MS = 2_000;
const ANCHOR_POLL_TIMEOUT_MS = 60_000;

/** Receipts, proofs, and Soroban anchor — wraps `/api/v1/receipts`. */
export class ReceiptsResource {
  constructor(private readonly client: VerixClient) {}

  /** Fetch a receipt with its proof and Soroban anchor state. */
  async get(receiptHash: string): Promise<ReceiptGetResponse> {
    return this.client.request<ReceiptGetResponse>(
      "GET",
      `/receipts/${encodeURIComponent(receiptHash)}`
    );
  }

  /** Run the deterministic verifier on the receipt's proof (idempotent). */
  async verify(receiptHash: string): Promise<ReceiptVerifyResponse> {
    return this.client.request<ReceiptVerifyResponse>(
      "POST",
      `/receipts/${encodeURIComponent(receiptHash)}/verify`
    );
  }

  /**
   * Wait until the receipt is anchored on Soroban.
   *
   * Returns immediately if already anchored; otherwise polls every 2s (default)
   * and gives up after 60s (default), throwing a VerixError on timeout.
   */
  async waitForAnchor(
    receiptHash: string,
    options: WaitForAnchorOptions = {}
  ): Promise<AnchorView> {
    const intervalMs = options.intervalMs ?? ANCHOR_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? ANCHOR_POLL_TIMEOUT_MS;

    const { value, satisfied } = await poll(
      async () => (await this.get(receiptHash)).anchor,
      {
        until: (anchor) => anchor.status === "anchored",
        intervalMs,
        timeoutMs,
      }
    );

    if (!satisfied) {
      throw new VerixError(
        `Receipt ${receiptHash} was not anchored within ${timeoutMs}ms (status: ${value.status})`,
        { code: "anchor_timeout", body: value }
      );
    }
    return value;
  }
}
