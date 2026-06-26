import { getStellarWalletBalanceInfo } from "@/lib/wallet";
import { REQUEST_TYPE_SUPPLY } from "./client";
import {
  BlendOperationError,
  runBlendOperation,
  type BlendOperationDescriptor,
} from "./operation";
import type { BlendExecuteInput, BlendOperationResult } from "./types";

/**
 * Supply request descriptor. supply.ts is a thin wrapper — it only declares the
 * Supply request type + supply-specific validation (spend cap + balance). The
 * full transaction lifecycle lives in operation.ts.
 */
const supplyDescriptor: BlendOperationDescriptor = {
  operation: "supply",
  requestType: REQUEST_TYPE_SUPPLY,
  initiatedEvent: "blend_supply_initiated",
  confirmedEvent: "blend_supply_confirmed",
  async prepare({ requested, asset, signerPublicKey, spendCap }) {
    if (requested === "max") {
      throw new BlendOperationError("validation_error", "Supply does not support amount='max'");
    }
    const amount = requested;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      throw new BlendOperationError("validation_error", `Supply amount must be > 0 (got ${amount})`);
    }
    // Spend-cap enforcement (supply consumes cap).
    if (amount > spendCap) {
      throw new BlendOperationError(
        "spend_cap_exceeded",
        `Supply amount ${amount} ${asset} exceeds spend cap ${spendCap}`
      );
    }
    // Balance enforcement — FAIL BEFORE SIGNING.
    let balance: number;
    try {
      balance = Number((await getStellarWalletBalanceInfo(signerPublicKey)).balance);
    } catch (e) {
      throw new BlendOperationError(
        "balance_check_failed",
        `Could not read coordinator wallet balance: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    if (!Number.isFinite(balance) || balance < amount) {
      throw new BlendOperationError(
        "insufficient_balance",
        `Coordinator wallet balance ${balance} ${asset} is insufficient for supply of ${amount} ${asset}`
      );
    }
    return amount;
  },
};

/** Execute a real Blend supply (testnet, server-signed). */
export function executeBlendSupply(input: BlendExecuteInput): Promise<BlendOperationResult> {
  return runBlendOperation(input, supplyDescriptor);
}

// Backwards-compatible error alias (same class as BlendOperationError).
export { BlendOperationError as BlendSupplyError } from "./operation";
