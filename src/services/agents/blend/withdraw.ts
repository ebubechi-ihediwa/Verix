import { REQUEST_TYPE_WITHDRAW, loadUserPosition } from "./client";
import {
  BlendOperationError,
  runBlendOperation,
  type BlendOperationDescriptor,
} from "./operation";
import type { BlendExecuteInput, BlendOperationResult } from "./types";

/**
 * Withdraw request descriptor. withdraw.ts is a thin wrapper — it only declares
 * the Withdraw request type + withdraw-specific validation (load position,
 * resolve "max", reject over-withdraw). Withdraw does NOT consume spend cap.
 * The full transaction lifecycle lives in operation.ts.
 */
const withdrawDescriptor: BlendOperationDescriptor = {
  operation: "withdraw",
  requestType: REQUEST_TYPE_WITHDRAW,
  initiatedEvent: "blend_withdraw_initiated",
  confirmedEvent: "blend_withdraw_confirmed",
  async prepare({ requested, asset, poolId, signerPublicKey }) {
    // Load the on-chain position to bound the withdrawal (and resolve "max").
    let position;
    try {
      position = await loadUserPosition(poolId, signerPublicKey);
    } catch (e) {
      throw new BlendOperationError(
        "position_read_failed",
        `Could not read Blend position: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const amount = requested === "max" ? position.withdrawable : requested;

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      throw new BlendOperationError(
        "validation_error",
        `Withdraw amount must be > 0 (got ${amount}; position withdrawable ${position.withdrawable} ${asset})`
      );
    }
    // Reject withdrawals larger than the current position. NO spend-cap check.
    if (amount > position.withdrawable) {
      throw new BlendOperationError(
        "insufficient_position",
        `Withdraw amount ${amount} ${asset} exceeds withdrawable position ${position.withdrawable} ${asset}`
      );
    }
    return amount;
  },
};

/** Execute a real Blend withdraw (testnet, server-signed). */
export function executeBlendWithdraw(input: BlendExecuteInput): Promise<BlendOperationResult> {
  return runBlendOperation(input, withdrawDescriptor);
}

// Backwards-compatible error alias (same class as BlendOperationError).
export { BlendOperationError as BlendWithdrawError } from "./operation";
