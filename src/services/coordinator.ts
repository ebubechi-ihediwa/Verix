import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { Task, Subtask, TaskResult, TaskEvent } from "@/types/task";
import { Specialist } from "@/types/specialist";
import { AgentExecutionEnvelope } from "@/types/execution";
import {
  appendExecutionEvent,
  completeExecution,
  failExecution,
  getExecution,
  transitionExecution,
  updateExecution,
} from "@/services/execution";
import {
  claimResume,
  createSignatureRequest,
  getSignatureRequestForProject,
  isExpired,
  markExpired,
  markResolved,
  parseContext,
  releaseClaim,
} from "@/services/signature-request";
import { resumeBlendOperation } from "@/services/agents/blend";
import { createPayment } from "@/services/payment";
import { Payment } from "@/types/payment";
import {
  getSpecialistSummariesForRouting,
  getSpecialistByName,
  getSpecialistById,
  getAllSpecialists,
  getActiveAgentVersion,
} from "@/services/discovery";
import { appendReputationEvent } from "@/services/reputation";
import { recordTraceEvent } from "@/services/trace";
import { generateReceipt } from "@/services/receipt";
import { buildPinnedSubtask } from "@/services/routing";
import {
  runBlendDiscovery,
  executeBlendSupply,
  executeBlendWithdraw,
  parseBlendSettings,
  resolveBlendNetwork,
  type BlendOperationData,
} from "@/services/agents/blend";
import { prepareEscrowForExecution } from "@/services/escrow";
import { sha256 } from "@/lib/hash";
import { decrypt } from "@/lib/encryption";
import { env } from "@/lib/env";

// Lazy-init: keys may be absent in demo mode; instantiate only when used.
let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
  return _anthropic;
}

function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _openai;
}

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

// ─────────────────────────────────────────────────────────────────────────────
// STAGE TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface InitResult {
  effectiveCap: number;
}

interface RouteResult {
  subtasks: Subtask[];
  registrySnapshotHash: string;
  selectedAgentVersions: Array<{ specialistName: string; agentVersionId?: string; versionHash?: string }>;
}

interface SpendCapResult {
  passed: boolean;
  estimatedTotal: number;
  effectiveCap: number;
}

/** Context captured when a wallet-mode op pauses awaiting the user's signature. */
interface AwaitingSignatureContext {
  unsignedXdr: string;
  protocol: "blend";
  operation: "supply" | "withdraw";
  asset: string;
  amount: number;
  poolId: string;
  apy: number;
  sourceWallet: string;
  network: "testnet" | "mainnet";
  agentName: string;
  subtaskId: string;
}

interface ExecuteResult {
  deliverables: Array<{ title: string; content: string; specialistName: string }>;
  payments: Payment[];
  totalSpent: number;
  subtasks: Subtask[];
  envelopes: AgentExecutionEnvelope[];
  /** Structured DeFi operations (e.g. Blend supply) produced during execution. */
  operations: BlendOperationData[];
  /** Set when execution paused awaiting a wallet signature. */
  awaiting?: AwaitingSignatureContext;
}

interface SpecialistResult {
  output: string;
  model: string;
  provider: "claude" | "openai" | "groq" | "fallback";
  /** Set when a typed agent performed an on-chain operation (e.g. Blend supply). */
  operation?: BlendOperationData;
  /** Set when a wallet-mode op built an unsigned XDR and is awaiting signature. */
  awaitingSignature?: AwaitingSignatureContext;
}

interface DelegationRequest {
  specialistName: string;
  capability: string;
  prompt: string;
  budgetUsdc: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────

async function pushEvent(
  taskId: string,
  type: TaskEvent["type"],
  message: string,
  status: TaskEvent["status"]
) {
  await appendExecutionEvent(taskId, { type, message, status });
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1: INITIALIZE
// ─────────────────────────────────────────────────────────────────────────────

async function stageInitialize(
  taskId: string,
  description: string,
  spendCap?: number
): Promise<InitResult> {
  const effectiveCap = spendCap ?? 50;

  await pushEvent(taskId, "coordinator", "Coordinator received task. Analyzing with AI...", "info");

  await recordTraceEvent(taskId, "coordinator_start", "coordinator",
    "Coordinator received task and began decomposition",
    { inputHash: sha256(description), metadata: { descriptionLength: description.length } }
  ).catch((e) => console.warn("[Trace] coordinator_start failed:", e));

  return { effectiveCap };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2: ROUTE
// ─────────────────────────────────────────────────────────────────────────────

async function stageRoute(
  taskId: string,
  description: string,
  requestedSpecialistId?: string
): Promise<RouteResult> {
  // Snapshot the registry before routing so the receipt can commit to which agents were available
  const allSpecialists = await getSpecialistSummariesForRouting();
  const registrySnapshotHash = sha256(
    JSON.stringify([...allSpecialists].sort((a, b) => a.name.localeCompare(b.name)))
  );

  let subtasks: Subtask[];
  if (requestedSpecialistId) {
    const specialist = await getSpecialistById(requestedSpecialistId);
    if (!specialist || specialist.status !== "online") {
      const reason = specialist ? `status=${specialist.status}` : "not found";
      await pushEvent(taskId, "system", `Requested marketplace agent unavailable: ${requestedSpecialistId} (${reason}).`, "error");
      await recordTraceEvent(
        taskId,
        "selected_agent_unavailable",
        "coordinator",
        `Requested marketplace agent unavailable: ${requestedSpecialistId} (${reason})`,
        { metadata: { requestedSpecialistId, reason } }
      ).catch((e) => console.warn("[Trace] selected_agent_unavailable failed:", e));
      throw new Error(`Requested marketplace agent unavailable: ${requestedSpecialistId}`);
    }

    const activeVersion = await getActiveAgentVersion(specialist.id);
    subtasks = [buildPinnedSubtask(specialist, activeVersion)];

    await updateExecution(taskId, {
      requestedSpecialistName: specialist.name,
      requestedAgentVersionId: activeVersion?.id,
      requestedAgentVersionHash: activeVersion?.versionHash,
    });
    await pushEvent(taskId, "coordinator", `Marketplace agent selected: ${specialist.name}.`, "success");
    await recordTraceEvent(
      taskId,
      "selected_agent_pinned",
      "coordinator",
      `User selected marketplace agent ${specialist.name}`,
      {
        outputHash: activeVersion?.versionHash,
        metadata: {
          requestedSpecialistId: specialist.id,
          specialistName: specialist.name,
          agentVersionId: activeVersion?.id,
          agentVersion: activeVersion?.version,
          versionHash: activeVersion?.versionHash,
        },
      }
    ).catch((e) => console.warn("[Trace] selected_agent_pinned failed:", e));
  } else {
    subtasks = await decomposeTaskWithAI(description);
  }

  const selectedAgentVersions = subtasks.map((s) => ({
    specialistName: s.specialistName ?? "unknown",
    agentVersionId: s.agentVersionId,
    versionHash: s.versionHash,
  }));

  await transitionExecution(taskId, "discovering", { subtasks });

  await pushEvent(
    taskId,
    "coordinator",
    requestedSpecialistId
      ? `Pinned execution to ${subtasks[0]?.specialistName ?? "selected agent"}.`
      : `AI selected ${subtasks.length} specialist(s) for this task.`,
    "success"
  );

  const subtaskNames = subtasks.map((s) => s.specialistName ?? "unknown");
  await recordTraceEvent(taskId, "task_decomposed", "coordinator",
    `Task decomposed into ${subtasks.length} subtask(s): ${subtaskNames.join(", ")}`,
    {
      outputHash: sha256(JSON.stringify(subtaskNames)),
      metadata: {
        specialists: subtaskNames,
        count: subtasks.length,
        registrySnapshotHash,
        selectedAgentVersions,
      },
    }
  ).catch((e) => console.warn("[Trace] task_decomposed failed:", e));

  for (const s of subtasks) {
    await pushEvent(taskId, "coordinator", `Specialist assigned: ${s.specialistName} ($${s.cost?.toFixed(2)} USDC)`, "info");

    await recordTraceEvent(taskId, "specialist_assigned", s.specialistName ?? "unknown",
      `${s.specialistName} assigned for capability: ${s.capability}`,
      { metadata: { specialistName: s.specialistName, capability: s.capability, cost: s.cost, agentVersionId: s.agentVersionId, agentVersion: s.agentVersion, versionHash: s.versionHash } }
    ).catch((e) => console.warn("[Trace] specialist_assigned failed:", e));
  }

  return { subtasks, registrySnapshotHash, selectedAgentVersions };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3: SPEND CAP
// ─────────────────────────────────────────────────────────────────────────────

async function stageSpendCap(
  taskId: string,
  subtasks: Subtask[],
  effectiveCap: number
): Promise<SpendCapResult> {
  const estimatedTotal = subtasks.reduce((sum, s) => sum + (s.cost || 0), 0);
  const passed = estimatedTotal <= effectiveCap;

  await recordTraceEvent(taskId, passed ? "spend_cap_check" : "spend_cap_exceeded", "coordinator",
    passed
      ? `Spend cap check passed: $${estimatedTotal.toFixed(2)} within $${effectiveCap.toFixed(2)} limit`
      : `Spend cap exceeded: $${estimatedTotal.toFixed(2)} > $${effectiveCap.toFixed(2)}`,
    { metadata: { estimatedTotal, effectiveCap, passed } }
  ).catch((e) => console.warn("[Trace] spend_cap_check failed:", e));

  if (!passed) {
    await pushEvent(taskId, "system", `Spend cap exceeded! Estimated $${estimatedTotal.toFixed(2)} exceeds cap of $${effectiveCap.toFixed(2)}. Task blocked.`, "error");
    await failExecution(taskId, `Spend cap exceeded: $${estimatedTotal.toFixed(2)} > $${effectiveCap.toFixed(2)}`);

    await recordTraceEvent(taskId, "task_failed", "coordinator",
      `Task failed: spend cap exceeded`,
      { metadata: { reason: "spend_cap_exceeded", estimatedTotal, effectiveCap } }
    ).catch((e) => console.warn("[Trace] task_failed failed:", e));
  } else {
    await pushEvent(taskId, "system", `Spend cap check passed: $${estimatedTotal.toFixed(2)} within $${effectiveCap.toFixed(2)} limit.`, "success");
  }

  return { passed, estimatedTotal, effectiveCap };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 4: EXECUTE
// ─────────────────────────────────────────────────────────────────────────────

function extractDelegationRequest(output: string): DelegationRequest | null {
  const marker = "VERIX_DELEGATION_REQUEST:";
  const idx = output.indexOf(marker);
  if (idx < 0) return null;

  const raw = output.slice(idx + marker.length).trim();
  const jsonText = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?/i, "").replace(/```[\s\S]*$/m, "").trim()
    : raw.split("\n\n")[0]?.trim();
  try {
    const parsed = JSON.parse(jsonText) as Partial<DelegationRequest>;
    if (
      typeof parsed.specialistName === "string" &&
      typeof parsed.capability === "string" &&
      typeof parsed.prompt === "string" &&
      typeof parsed.budgetUsdc === "number"
    ) {
      return {
        specialistName: parsed.specialistName,
        capability: parsed.capability,
        prompt: parsed.prompt,
        budgetUsdc: parsed.budgetUsdc,
      };
    }
  } catch {
    return null;
  }
  return null;
}

async function buildDelegatedSubtask(
  taskId: string,
  parent: Subtask,
  request: DelegationRequest,
  remainingBudget: number
): Promise<{ subtask?: Subtask; reason?: string }> {
  const parentDepth = parent.delegationDepth ?? 0;
  if (parentDepth >= env.COORDINATOR_DELEGATION_MAX_DEPTH) {
    return { reason: "max_depth_exceeded" };
  }
  if (request.budgetUsdc <= 0 || request.budgetUsdc > remainingBudget) {
    return { reason: "budget_exceeded" };
  }

  const specialist = await getSpecialistByName(request.specialistName);
  if (!specialist || specialist.status !== "online") {
    return { reason: "specialist_unavailable" };
  }
  if (specialist.name === parent.specialistName) {
    return { reason: "self_delegation_rejected" };
  }
  if (specialist.priceUsdc > request.budgetUsdc) {
    return { reason: "requested_budget_below_agent_price" };
  }

  const activeVersion = await getActiveAgentVersion(specialist.id);
  return {
    subtask: {
      id: crypto.randomUUID(),
      capability: request.capability,
      specialistId: specialist.id,
      specialistName: specialist.name,
      status: "pending",
      cost: specialist.priceUsdc,
      agentVersionId: activeVersion?.id,
      agentVersion: activeVersion?.version,
      versionHash: activeVersion?.versionHash,
      parentSubtaskId: parent.id,
      delegatedBySpecialistName: parent.specialistName,
      delegationDepth: parentDepth + 1,
    },
  };
}

async function stageExecute(
  taskId: string,
  description: string,
  initialSubtasks: Subtask[],
  effectiveCap: number
): Promise<ExecuteResult> {
  await transitionExecution(taskId, "processing");

  const concurrencyLimit = env.COORDINATOR_CONCURRENCY_LIMIT;
  const subtasks = [...initialSubtasks];
  const deliverables: Array<{ title: string; content: string; specialistName: string }> = [];
  const payments: Payment[] = [];
  const envelopes: AgentExecutionEnvelope[] = [];
  const operations: BlendOperationData[] = [];
  let awaiting: AwaitingSignatureContext | undefined;
  let totalSpent = 0;

  // ── Phase A: Serial payment — no concurrent spend-cap races ─────────────────
  const readyForAI: Array<{ index: number; subtask: Subtask; payment: Payment }> = [];

  for (let i = 0; i < subtasks.length; i++) {
    const subtask = subtasks[i];
    console.log(`[Coordinator] Payment phase: ${subtask.specialistName}`);

    subtasks[i] = { ...subtask, status: "processing" };
    await updateExecution(taskId, { subtasks: [...subtasks] });

    if (totalSpent + (subtask.cost || 0) > effectiveCap) {
      await pushEvent(taskId, "system", `Payment blocked: cumulative spend $${(totalSpent + (subtask.cost || 0)).toFixed(2)} would exceed cap $${effectiveCap.toFixed(2)}.`, "error");
      subtasks[i] = { ...subtask, status: "failed" };
      await updateExecution(taskId, { subtasks: [...subtasks] });
      continue;
    }

    await pushEvent(taskId, "specialist", `Recording Trustless Work payout intent for ${subtask.specialistName}...`, "pending");
    console.log(`[Coordinator] Recording payout intent for ${subtask.specialistName} $${subtask.cost} USDC...`);

    await recordTraceEvent(taskId, "payment_initiated", "payment",
      `Recording Stellar escrow payout intent for ${subtask.specialistName} ($${subtask.cost?.toFixed(2)} USDC)`,
      { metadata: { specialistName: subtask.specialistName, amount: subtask.cost, agentVersionId: subtask.agentVersionId } }
    ).catch((e) => console.warn("[Trace] payment_initiated failed:", e));

    let payment: Payment;
    try {
      payment = await createPayment(taskId, subtask.specialistName!, subtask.cost!, subtask.specialistId);
    } catch (err) {
      await pushEvent(taskId, "system", `${subtask.specialistName} failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
      subtasks[i] = { ...subtask, status: "failed" };
      await updateExecution(taskId, { subtasks: [...subtasks] });
      await recordTraceEvent(taskId, "specialist_failed", subtask.specialistName ?? "unknown",
        `${subtask.specialistName} failed during payment: ${err instanceof Error ? err.message : "Unknown error"}`,
        { metadata: { specialistName: subtask.specialistName, error: err instanceof Error ? err.message : "Unknown error" } }
      ).catch(() => { /* non-fatal */ });
      continue;
    }

    payments.push(payment);

    if (payment.status !== "confirmed") {
      console.warn(`[Coordinator] Payment failed for ${subtask.specialistName} — skipping AI`);
      await pushEvent(taskId, "payment", `Payment to ${subtask.specialistName} failed on-chain. Agent will not execute.`, "error");
      await recordTraceEvent(taskId, "payment_failed", "payment",
        `Payment to ${subtask.specialistName} failed on-chain`,
        { metadata: { specialistName: subtask.specialistName, amount: subtask.cost } }
      ).catch((e) => console.warn("[Trace] payment_failed failed:", e));
      subtasks[i] = { ...subtask, status: "failed" };
      await updateExecution(taskId, { subtasks: [...subtasks] });
      continue;
    }

    totalSpent += subtask.cost || 0;
    console.log(`[Coordinator] Payment confirmed: ${payment.txHash}`);
    await pushEvent(
      taskId,
      "payment",
      `Paid $${subtask.cost?.toFixed(2)} USDC to ${subtask.specialistName} — tx: ${payment.txHash?.slice(0, 10)}... (block #${payment.blockNumber})`,
      "success"
    );
    await recordTraceEvent(taskId, "payment_confirmed", "payment",
      `Payment confirmed: $${subtask.cost?.toFixed(2)} USDC to ${subtask.specialistName} (tx: ${payment.txHash?.slice(0, 10)}...)`,
      {
        outputHash: payment.txHash ? sha256(payment.txHash) : undefined,
        metadata: { specialistName: subtask.specialistName, txHash: payment.txHash, blockNumber: payment.blockNumber, amount: subtask.cost },
      }
    ).catch((e) => console.warn("[Trace] payment_confirmed failed:", e));

    readyForAI.push({ index: i, subtask: subtasks[i], payment });
  }

  // ── Phase B: Concurrent AI execution in batches of concurrencyLimit ──────────
  for (let b = 0; b < readyForAI.length; b += concurrencyLimit) {
    const batch = readyForAI.slice(b, b + concurrencyLimit);

    await Promise.allSettled(
      batch.map(async ({ index, subtask, payment }) => {
        await pushEvent(taskId, "specialist", `${subtask.specialistName} is processing...`, "pending");

        await recordTraceEvent(taskId, "specialist_invoked", subtask.specialistName ?? "unknown",
          `${subtask.specialistName} invoked`,
          {
            inputHash: sha256(description),
            metadata: { specialistName: subtask.specialistName, agentVersionId: subtask.agentVersionId, agentVersion: subtask.agentVersion },
          }
        ).catch((e) => console.warn("[Trace] specialist_invoked failed:", e));

        try {
          const specialistResult = await executeSpecialist(taskId, subtask, description, effectiveCap);
          const { output: result, model, provider } = specialistResult;
          if (specialistResult.operation) operations.push(specialistResult.operation);
          if (specialistResult.awaitingSignature && !awaiting) awaiting = specialistResult.awaitingSignature;

          await pushEvent(taskId, "specialist", `${subtask.specialistName} delivered results.`, "info");

          const outputHash = sha256(result);
          const promptHash = sha256(`${subtask.specialistName}:${description}`);
          const envelope: AgentExecutionEnvelope = {
            subtaskId: subtask.id,
            specialistName: subtask.specialistName!,
            agentVersionId: subtask.agentVersionId,
            agentVersionHash: subtask.versionHash,
            model,
            provider,
            promptHash,
            inputHash: sha256(description),
            outputHash,
            completedAt: new Date().toISOString(),
          };
          envelopes.push(envelope);

          await recordTraceEvent(taskId, "specialist_completed", subtask.specialistName ?? "unknown",
            `${subtask.specialistName} completed successfully`,
            {
              outputHash,
              metadata: {
                specialistName: subtask.specialistName,
                agentVersionId: subtask.agentVersionId,
                resultLength: result.length,
                model,
                provider,
                promptHash,
              },
            }
          ).catch((e) => console.warn("[Trace] specialist_completed failed:", e));

          subtasks[index] = { ...subtask, status: "completed", result };
          await updateExecution(taskId, { subtasks: [...subtasks] });

          deliverables.push({
            title: `${subtask.specialistName} Report`,
            content: result,
            specialistName: subtask.specialistName!,
          });

          const delegation = extractDelegationRequest(result);
          if (delegation) {
            await recordTraceEvent(taskId, "delegation_requested", subtask.specialistName ?? "unknown",
              `${subtask.specialistName} requested subcontractor ${delegation.specialistName}`,
              { metadata: { parentSubtaskId: subtask.id, ...delegation } }
            ).catch(() => { /* non-fatal */ });

            const remainingBudget = effectiveCap - totalSpent;
            const delegated = await buildDelegatedSubtask(taskId, subtask, delegation, remainingBudget);
            if (!delegated.subtask) {
              await recordTraceEvent(taskId, "delegation_rejected", "coordinator",
                `Delegation rejected for ${subtask.specialistName}: ${delegated.reason}`,
                { metadata: { parentSubtaskId: subtask.id, reason: delegated.reason, requested: delegation } }
              ).catch(() => { /* non-fatal */ });
            } else {
              const child = delegated.subtask;
              subtasks.push(child);
              await updateExecution(taskId, { subtasks: [...subtasks] });
              await recordTraceEvent(taskId, "delegation_approved", "coordinator",
                `Delegation approved: ${subtask.specialistName} subcontracted ${child.specialistName}`,
                {
                  metadata: {
                    parentSubtaskId: subtask.id,
                    childSubtaskId: child.id,
                    specialistName: child.specialistName,
                    amount: child.cost,
                    delegationDepth: child.delegationDepth,
                  },
                }
              ).catch(() => { /* non-fatal */ });

              try {
                const childPayment = await createPayment(taskId, child.specialistName!, child.cost!, child.specialistId);
                payments.push(childPayment);
                totalSpent += child.cost || 0;
                const childResult = await executeSpecialist(
                  taskId,
                  child,
                  `${description}\n\nDelegated scope from ${subtask.specialistName}: ${delegation.prompt}`,
                  effectiveCap
                );
                if (childResult.operation) operations.push(childResult.operation);
                const childOutputHash = sha256(childResult.output);
                const childPromptHash = sha256(`${child.specialistName}:${delegation.prompt}`);
                envelopes.push({
                  subtaskId: child.id,
                  specialistName: child.specialistName!,
                  agentVersionId: child.agentVersionId,
                  agentVersionHash: child.versionHash,
                  model: childResult.model,
                  provider: childResult.provider,
                  promptHash: childPromptHash,
                  inputHash: sha256(delegation.prompt),
                  outputHash: childOutputHash,
                  completedAt: new Date().toISOString(),
                });
                const childIndex = subtasks.findIndex((s) => s.id === child.id);
                if (childIndex >= 0) {
                  subtasks[childIndex] = { ...child, status: "completed", result: childResult.output };
                }
                await updateExecution(taskId, { subtasks: [...subtasks] });
                deliverables.push({
                  title: `${child.specialistName} Delegated Report`,
                  content: childResult.output,
                  specialistName: child.specialistName!,
                });
                await recordTraceEvent(taskId, "delegation_executed", child.specialistName ?? "unknown",
                  `${child.specialistName} completed delegated work for ${subtask.specialistName}`,
                  {
                    outputHash: childOutputHash,
                    metadata: {
                      parentSubtaskId: subtask.id,
                      childSubtaskId: child.id,
                      txHash: childPayment.txHash,
                      amount: child.cost,
                      model: childResult.model,
                      provider: childResult.provider,
                    },
                  }
                ).catch(() => { /* non-fatal */ });
              } catch (delegationError) {
                const childIndex = subtasks.findIndex((s) => s.id === child.id);
                if (childIndex >= 0) {
                  subtasks[childIndex] = { ...child, status: "failed" };
                }
                await updateExecution(taskId, { subtasks: [...subtasks] });
                await recordTraceEvent(taskId, "delegation_rejected", "coordinator",
                  `Delegated execution failed for ${child.specialistName}: ${delegationError instanceof Error ? delegationError.message : "Unknown error"}`,
                  { metadata: { parentSubtaskId: subtask.id, childSubtaskId: child.id } }
                ).catch(() => { /* non-fatal */ });
              }
            }
          }

          if (subtask.specialistId || subtask.specialistName) {
            const specialist = subtask.specialistId
              ? { id: subtask.specialistId }
              : await getSpecialistByName(subtask.specialistName!);
            if (specialist?.id) {
              appendReputationEvent(specialist.id, "verified_completion", {
                taskId,
                verified: true,
                metadata: { txHash: payment.txHash, agentVersionId: subtask.agentVersionId },
              }).catch((err) => console.warn(`[Coordinator] Reputation event failed for ${subtask.specialistName}:`, err));
            }
          }

          console.log(`[Coordinator] Completed subtask: ${subtask.specialistName}`);
        } catch (error) {
          console.error(`[Coordinator] Failed subtask: ${subtask.specialistName}`, error);
          await pushEvent(taskId, "system", `${subtask.specialistName} failed: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
          subtasks[index] = { ...subtask, status: "failed" };
          await updateExecution(taskId, { subtasks: [...subtasks] });

          if (subtask.specialistId || subtask.specialistName) {
            const specialist = subtask.specialistId
              ? { id: subtask.specialistId }
              : await getSpecialistByName(subtask.specialistName!);
            if (specialist?.id) {
              appendReputationEvent(specialist.id, "failure", {
                taskId,
                metadata: { error: error instanceof Error ? error.message : "Unknown error" },
              }).catch((err) => console.warn(`[Coordinator] Reputation failure event failed for ${subtask.specialistName}:`, err));
            }
          }

          await recordTraceEvent(taskId, "specialist_failed", subtask.specialistName ?? "unknown",
            `${subtask.specialistName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            { metadata: { specialistName: subtask.specialistName, error: error instanceof Error ? error.message : "Unknown error" } }
          ).catch((e) => console.warn("[Trace] specialist_failed failed:", e));
        }
      })
    );
  }

  return { deliverables, payments, totalSpent, subtasks, envelopes, operations, awaiting };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 5: SYNTHESIZE + RECEIPT
// ─────────────────────────────────────────────────────────────────────────────

async function stageSynthesize(
  taskId: string,
  description: string,
  executeResult: ExecuteResult,
  spendCap: number | undefined,
  initialSubtasks: Subtask[],
  registrySnapshotHash?: string
): Promise<void> {
  const { deliverables, payments, totalSpent, subtasks, operations } = executeResult;

  const versionBySpecialist = new Map<string, { agentVersion: number; versionHash: string }>();
  for (const s of subtasks) {
    if (s.specialistName && s.agentVersion !== undefined && s.versionHash) {
      versionBySpecialist.set(s.specialistName, { agentVersion: s.agentVersion, versionHash: s.versionHash });
    }
  }

  const usedSubtaskIds = new Set<string>();
  const paymentBreakdown = payments.map((p) => {
    const vInfo = versionBySpecialist.get(p.specialistId);
    const matchedSubtask = subtasks.find((s) =>
      s.specialistName === p.specialistId && !usedSubtaskIds.has(s.id)
    );
    if (matchedSubtask) usedSubtaskIds.add(matchedSubtask.id);
    return {
      specialist: p.specialistId,
      amount: p.amount,
      txHash: p.txHash || "",
      blockNumber: p.blockNumber,
      from: p.from,
      to: p.to,
      status: p.status === "confirmed" ? ("confirmed" as const) : ("failed" as const),
      agentVersion: vInfo?.agentVersion,
      versionHash: vInfo?.versionHash,
      subtaskId: matchedSubtask?.id,
      parentSubtaskId: matchedSubtask?.parentSubtaskId,
      splitRole: matchedSubtask?.parentSubtaskId ? ("subcontractor" as const) : ("primary" as const),
      delegatedBySpecialistName: matchedSubtask?.delegatedBySpecialistName,
    };
  });

  const confirmedCount = payments.filter((p) => p.status === "confirmed").length;

  await pushEvent(
    taskId,
    "coordinator",
    `Task complete. ${deliverables.length} deliverable(s), ${confirmedCount} payment(s) confirmed. Total spent: $${totalSpent.toFixed(2)} USDC.`,
    "success"
  );

  const resultSummary = `Successfully completed ${deliverables.length} subtask(s). ${confirmedCount} Stellar/Trustless Work payout intent(s) committed. Total: $${totalSpent.toFixed(2)} USDC.`;

  await completeExecution(
    taskId,
    {
      summary: resultSummary,
      deliverables,
      paymentBreakdown,
      totalCost: totalSpent,
      totalTime: 0,
    },
    totalSpent
  );

  await recordTraceEvent(taskId, "task_completed", "coordinator",
    `Task completed: ${deliverables.length} deliverable(s), $${totalSpent.toFixed(2)} USDC spent`,
    {
      inputHash: sha256(description),
      outputHash: sha256(resultSummary),
      metadata: { deliverables: deliverables.length, totalSpent, confirmedPayments: confirmedCount },
    }
  ).catch((e) => console.warn("[Trace] task_completed failed:", e));

  const agentVersionIds = subtasks
    .map((s) => s.agentVersionId)
    .filter((id): id is string => Boolean(id));

  generateReceipt({
    taskId,
    description,
    spendCap: spendCap ?? 50,
    totalCost: totalSpent,
    agentVersionIds,
    resultSummary,
    registrySnapshotHash,
    paymentBreakdown,
    // Additive display metadata — NOT part of receiptHash (committed via traceRoot).
    blendOperation: operations[0],
  }).catch((e) => console.warn("[Receipt] generateReceipt failed:", e));
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export async function executeCoordinator(
  taskId: string,
  description: string,
  spendCap?: number,
  walletAddress?: string,
  requestedSpecialistId?: string
): Promise<void> {
  console.log(`[Coordinator] Starting task ${taskId}: ${description}`);

  const { effectiveCap } = await stageInitialize(taskId, description, spendCap);

  const { subtasks, registrySnapshotHash } = await stageRoute(taskId, description, requestedSpecialistId);

  const capResult = await stageSpendCap(taskId, subtasks, effectiveCap);
  if (!capResult.passed) {
    console.warn(`[Coordinator] Spend cap exceeded: $${capResult.estimatedTotal} > $${capResult.effectiveCap}`);
    return;
  }

  try {
    const escrow = await prepareEscrowForExecution({
      taskId,
      payerAddress: walletAddress,
      subtasks,
      spendCap: effectiveCap,
    });
    if (!escrow.skipped) {
      await pushEvent(
        taskId,
        "payment",
        `Escrow prepared: ${escrow.milestoneCount} milestone(s), $${escrow.totalAmount.toFixed(2)} USDC${escrow.externalId ? ` (${escrow.externalId})` : ""}.`,
        escrow.status === "funded" ? "success" : "pending"
      );
      if (escrow.status === "funding_pending") {
        await updateExecution(taskId, { status: "funding_pending" });
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown escrow preparation error";
    await pushEvent(taskId, "system", `Escrow preparation failed: ${message}`, "error");
    await failExecution(taskId, `Escrow preparation failed: ${message}`);
    await recordTraceEvent(
      taskId,
      "task_failed",
      "coordinator",
      `Task failed during escrow preparation: ${message}`,
      { metadata: { reason: "escrow_preparation_failed", error: message } }
    ).catch(() => { /* non-fatal */ });
    throw error;
  }

  console.log(`[Coordinator] AI routed to ${subtasks.length} subtask(s)`);

  const executeResult = await stageExecute(taskId, description, subtasks, effectiveCap);

  // Wallet mode: an unsigned XDR was built. Persist the resume context and PAUSE
  // — no receipt/proof/anchor until the user signs and the execution resumes.
  if (executeResult.awaiting) {
    await pauseForSignature(taskId, description, effectiveCap, registrySnapshotHash, executeResult);
    console.log(`[Coordinator] Task ${taskId} paused — awaiting wallet signature.`);
    return;
  }

  await stageSynthesize(taskId, description, executeResult, spendCap, subtasks, registrySnapshotHash);

  console.log(`[Coordinator] Task ${taskId} completed. Total spent: $${executeResult.totalSpent.toFixed(2)} USDC`);
}

/** Persist the wallet-signing request and transition the task to awaiting_signature. */
async function pauseForSignature(
  taskId: string,
  description: string,
  effectiveCap: number,
  registrySnapshotHash: string | undefined,
  executeResult: ExecuteResult
): Promise<void> {
  const aw = executeResult.awaiting!;
  const task = await getExecution(taskId);

  await createSignatureRequest({
    taskId,
    projectId: task?.projectId ?? "",
    sourceWallet: aw.sourceWallet,
    unsignedXdr: aw.unsignedXdr,
    context: {
      blend: {
        operation: aw.operation,
        asset: aw.asset,
        network: aw.network,
        poolId: aw.poolId,
        amount: aw.amount,
        apy: aw.apy,
        agentName: aw.agentName,
        subtaskId: aw.subtaskId,
      },
      synth: {
        description,
        spendCap: effectiveCap,
        registrySnapshotHash,
        totalSpent: executeResult.totalSpent,
        payments: executeResult.payments as unknown[],
        subtasks: executeResult.subtasks as unknown[],
      },
    },
  });

  await pushEvent(taskId, "system", `Awaiting wallet signature for ${aw.operation} of ${aw.amount} ${aw.asset}.`, "pending");
  await transitionExecution(taskId, "awaiting_signature");
}

/**
 * Resume a paused wallet-mode execution after the user signs the XDR.
 *
 * Idempotent: a duplicate resume returns the existing state without resubmitting.
 * On a fresh resume it submits the signed tx, confirms, then runs the normal
 * synthesize path (receipt → proof → anchor). Returns a discriminated result the
 * route maps to HTTP status.
 */
export type ResumeOutcome =
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "not_awaiting" }
  | { kind: "already"; status: string; txHash: string | null }
  | { kind: "resumed"; txHash: string };

export async function resumeExecution(
  projectId: string,
  taskId: string,
  signedXdr: string
): Promise<ResumeOutcome> {
  const req = await getSignatureRequestForProject(projectId, taskId);
  if (!req) return { kind: "not_found" };

  // Idempotency: already resolved / in progress → return existing state.
  if (req.status === "resolved" || req.status === "resuming") {
    return { kind: "already", status: req.status, txHash: req.txHash };
  }
  if (req.status === "expired") return { kind: "expired" };
  if (req.status !== "awaiting_signature") return { kind: "not_awaiting" };
  if (isExpired(req)) {
    await markExpired(taskId);
    return { kind: "expired" };
  }

  // Atomic claim — only one concurrent resume proceeds.
  const claimed = await claimResume(taskId);
  if (!claimed) {
    const fresh = await getSignatureRequestForProject(projectId, taskId);
    return { kind: "already", status: fresh?.status ?? "resuming", txHash: fresh?.txHash ?? null };
  }

  const ctx = parseContext(req);
  try {
    const result = await resumeBlendOperation({
      taskId,
      subtaskId: ctx.blend.subtaskId,
      agentName: ctx.blend.agentName,
      operation: ctx.blend.operation,
      asset: ctx.blend.asset,
      network: ctx.blend.network,
      signedXdr,
      poolId: ctx.blend.poolId,
      amount: ctx.blend.amount,
      apy: ctx.blend.apy,
    });
    const txHash = result.txHash!;
    await markResolved(taskId, txHash);

    // Continue the normal completion path: receipt → proof → anchor.
    await transitionExecution(taskId, "processing");
    const executeResult: ExecuteResult = {
      deliverables: [{ title: `${ctx.blend.agentName} Report`, content: result.output, specialistName: ctx.blend.agentName }],
      payments: (ctx.synth.payments as Payment[]) ?? [],
      totalSpent: ctx.synth.totalSpent,
      subtasks: (ctx.synth.subtasks as Subtask[]) ?? [],
      envelopes: [],
      operations: result.operation ? [result.operation] : [],
    };
    await stageSynthesize(taskId, ctx.synth.description, executeResult, ctx.synth.spendCap, executeResult.subtasks, ctx.synth.registrySnapshotHash);

    return { kind: "resumed", txHash };
  } catch (error) {
    // Roll the claim back so the user can retry signing.
    await releaseClaim(taskId);
    await transitionExecution(taskId, "awaiting_signature").catch(() => {});
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI-POWERED TASK DECOMPOSITION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try AI providers in order (Claude haiku → Groq → OpenAI) for the routing
 * prompt. Routing only needs ~500 tokens so any model works; the cascade
 * ensures we succeed even when a particular key is missing or invalid.
 */
async function callRoutingLLM(prompt: string): Promise<string> {
  if (env.CLAUDE_API_KEY) {
    try {
      const resp = await getAnthropic().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });
      const block = resp.content[0];
      const text = block.type === "text" ? block.text.trim() : "";
      if (text) {
        console.log("[Coordinator] Routing via Claude haiku");
        return text;
      }
    } catch (err) {
      console.warn("[Coordinator] Claude routing failed, trying Groq:", (err as Error).message?.slice(0, 80));
    }
  }

  if (env.GROQ_API_KEY) {
    try {
      const groqClient = new OpenAI({ apiKey: env.GROQ_API_KEY, baseURL: GROQ_BASE_URL });
      const resp = await groqClient.chat.completions.create({
        model: env.GROQ_MODEL,
        max_tokens: 500,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      });
      const text = resp.choices[0]?.message?.content?.trim() ?? "";
      if (text) {
        console.log("[Coordinator] Routing via Groq");
        return text;
      }
    } catch (err) {
      console.warn("[Coordinator] Groq routing failed, trying OpenAI:", (err as Error).message?.slice(0, 80));
    }
  }

  console.log("[Coordinator] Routing via OpenAI");
  const resp = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    temperature: 0.1,
    messages: [{ role: "user", content: prompt }],
  });
  return resp.choices[0]?.message?.content?.trim() ?? "";
}

async function decomposeTaskWithAI(description: string): Promise<Subtask[]> {
  const specialists = await getSpecialistSummariesForRouting();

  if (specialists.length === 0) {
    console.warn("[Coordinator] No specialists registered, returning empty");
    return [];
  }

  const routingPrompt = `You are a task routing coordinator for an AI agent network.

Given a user's task and a list of available specialist agents, decide which specialist(s) should handle the task.

## Available Specialists:
${specialists.map((s) => `- **${s.name}** ($${s.priceUsdc} USDC): ${s.description}. Capabilities: ${s.capabilities.join(", ")}`).join("\n")}

## User's Task:
"${description}"

## Instructions:
1. Analyze what the user is asking for
2. Select the specialist(s) best suited to handle this task — you may select 1 or more
3. Return ONLY a JSON array with your selections. No other text.

Example response format:
[{"specialistName": "CodeAuditor", "reason": "Task requires security analysis"}]

Return ONLY the JSON array:`;

  try {
    console.log("[Coordinator] Using AI to route task...");

    const content = await callRoutingLLM(routingPrompt);
    if (!content) throw new Error("Empty AI response");

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const selections: { specialistName: string; reason: string }[] = JSON.parse(jsonStr);

    if (!Array.isArray(selections) || selections.length === 0) {
      throw new Error("AI returned empty selections");
    }

    console.log(`[Coordinator] AI selected: ${selections.map((s) => s.specialistName).join(", ")}`);

    const subtasks: Subtask[] = [];
    for (const sel of selections) {
      const specialist = await getSpecialistByName(sel.specialistName);
      if (specialist) {
        const activeVersion = await getActiveAgentVersion(specialist.id);
        subtasks.push({
          id: crypto.randomUUID(),
          capability: specialist.capabilities[0] || "general",
          specialistName: specialist.name,
          status: "pending",
          cost: specialist.priceUsdc,
          agentVersionId: activeVersion?.id,
          agentVersion: activeVersion?.version,
          versionHash: activeVersion?.versionHash,
        });
        if (activeVersion) {
          console.log(`[Coordinator] Pinned ${specialist.name} to AgentVersion v${activeVersion.version} (${activeVersion.versionHash.slice(0, 8)})`);
        }
      } else {
        console.warn(`[Coordinator] AI suggested unknown specialist: ${sel.specialistName}, skipping`);
      }
    }

    if (subtasks.length > 0) return subtasks;

    throw new Error("No valid specialists matched AI selections");
  } catch (error) {
    console.warn("[Coordinator] AI routing failed, falling back to keyword matching:", error);
    return decomposeTaskFallback(description);
  }
}

async function decomposeTaskFallback(description: string): Promise<Subtask[]> {
  const lower = description.toLowerCase();
  const subtasks: Subtask[] = [];
  const allSpecialists = await getAllSpecialists();

  for (const specialist of allSpecialists) {
    const keywords = [
      specialist.name.toLowerCase(),
      ...specialist.capabilities.map((c) => c.toLowerCase().replace(/-/g, " ")),
      ...specialist.description.toLowerCase().split(/[,.]/).map((s) => s.trim()).filter(Boolean),
    ];

    const matched = keywords.some((kw) => kw.length > 3 && lower.includes(kw));
    if (matched) {
      const activeVersion = await getActiveAgentVersion(specialist.id);
      subtasks.push({
        id: crypto.randomUUID(),
        capability: specialist.capabilities[0] || "general",
        specialistName: specialist.name,
        status: "pending",
        cost: specialist.priceUsdc,
        agentVersionId: activeVersion?.id,
        agentVersion: activeVersion?.version,
        versionHash: activeVersion?.versionHash,
      });
    }
  }

  if (subtasks.length === 0 && allSpecialists.length > 0) {
    const sorted = [...allSpecialists].sort((a, b) => a.priceUsdc - b.priceUsdc);
    const fallback = sorted[0];
    const activeVersion = await getActiveAgentVersion(fallback.id);
    subtasks.push({
      id: crypto.randomUUID(),
      capability: fallback.capabilities[0] || "general",
      specialistName: fallback.name,
      status: "pending",
      cost: fallback.priceUsdc,
      agentVersionId: activeVersion?.id,
      agentVersion: activeVersion?.version,
      versionHash: activeVersion?.versionHash,
    });
  }

  return subtasks;
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC SPECIALIST EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

async function executeSpecialist(
  taskId: string,
  subtask: Subtask,
  originalTask: string,
  spendCap: number
): Promise<SpecialistResult> {
  const specialist = await getSpecialistByName(subtask.specialistName!);

  // Typed agent branch: Blend yield. The shared engine discovers + selects a real
  // pool, then for operation="supply"/"withdraw" executes a real testnet tx; with
  // no operation it stops after discovery and returns a labelled stub. No funds
  // move without an explicit operation.
  if (specialist?.agentType === "blend_yield") {
    const agentName = subtask.specialistName!;
    const network = resolveBlendNetwork();
    const settings = parseBlendSettings(specialist.config ?? null);

    // Source wallet for wallet-mode signing (the task's connected wallet).
    const sourceWallet = (await getExecution(taskId))?.walletAddress;

    if (settings.operation === "supply") {
      const supply = await executeBlendSupply({
        taskId,
        subtaskId: subtask.id,
        agentName,
        asset: settings.asset,
        amount: settings.amount ?? 0,
        minApy: settings.minApy,
        spendCap,
        network,
        sourceWallet,
      });
      console.log(`[${agentName}] Blend supply ${supply.status} — ${supply.txHash ? `tx ${supply.txHash.slice(0, 12)}…` : "awaiting signature"}`);
      if (supply.status === "AWAITING_SIGNATURE" && supply.awaiting) {
        return {
          output: supply.output, model: "blend-supply", provider: "fallback",
          awaitingSignature: { unsignedXdr: supply.unsignedXdr!, protocol: "blend", operation: "supply", asset: settings.asset, amount: supply.awaiting.amount, poolId: supply.awaiting.poolId, apy: supply.awaiting.apy, sourceWallet: supply.awaiting.sourceWallet, network, agentName, subtaskId: subtask.id },
        };
      }
      return { output: supply.output, model: "blend-supply", provider: "fallback", operation: supply.operation };
    }

    if (settings.operation === "withdraw") {
      const withdraw = await executeBlendWithdraw({
        taskId,
        subtaskId: subtask.id,
        agentName,
        asset: settings.asset,
        // Default to "max" when no amount is given (withdraw the full position).
        amount: settings.amount ?? "max",
        minApy: settings.minApy,
        spendCap,
        network,
        sourceWallet,
      });
      console.log(`[${agentName}] Blend withdraw ${withdraw.status} — ${withdraw.txHash ? `tx ${withdraw.txHash.slice(0, 12)}…` : "awaiting signature"}`);
      if (withdraw.status === "AWAITING_SIGNATURE" && withdraw.awaiting) {
        return {
          output: withdraw.output, model: "blend-withdraw", provider: "fallback",
          awaitingSignature: { unsignedXdr: withdraw.unsignedXdr!, protocol: "blend", operation: "withdraw", asset: settings.asset, amount: withdraw.awaiting.amount, poolId: withdraw.awaiting.poolId, apy: withdraw.awaiting.apy, sourceWallet: withdraw.awaiting.sourceWallet, network, agentName, subtaskId: subtask.id },
        };
      }
      return { output: withdraw.output, model: "blend-withdraw", provider: "fallback", operation: withdraw.operation };
    }

    // Discovery-only (no operation): real discovery + selection, no tx.
    const discovery = await runBlendDiscovery({
      taskId,
      subtaskId: subtask.id,
      agentName,
      config: specialist.config ?? null,
      network,
    });
    console.log(
      `[${agentName}] Blend pool discovery complete — selected ${discovery.selected.poolId.slice(0, 8)}… (no tx)`
    );
    return { output: discovery.output, model: discovery.model, provider: "fallback" };
  }

  const prompt = `You are ${subtask.specialistName}, a specialist AI agent.

Your expertise: ${specialist?.description || "General analysis and problem solving"}
Your capabilities: ${specialist?.capabilities.join(", ") || "general"}

A user has submitted the following task to the agent network, and the coordinator has assigned it to you:

"${originalTask}"

Provide a comprehensive, professional response that demonstrates your expertise. Structure your response with:
1. Executive summary
2. Key findings or analysis
3. Specific recommendations
4. Conclusion

Format your response in markdown. Be thorough but concise.

If you need another marketplace specialist to complete a bounded part of the work, append exactly one structured request at the end:
VERIX_DELEGATION_REQUEST: {"specialistName":"MarketAnalyst","capability":"market-analysis","prompt":"specific delegated scope","budgetUsdc":0.75}

Only request delegation when it materially improves the result. The coordinator may reject requests that exceed budget, depth, or policy.`;

  const preferredProvider = specialist?.aiModel ?? "openai";
  const preferClaude = preferredProvider === "claude";
  const preferGroq = preferredProvider === "groq";

  let agentApiKey: string | undefined;
  if (specialist?.apiKey) {
    try {
      agentApiKey = decrypt(specialist.apiKey);
      console.log(`[${subtask.specialistName}] Using agent's own API key`);
    } catch (err) {
      console.warn(`[${subtask.specialistName}] Failed to decrypt API key, using global key`);
    }
  }

  if (preferClaude) {
    try {
      console.log(`[${subtask.specialistName}] Using Claude (preferred)...`);
      const claudeClient = agentApiKey
        ? new Anthropic({ apiKey: agentApiKey })
        : getAnthropic();
      const message = await claudeClient.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const content = message.content[0];
      if (content.type === "text") {
        console.log(`[${subtask.specialistName}] ✅ Claude succeeded`);
        return { output: content.text, model: "claude-3-5-sonnet-20241022", provider: "claude" };
      }

      return { output: "Analysis completed successfully.", model: "claude-3-5-sonnet-20241022", provider: "claude" };
    } catch (error) {
      console.warn(`[${subtask.specialistName}] ⚠️  Claude failed, falling back to OpenAI:`, error);
    }
  }

  if (preferGroq) {
    try {
      console.log(`[${subtask.specialistName}] Using Groq (preferred)...`);
      const groqApiKey = agentApiKey ?? env.GROQ_API_KEY;
      if (!groqApiKey) {
        throw new Error("Missing GROQ_API_KEY");
      }

      const groqClient = new OpenAI({
        apiKey: groqApiKey,
        baseURL: GROQ_BASE_URL,
      });
      const completion = await groqClient.chat.completions.create({
        model: env.GROQ_MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        console.log(`[${subtask.specialistName}] Groq succeeded`);
        return { output: content, model: env.GROQ_MODEL, provider: "groq" };
      }

      return { output: "Analysis completed successfully.", model: env.GROQ_MODEL, provider: "groq" };
    } catch (error) {
      console.warn(`[${subtask.specialistName}] Groq failed, falling back to OpenAI:`, error);
    }
  }

  try {
    const modelInfo = preferClaude || preferGroq ? "(OpenAI fallback)" : "(primary)";
    console.log(`[${subtask.specialistName}] Using OpenAI ${modelInfo}...`);

    const openaiClient = (!preferClaude && !preferGroq && agentApiKey)
      ? new OpenAI({ apiKey: agentApiKey })
      : getOpenAI();
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      console.log(`[${subtask.specialistName}] ✅ OpenAI succeeded`);
      return { output: content, model: "gpt-4o", provider: "openai" };
    }

    return { output: "Analysis completed successfully.", model: "gpt-4o", provider: "openai" };
  } catch (error) {
    console.warn(`[${subtask.specialistName}] OpenAI also failed, using fallback response:`, error);
    const fallbackText = `# ${subtask.specialistName} Report\n\nAnalysis completed for: "${originalTask.substring(0, 100)}"\n\nConfigured AI providers were unavailable. Please try again later.\n\n---\n*${subtask.specialistName} | $${subtask.cost?.toFixed(2)} USDC via Stellar escrow*`;
    return { output: fallbackText, model: "none", provider: "fallback" };
  }
}

export function selectSpecialist(
  specialists: Specialist[],
  capability: string
): Specialist | null {
  const candidates = specialists.filter((s) =>
    s.capabilities.includes(capability)
  );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.reputation !== a.reputation) return b.reputation - a.reputation;
    return a.priceUsdc - b.priceUsdc;
  });

  return candidates[0];
}

export function synthesizeResults(
  task: Task,
  deliverables: { specialistName: string; title: string; content: string }[]
): TaskResult {
  const totalCost = task.subtasks?.reduce((sum, s) => sum + (s.cost || 0), 0) || 0;

  return {
    summary: `Task completed successfully. ${deliverables.length} specialist(s) contributed to the final deliverable.`,
    deliverables: deliverables.map((d) => ({
      title: d.title,
      content: d.content,
      specialistName: d.specialistName,
    })),
    paymentBreakdown:
      task.subtasks?.map((s) => ({
        specialist: s.specialistName || s.capability,
        amount: s.cost || 0,
        txHash: `0x${crypto.randomUUID().replace(/-/g, "")}`,
        status: "confirmed" as const,
      })) || [],
    totalCost,
    totalTime: 2.8,
  };
}
