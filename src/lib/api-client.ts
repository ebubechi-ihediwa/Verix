import { CreateTaskRequest, CreateTaskResponse, Task } from "@/types/task";
import { AiModelProvider, Specialist, SpecialistProfile } from "@/types/specialist";
import { WalletBalance } from "@/types/payment";
import { ExecutionTraceEvent, ExecutionReceipt } from "@/types/trace";
import { ProofRecord } from "@/types/proof";
import { Escrow, EscrowMilestone, EscrowSignaturePhase } from "@/types/escrow";

const API_URL = process.env.NEXT_PUBLIC_APP_URL || "";

const SESSION_STORAGE_KEY = "asn_session_id";
const SESSION_HEADER = "x-session-id";

// ── Session management ────────────────────────────────────────────────────────

/**
 * Returns the cached session ID from localStorage, fetching from the server
 * if one has not been established yet.
 */
export async function getOrInitSession(): Promise<string> {
  if (typeof window === "undefined") return "";

  const cached = localStorage.getItem(SESSION_STORAGE_KEY);
  if (cached) return cached;

  const data = await fetch(`${API_URL}/api/session`).then((r) => r.json());
  const sessionId: string = data.sessionId;
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

/** Read the current session ID without initiating a network request. */
export function getCurrentSession(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

// ── HTTP primitives ───────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.message || `Request failed: ${response.statusText}`);
  }

  return response.json();
}

/** Like `request`, but attaches the session header to the outgoing call. */
async function authedRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const sessionId = await getOrInitSession();
  return request<T>(path, {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      ...(sessionId ? { [SESSION_HEADER]: sessionId } : {}),
    },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function submitTask(
  data: CreateTaskRequest
): Promise<CreateTaskResponse> {
  return authedRequest("/api/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getTaskStatus(taskId: string): Promise<Task> {
  return request(`/api/tasks/${taskId}`);
}

export async function approveTaskResult(
  taskId: string,
  walletAddress: string
): Promise<{
  approvalStatus: "approved";
  approvedAt: string;
  approvedByWallet: string;
  approvalResultHash: string;
}> {
  return authedRequest(`/api/tasks/${encodeURIComponent(taskId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  });
}

export async function getSpecialists(): Promise<Specialist[]> {
  return request("/api/specialists");
}

export async function getSpecialistProfile(id: string): Promise<SpecialistProfile> {
  return request(`/api/specialists/${encodeURIComponent(id)}`);
}

export async function registerSpecialist(data: {
  name: string;
  description: string;
  capabilities: string;
  priceUsdc: number;
  walletAddress: string;
  aiModel: AiModelProvider;
  proofPolicy?: "trace-only" | "receipt-proof" | "escrow-eligible";
  apiKey?: string;
}): Promise<Specialist> {
  return authedRequest("/api/specialists", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSpecialist(
  id: string,
  data: {
    description?: string;
    capabilities?: string;
    priceUsdc?: number;
    walletAddress?: string;
    aiModel?: AiModelProvider;
    proofPolicy?: "trace-only" | "receipt-proof" | "escrow-eligible";
    apiKey?: string;
  }
): Promise<Specialist> {
  return authedRequest(`/api/specialists?id=${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSpecialist(id: string): Promise<void> {
  return authedRequest(`/api/specialists?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getWalletBalance(address?: string): Promise<WalletBalance> {
  const query = address ? `?address=${encodeURIComponent(address)}` : "";
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);

  try {
    return await request(`/api/wallet/balance${query}`, {
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function getTaskHistory(): Promise<Task[]> {
  return request("/api/tasks");
}

export async function deleteTask(id: string): Promise<void> {
  return authedRequest(`/api/tasks?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getExecutionTrace(taskId: string): Promise<{
  taskId: string;
  status: string;
  eventCount: number;
  traceRoot: string | null;
  events: ExecutionTraceEvent[];
}> {
  return request(`/api/executions/${encodeURIComponent(taskId)}/trace`);
}

export async function getExecutionReceipt(taskId: string): Promise<ExecutionReceipt> {
  return request(`/api/executions/${encodeURIComponent(taskId)}/receipt`);
}

export async function getProofByTask(taskId: string): Promise<ProofRecord | null> {
  return request(`/api/proofs?taskId=${encodeURIComponent(taskId)}`);
}

export async function getProof(proofId: string): Promise<ProofRecord> {
  return request(`/api/proofs/${encodeURIComponent(proofId)}`);
}

export async function verifyProof(proofId: string): Promise<ProofRecord> {
  return request(`/api/proofs/${encodeURIComponent(proofId)}/verify`, {
    method: "POST",
  });
}

export async function getEscrowByTask(
  taskId: string
): Promise<{ escrow: (Escrow & { milestones: EscrowMilestone[] }) | null }> {
  return request(`/api/escrow?taskId=${encodeURIComponent(taskId)}`);
}

export async function submitSignedEscrowTransaction(
  escrowId: string,
  data: { signedXdr: string; phase: EscrowSignaturePhase; signerAddress?: string }
): Promise<{ escrowId: string; phase: EscrowSignaturePhase; status: string; txHash?: string }> {
  return authedRequest(`/api/escrow/${encodeURIComponent(escrowId)}/submit-signed`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function syncEscrowStatus(
  escrowId: string
): Promise<{ escrowId: string; synced: boolean; status: string | null; milestoneCount: number; error: string | null }> {
  return authedRequest(`/api/escrow/${encodeURIComponent(escrowId)}/sync`, {
    method: "POST",
  });
}

export async function retryEscrowRelease(
  escrowId: string
): Promise<{ released: number; failed: number; skipped: number }> {
  return authedRequest(`/api/escrow/${encodeURIComponent(escrowId)}/release`, {
    method: "POST",
  });
}

export async function prepareMilestoneWalletRelease(
  escrowId: string,
  milestoneId: string,
  payerAddress: string
): Promise<{ status: string; milestoneId: string; unsignedReleaseTransaction?: string }> {
  return authedRequest(`/api/escrow/${encodeURIComponent(escrowId)}/release-wallet`, {
    method: "POST",
    body: JSON.stringify({ milestoneId, payerAddress }),
  });
}

export async function submitMilestoneWalletRelease(
  escrowId: string,
  milestoneId: string,
  payerAddress: string,
  signedXdr: string
): Promise<{ status: string; milestoneId: string; txHash?: string }> {
  return authedRequest(`/api/escrow/${encodeURIComponent(escrowId)}/release-wallet`, {
    method: "POST",
    body: JSON.stringify({ milestoneId, payerAddress, signedXdr }),
  });
}
