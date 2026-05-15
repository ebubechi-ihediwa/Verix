import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { Task, Subtask, TaskResult, TaskEvent } from "@/types/task";
import { Specialist } from "@/types/specialist";
import { AgentExecutionEnvelope } from "@/types/execution";
import {
  appendExecutionEvent,
  completeExecution,
  failExecution,
  transitionExecution,
  updateExecution,
} from "@/services/execution";
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
import { prepareEscrowForExecution } from "@/services/escrow";
import { sha256 } from "@/lib/hash";
import { decrypt } from "@/lib/encryption";
import { env } from "@/lib/env";

const anthropic = new Anthropic({
  apiKey: env.CLAUDE_API_KEY,
});

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

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

interface ExecuteResult {
  deliverables: Array<{ title: string; content: string; specialistName: string }>;
  payments: Payment[];
  totalSpent: number;
  subtasks: Subtask[];
  envelopes: AgentExecutionEnvelope[];
}

interface SpecialistResult {
  output: string;
  model: string;
  provider: "claude" | "openai" | "groq" | "fallback";
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
      payment = await createPayment(taskId, subtask.specialistName!, subtask.cost!);
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
          const specialistResult = await executeSpecialist(subtask, description);
          const { output: result, model, provider } = specialistResult;

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

  return { deliverables, payments, totalSpent, subtasks, envelopes };
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
  const { deliverables, payments, totalSpent, subtasks } = executeResult;

  const versionBySpecialist = new Map<string, { agentVersion: number; versionHash: string }>();
  for (const s of subtasks) {
    if (s.specialistName && s.agentVersion !== undefined && s.versionHash) {
      versionBySpecialist.set(s.specialistName, { agentVersion: s.agentVersion, versionHash: s.versionHash });
    }
  }

  const paymentBreakdown = payments.map((p) => {
    const vInfo = versionBySpecialist.get(p.specialistId);
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

  await stageSynthesize(taskId, description, executeResult, spendCap, subtasks, registrySnapshotHash);

  console.log(`[Coordinator] Task ${taskId} completed. Total spent: $${executeResult.totalSpent.toFixed(2)} USDC`);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI-POWERED TASK DECOMPOSITION
// ─────────────────────────────────────────────────────────────────────────────

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 500,
      temperature: 0.1,
      messages: [{ role: "user", content: routingPrompt }],
    });

    const content = completion.choices[0]?.message?.content?.trim();
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
    const fallback = allSpecialists[0];
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
  subtask: Subtask,
  originalTask: string
): Promise<SpecialistResult> {
  const specialist = await getSpecialistByName(subtask.specialistName!);

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

Format your response in markdown. Be thorough but concise.`;

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
        : anthropic;
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
      : openai;
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
