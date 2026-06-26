import { env } from "@/lib/env";
import { signStellarXdr } from "@/lib/stellar-config";
import { fromBlendAmount } from "./scaling";
import type { TxStatus } from "@/services/protocols/reconcile";
import type { BlendNetwork, BlendPosition } from "./types";

/**
 * Blend Soroban client (testnet). Builds + submits a generic Pool.submit request
 * (Supply or Withdraw share the same call shape), reusing the proven pattern from
 * services/anchor.ts: simulate → assemble → sign → send → poll.
 *
 * Split into composable primitives so both signing modes share one code path:
 *   buildPoolRequestXdr → (server: signStellarXdr) → submitSignedXdr → confirm.
 *
 * The exact Blend v1 request/position encoding targets the on-chain Pool contract
 * and must be verified against testnet; all callers mock this module in unit tests.
 */

// Blend v1 RequestType: 0 = Supply (lend / earn yield), 1 = Withdraw.
export const REQUEST_TYPE_SUPPLY = 0;
export const REQUEST_TYPE_WITHDRAW = 1;

const POLL_MAX_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 3000;

function allowHttp(): boolean {
  return env.SOROBAN_RPC_URL.startsWith("http://");
}

export interface BuildPoolRequestParams {
  poolId: string;
  /** Reserve asset SAC id. */
  assetContractId: string;
  /** Source account public key (server signer or the user's wallet). */
  from: string;
  /** On-chain amount (i128) in the asset's smallest unit. */
  amountRaw: bigint;
  /** Blend RequestType (0 = supply, 1 = withdraw). */
  requestType: number;
  network?: BlendNetwork;
}

/**
 * Build + simulate + assemble the Pool.submit request and return the UNSIGNED
 * transaction XDR (base64). No signing, no network submission.
 */
export async function buildPoolRequestXdr(params: BuildPoolRequestParams): Promise<{ unsignedXdr: string }> {
  const { rpc, Contract, TransactionBuilder, Networks, nativeToScVal, xdr } = await import(
    "@stellar/stellar-sdk"
  );
  const server = new rpc.Server(env.SOROBAN_RPC_URL, { allowHttp: allowHttp() });
  const contract = new Contract(params.poolId);
  const account = await server.getAccount(params.from);

  const networkPassphrase =
    env.STELLAR_NETWORK_PASSPHRASE ||
    (env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET);

  // Blend v1 Pool.submit(from, spender, to, requests: Vec<Request>)
  // Request { address: Address(asset), amount: i128, request_type: u32 }
  const requestStruct = nativeToScVal(
    { address: params.assetContractId, amount: params.amountRaw, request_type: params.requestType },
    {
      type: {
        address: ["symbol", "address"],
        amount: ["symbol", "i128"],
        request_type: ["symbol", "u32"],
      },
    } as never
  );
  const requestsVec = xdr.ScVal.scvVec([requestStruct]);
  const fromVal = nativeToScVal(params.from, { type: "address" });

  const tx = new TransactionBuilder(account, { fee: "100000", networkPassphrase })
    .addOperation(contract.call("submit", fromVal, fromVal, fromVal, requestsVec))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Blend submit simulation failed: ${sim.error ?? "unknown"}`);
  }
  const assembled = rpc.assembleTransaction(tx, sim).build();
  return { unsignedXdr: assembled.toXDR() };
}

/** Submit a signed transaction XDR. Returns the submitted tx hash (pre-confirm). */
export async function submitSignedXdr(signedXdr: string): Promise<{ txHash: string }> {
  const { rpc, TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
  const server = new rpc.Server(env.SOROBAN_RPC_URL, { allowHttp: allowHttp() });
  const networkPassphrase =
    env.STELLAR_NETWORK_PASSPHRASE ||
    (env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET);
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const send = await server.sendTransaction(tx);
  if (send.status === "ERROR") {
    const xdrErr = send.errorResult?.toXDR("base64") ?? "unknown";
    throw new Error(`Blend submit send error: ${xdrErr}`);
  }
  return { txHash: send.hash };
}

export interface SubmitPoolRequestParams extends BuildPoolRequestParams {
  /** Server signer secret (server mode). */
  secret: string;
}

/**
 * Server-mode convenience: build → sign with the coordinator key → send.
 * Returns the submitted tx hash (not yet confirmed — call confirmTransaction).
 */
export async function submitPoolRequest(params: SubmitPoolRequestParams): Promise<{ txHash: string }> {
  const { unsignedXdr } = await buildPoolRequestXdr(params);
  const signedXdr = await signStellarXdr(unsignedXdr, params.secret);
  return submitSignedXdr(signedXdr);
}

/** Poll a submitted tx until SUCCESS (true) / FAILED (throws) / timeout (false). */
export async function confirmTransaction(txHash: string): Promise<{ confirmed: boolean }> {
  const { rpc } = await import("@stellar/stellar-sdk");
  const server = new rpc.Server(env.SOROBAN_RPC_URL, { allowHttp: allowHttp() });

  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await server.getTransaction(txHash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { confirmed: true };
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      const xdrErr = result.resultXdr?.toXDR("base64") ?? "unknown";
      throw new Error(`Blend transaction failed: ${xdrErr}`);
    }
    // NOT_FOUND → still pending; keep polling.
  }
  return { confirmed: false };
}

/** Read a tx's current on-chain status (for retry reconciliation). */
export async function getTransactionStatus(txHash: string): Promise<TxStatus> {
  const { rpc } = await import("@stellar/stellar-sdk");
  const server = new rpc.Server(env.SOROBAN_RPC_URL, { allowHttp: allowHttp() });
  try {
    const result = await server.getTransaction(txHash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return "success";
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) return "failed";
    if (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) return "not_found";
    return "pending";
  } catch {
    return "not_found";
  }
}

/** Raw transaction inspection for diagnostics. */
export async function inspectTransaction(txHash: string): Promise<{
  status: string;
  ledger?: number;
  resultXdr?: string;
}> {
  const { rpc } = await import("@stellar/stellar-sdk");
  const server = new rpc.Server(env.SOROBAN_RPC_URL, { allowHttp: allowHttp() });
  const result = await server.getTransaction(txHash);
  const resultXdr =
    "resultXdr" in result
      ? (result as { resultXdr?: { toXDR(fmt: string): string } }).resultXdr?.toXDR("base64")
      : undefined;
  return {
    status: String(result.status),
    ledger: "ledger" in result ? (result as { ledger?: number }).ledger : undefined,
    resultXdr,
  };
}

/**
 * Re-simulate a transaction XDR without submitting (transaction replay), to
 * preview success/failure and resource usage.
 */
export async function replayTransaction(unsignedXdr: string): Promise<{ ok: boolean; detail: string }> {
  const { rpc, TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
  const server = new rpc.Server(env.SOROBAN_RPC_URL, { allowHttp: allowHttp() });
  const networkPassphrase =
    env.STELLAR_NETWORK_PASSPHRASE ||
    (env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET);
  try {
    const tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) return { ok: false, detail: sim.error ?? "simulation error" };
    return { ok: true, detail: "simulation succeeded" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Read a user's position in a Blend pool via a read-only Soroban simulation of
 * `Pool.get_positions`. Best-effort: returns a zeroed position when the read is
 * unavailable so a withdraw fails safe (insufficient_position) rather than
 * guessing a non-existent balance. Must be verified against testnet.
 */
export async function loadUserPosition(poolId: string, account: string): Promise<BlendPosition> {
  const empty: BlendPosition = { deposited: 0, borrow: 0, withdrawable: 0 };
  try {
    const { rpc, Contract, TransactionBuilder, Networks, nativeToScVal, scValToNative } = await import(
      "@stellar/stellar-sdk"
    );
    const server = new rpc.Server(env.SOROBAN_RPC_URL, { allowHttp: allowHttp() });
    const contract = new Contract(poolId);
    const networkPassphrase =
      env.STELLAR_NETWORK_PASSPHRASE ||
      (env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET);

    const src = await server.getAccount(account).catch(() => null);
    if (!src) return empty;

    const tx = new TransactionBuilder(src, { fee: "100", networkPassphrase })
      .addOperation(contract.call("get_positions", nativeToScVal(account, { type: "address" })))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim) || !("result" in sim) || !sim.result) {
      return empty;
    }
    const native = scValToNative(sim.result.retval) as Record<string, unknown> | undefined;
    const depositedRaw = toBigIntSafe(native?.supply ?? native?.collateral);
    const borrowRaw = toBigIntSafe(native?.liabilities ?? native?.borrow);
    const deposited = depositedRaw !== null ? fromBlendAmount(depositedRaw) : 0;
    const borrow = borrowRaw !== null ? fromBlendAmount(borrowRaw) : 0;
    return { deposited, borrow, withdrawable: Math.max(0, deposited) };
  } catch {
    return empty;
  }
}

function toBigIntSafe(value: unknown): bigint | null {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && value.trim()) return BigInt(value);
  } catch {
    /* ignore */
  }
  return null;
}
