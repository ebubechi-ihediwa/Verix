import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { stellarTxExplorerUrl } from "@/lib/stellar-config";
import { ExecutionReceipt } from "@/types/trace";

export interface ReceiptAnchorResult {
  anchored: boolean;
  contractId?: string;
  txHash?: string;
  explorerUrl?: string;
  reason?: string;
}

// Max ledgers to wait for transaction confirmation (roughly 30 seconds at 5s/ledger)
const POLL_MAX_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 3000;

/**
 * Convert a 64-char hex string (SHA-256 output) into a 32-byte Buffer.
 */
function hexToBytes32(hex: string): Buffer {
  if (hex.length !== 64) throw new Error(`Expected 64-char hex, got ${hex.length}`);
  return Buffer.from(hex, "hex");
}

/**
 * Anchor a verified receipt on-chain via the Soroban receipt_anchor contract.
 *
 * Requires:
 *   SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID — deployed contract address (C...)
 *   COORDINATOR_STELLAR_PRIVATE_KEY    — coordinator keypair (must be both admin and verifier)
 *   SOROBAN_RPC_URL                    — Soroban JSON-RPC endpoint
 *   STELLAR_NETWORK_PASSPHRASE         — network passphrase for signing
 *
 * Falls back gracefully (no throw) when any of the above are missing or the
 * contract is not deployed, so demo/local mode still works without blockchain config.
 */
export async function anchorVerifiedReceipt(receipt: ExecutionReceipt): Promise<ReceiptAnchorResult> {
  const contractId = env.SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID;
  if (!contractId) {
    return { anchored: false, reason: "SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID is not configured" };
  }

  const privateKey = env.COORDINATOR_STELLAR_PRIVATE_KEY;
  if (!privateKey) {
    return { anchored: false, reason: "COORDINATOR_STELLAR_PRIVATE_KEY is not configured — cannot sign anchor transaction" };
  }

  const sorobanRpcUrl = env.SOROBAN_RPC_URL;
  const networkPassphrase = env.STELLAR_NETWORK_PASSPHRASE;

  try {
    const {
      rpc,
      Contract,
      TransactionBuilder,
      Keypair,
      Networks,
      nativeToScVal,
      xdr,
    } = await import("@stellar/stellar-sdk");

    const keypair = Keypair.fromSecret(privateKey);
    const publicKey = keypair.publicKey();
    const server = new rpc.Server(sorobanRpcUrl, { allowHttp: sorobanRpcUrl.startsWith("http://") });
    const contract = new Contract(contractId);

    // Fetch coordinator account for sequence number
    const account = await server.getAccount(publicKey);

    // Build the anchor_receipt contract call arguments
    // receipt_hash: BytesN<32>, task_id_hash: BytesN<32>, trace_root: BytesN<32>, proof_ref: String
    const receiptHashBytes = hexToBytes32(receipt.receiptHash);
    const taskIdHashBytes = hexToBytes32(receipt.taskInputHash);
    const traceRootBytes = hexToBytes32(receipt.traceRoot);

    const coordinatorAddress = nativeToScVal(publicKey, { type: "address" });
    const receiptHashVal = xdr.ScVal.scvBytes(receiptHashBytes);
    const taskIdHashVal = xdr.ScVal.scvBytes(taskIdHashBytes);
    const traceRootVal = xdr.ScVal.scvBytes(traceRootBytes);
    const proofRefVal = xdr.ScVal.scvString(
      receipt.taskId.slice(0, 64) // proof_ref: short task ID reference
    );

    const networkPassphraseResolved =
      networkPassphrase ||
      (env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET);

    const tx = new TransactionBuilder(account, {
      fee: "100000", // 0.01 XLM base fee — simulation will adjust
      networkPassphrase: networkPassphraseResolved,
    })
      .addOperation(
        contract.call(
          "anchor_receipt",
          coordinatorAddress,
          receiptHashVal,
          taskIdHashVal,
          traceRootVal,
          proofRefVal,
        )
      )
      .setTimeout(60)
      .build();

    // Simulate to get footprint and resource estimates
    const simResult = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simResult)) {
      const errMsg = simResult.error ?? "Simulation failed";
      // "receipt already anchored" is a panic from the contract — treat as idempotent success
      if (errMsg.includes("already anchored")) {
        const existing = await getExistingAnchorTxHash(receipt);
        return {
          anchored: true,
          contractId,
          txHash: existing ?? undefined,
          explorerUrl: existing ? stellarTxExplorerUrl(existing) : undefined,
          reason: "receipt was previously anchored",
        };
      }
      return { anchored: false, reason: `Simulation error: ${errMsg}` };
    }

    // Assemble the transaction with the simulated resource footprint
    const assembled = rpc.assembleTransaction(tx, simResult).build();
    assembled.sign(keypair);

    // Submit and wait for confirmation
    const sendResult = await server.sendTransaction(assembled);
    if (sendResult.status === "ERROR") {
      const resultXdr = sendResult.errorResult?.toXDR("base64") ?? "unknown";
      return { anchored: false, reason: `Transaction error: ${resultXdr}` };
    }

    const txHash = sendResult.hash;
    const confirmedTxHash = await pollTransactionResult(server, txHash, rpc);

    // Persist to DB
    await prisma.executionReceipt.update({
      where: { taskId: receipt.taskId },
      data: {
        anchorContractId: contractId,
        anchorTxHash: confirmedTxHash,
        anchoredAt: new Date(),
      },
    });

    return {
      anchored: true,
      contractId,
      txHash: confirmedTxHash,
      explorerUrl: stellarTxExplorerUrl(confirmedTxHash),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[anchor] anchorVerifiedReceipt failed:", msg);
    return { anchored: false, reason: msg };
  }
}

async function pollTransactionResult(
  server: import("@stellar/stellar-sdk").rpc.Server,
  txHash: string,
  rpc: typeof import("@stellar/stellar-sdk").rpc,
): Promise<string> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await server.getTransaction(txHash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return txHash;
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      const resultXdr = result.resultXdr?.toXDR("base64") ?? "unknown";
      throw new Error(`Transaction failed: ${resultXdr}`);
    }
    // NOT_FOUND means still pending — continue polling
  }
  throw new Error(`Transaction ${txHash} did not confirm within ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

async function getExistingAnchorTxHash(receipt: ExecutionReceipt): Promise<string | null> {
  try {
    const row = await prisma.executionReceipt.findUnique({
      where: { taskId: receipt.taskId },
      select: { anchorTxHash: true },
    });
    return row?.anchorTxHash ?? null;
  } catch {
    return null;
  }
}
