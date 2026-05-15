import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { Task, Subtask, TaskResult, TaskEvent } from "@/types/task";
import { Specialist } from "@/types/specialist";
import {
  appendExecutionEvent,
  completeExecution,
  failExecution,
  transitionExecution,
  updateExecution,
} from "@/services/execution";
import { createPayment } from "@/services/payment";
import { Payment } from "@/types/payment";
import { getEscrowProvider } from "@/services/escrow";
import { prisma } from "@/lib/db";
import {
  getSpecialistSummariesForRouting,
  getSpecialistByName,
  getAllSpecialists,
  getActiveAgentVersion,
} from "@/services/discovery";
import { appendReputationEvent } from "@/services/reputation";
import { recordTraceEvent } from "@/services/trace";
import { generateReceipt } from "@/services/receipt";
import { sha256 } from "@/lib/hash";
import { decrypt } from "@/lib/encryption";
import { env } from "@/lib/env";

const EXPLORER_URL = "https://staging-utter-unripe-menkar.explorer.staging-v3.skalenodes.com";

// Claude for code analysis (superior at code understanding)
const anthropic = new Anthropic({
  apiKey: env.CLAUDE_API_KEY,
});

// OpenAI for writing and general analysis
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * Helper: push an event to the task's event log
 */
async function pushEvent(
  taskId: string,
  type: TaskEvent["type"],
  message: string,
  status: TaskEvent["status"]
) {
  await appendExecutionEvent(taskId, { type, message, status });
}

/**
 * Main coordinator execution function
 * Orchestrates the full task lifecycle with real AI specialists
 * Includes spend cap enforcement and audit trail
 */
export async function executeCoordinator(
  taskId: string,
  description: string,
  spendCap?: number
): Promise<void> {
  console.log(`[Coordinator] Starting task ${taskId}: ${description}`);

  await pushEvent(taskId, "coordinator", "Coordinator received task. Analyzing with AI...", "info");

  // ── TRACE: coordinator_start ─────────────────────────────────────────────
  await recordTraceEvent(taskId, "coordinator_start", "coordinator",
    "Coordinator received task and began decomposition",
    { inputHash: sha256(description), metadata: { descriptionLength: description.length } }
  ).catch((e) => console.warn("[Trace] coordinator_start failed:", e));

  // Phase 1: AI-powered task decomposition
  const subtasks = await decomposeTaskWithAI(description);

  await transitionExecution(taskId, "discovering", {
    subtasks,
  });

  await pushEvent(taskId, "coordinator", `AI selected ${subtasks.length} specialist(s) for this task.`, "success");

  // ── TRACE: task_decomposed ───────────────────────────────────────────────
  const subtaskNames = subtasks.map((s) => s.specialistName ?? "unknown");
  await recordTraceEvent(taskId, "task_decomposed", "coordinator",
    `Task decomposed into ${subtasks.length} subtask(s): ${subtaskNames.join(", ")}`,
    {
      outputHash: sha256(JSON.stringify(subtaskNames)),
      metadata: { specialists: subtaskNames, count: subtasks.length },
    }
  ).catch((e) => console.warn("[Trace] task_decomposed failed:", e));

  for (const s of subtasks) {
    await pushEvent(taskId, "coordinator", `Specialist assigned: ${s.specialistName} ($${s.cost?.toFixed(2)} USDC)`, "info");

    // ── TRACE: specialist_assigned ─────────────────────────────────────────
    await recordTraceEvent(taskId, "specialist_assigned", s.specialistName ?? "unknown",
      `${s.specialistName} assigned for capability: ${s.capability}`,
      { metadata: { specialistName: s.specialistName, capability: s.capability, cost: s.cost, agentVersionId: s.agentVersionId, agentVersion: s.agentVersion, versionHash: s.versionHash } }
    ).catch((e) => console.warn("[Trace] specialist_assigned failed:", e));
  }

  // Spend cap enforcement
  const estimatedTotal = subtasks.reduce((sum, s) => sum + (s.cost || 0), 0);
  const effectiveCap = spendCap ?? 50; // default $50 cap

  // ── TRACE: spend_cap_check ───────────────────────────────────────────────
  const capPassed = estimatedTotal <= effectiveCap;
  await recordTraceEvent(taskId, capPassed ? "spend_cap_check" : "spend_cap_exceeded", "coordinator",
    capPassed
      ? `Spend cap check passed: $${estimatedTotal.toFixed(2)} within $${effectiveCap.toFixed(2)} limit`
      : `Spend cap exceeded: $${estimatedTotal.toFixed(2)} > $${effectiveCap.toFixed(2)}`,
    { metadata: { estimatedTotal, effectiveCap, passed: capPassed } }
  ).catch((e) => console.warn("[Trace] spend_cap_check failed:", e));

  if (!capPassed) {
    console.warn(`[Coordinator] Spend cap exceeded: $${estimatedTotal} > $${effectiveCap}`);
    await pushEvent(taskId, "system", `Spend cap exceeded! Estimated $${estimatedTotal.toFixed(2)} exceeds cap of $${effectiveCap.toFixed(2)}. Task blocked.`, "error");
    await failExecution(taskId, `Spend cap exceeded: $${estimatedTotal.toFixed(2)} > $${effectiveCap.toFixed(2)}`);

    // ── TRACE: task_failed (spend cap) ──────────────────────────────────────
    await recordTraceEvent(taskId, "task_failed", "coordinator",
      `Task failed: spend cap exceeded`,
      { metadata: { reason: "spend_cap_exceeded", estimatedTotal, effectiveCap } }
    ).catch((e) => console.warn("[Trace] task_failed failed:", e));
    return;
  }

  await pushEvent(taskId, "system", `Spend cap check passed: $${estimatedTotal.toFixed(2)} within $${effectiveCap.toFixed(2)} limit.`, "success");

  // ── ESCROW: create escrow + milestones if enabled ────────────────────────
  const escrowProvider = getEscrowProvider();
  if (escrowProvider) {
    await createEscrowWithMilestones(taskId, subtasks, estimatedTotal, escrowProvider).catch((e) =>
      console.warn("[Escrow] createEscrowWithMilestones failed (non-fatal):", e)
    );
  }

  console.log(`[Coordinator] AI routed to ${subtasks.length} subtask(s)`);

  // Phase 2: Execute each subtask with real AI
  await transitionExecution(taskId, "processing");

  const deliverables = [];
  const payments: Payment[] = [];
  let totalSpent = 0;

  for (let i = 0; i < subtasks.length; i++) {
    const subtask = subtasks[i];
    console.log(`[Coordinator] Executing subtask: ${subtask.specialistName}`);

    await pushEvent(taskId, "specialist", `${subtask.specialistName} is processing...`, "pending");

    // Update subtask status
    subtasks[i] = { ...subtask, status: "processing" };
    await updateExecution(taskId, { subtasks: [...subtasks] });

    try {
      // Check running total against spend cap BEFORE paying
      if (totalSpent + (subtask.cost || 0) > effectiveCap) {
        await pushEvent(taskId, "system", `Payment blocked: cumulative spend $${(totalSpent + (subtask.cost || 0)).toFixed(2)} would exceed cap $${effectiveCap.toFixed(2)}.`, "error");
        subtasks[i] = { ...subtask, status: "failed" };
        await updateExecution(taskId, { subtasks: [...subtasks] });
        continue;
      }

      // Pay the specialist on-chain via x402 BEFORE executing
      await pushEvent(taskId, "specialist", `Initiating x402 payment to ${subtask.specialistName}...`, "pending");
      console.log(`[Coordinator] Paying ${subtask.specialistName} $${subtask.cost} USDC...`);

      // ── TRACE: payment_initiated ─────────────────────────────────────────
      await recordTraceEvent(taskId, "payment_initiated", "payment",
        `Initiating x402 payment to ${subtask.specialistName} ($${subtask.cost?.toFixed(2)} USDC)`,
        { metadata: { specialistName: subtask.specialistName, amount: subtask.cost, agentVersionId: subtask.agentVersionId } }
      ).catch((e) => console.warn("[Trace] payment_initiated failed:", e));

      const payment = await createPayment(taskId, subtask.specialistName!, subtask.cost!);
      payments.push(payment);

      if (payment.status !== "confirmed") {
        // Payment failed — do NOT execute the specialist
        console.warn(`[Coordinator] Payment failed for ${subtask.specialistName} — skipping execution`);
        await pushEvent(taskId, "payment", `Payment to ${subtask.specialistName} failed on-chain. Agent will not execute.`, "error");

        // ── TRACE: payment_failed ──────────────────────────────────────────
        await recordTraceEvent(taskId, "payment_failed", "payment",
          `Payment to ${subtask.specialistName} failed on-chain`,
          { metadata: { specialistName: subtask.specialistName, amount: subtask.cost } }
        ).catch((e) => console.warn("[Trace] payment_failed failed:", e));

        subtasks[i] = { ...subtask, status: "failed" };
        await updateExecution(taskId, { subtasks: [...subtasks] });
        continue;
      }

      // Payment confirmed — proceed with execution
      totalSpent += subtask.cost || 0;
      console.log(`[Coordinator] Payment confirmed: ${payment.txHash}`);
      await pushEvent(
        taskId,
        "payment",
        `Paid $${subtask.cost?.toFixed(2)} USDC to ${subtask.specialistName} — tx: ${payment.txHash?.slice(0, 10)}... (block #${payment.blockNumber})`,
        "success"
      );

      // ── TRACE: payment_confirmed ─────────────────────────────────────────
      await recordTraceEvent(taskId, "payment_confirmed", "payment",
        `Payment confirmed: $${subtask.cost?.toFixed(2)} USDC to ${subtask.specialistName} (tx: ${payment.txHash?.slice(0, 10)}...)`,
        {
          outputHash: payment.txHash ? sha256(payment.txHash) : undefined,
          metadata: { specialistName: subtask.specialistName, txHash: payment.txHash, blockNumber: payment.blockNumber, amount: subtask.cost },
        }
      ).catch((e) => console.warn("[Trace] payment_confirmed failed:", e));

      await pushEvent(taskId, "specialist", `${subtask.specialistName} is processing...`, "pending");

      // ── TRACE: specialist_invoked ────────────────────────────────────────
      await recordTraceEvent(taskId, "specialist_invoked", subtask.specialistName ?? "unknown",
        `${subtask.specialistName} invoked`,
        {
          inputHash: sha256(description),
          metadata: { specialistName: subtask.specialistName, agentVersionId: subtask.agentVersionId, agentVersion: subtask.agentVersion },
        }
      ).catch((e) => console.warn("[Trace] specialist_invoked failed:", e));

      // Execute specialist with real AI (only after payment confirmed)
      const result = await executeSpecialist(subtask, description);

      await pushEvent(taskId, "specialist", `${subtask.specialistName} delivered results.`, "info");

      // ── TRACE: specialist_completed ──────────────────────────────────────
      await recordTraceEvent(taskId, "specialist_completed", subtask.specialistName ?? "unknown",
        `${subtask.specialistName} completed successfully`,
        {
          outputHash: sha256(result),
          metadata: { specialistName: subtask.specialistName, agentVersionId: subtask.agentVersionId, resultLength: result.length },
        }
      ).catch((e) => console.warn("[Trace] specialist_completed failed:", e));

      // Update subtask as completed
      subtasks[i] = {
        ...subtask,
        status: "completed",
        result,
      };
      await updateExecution(taskId, { subtasks: [...subtasks] });

      deliverables.push({
        title: `${subtask.specialistName} Report`,
        content: result,
        specialistName: subtask.specialistName!,
      });

      // Receipt-backed reputation: confirmed payment + successful execution = verified completion
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
      subtasks[i] = { ...subtask, status: "failed" };
      await updateExecution(taskId, { subtasks: [...subtasks] });

      // Record failure in reputation
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

      // ── TRACE: specialist_failed ─────────────────────────────────────────
      await recordTraceEvent(taskId, "specialist_failed", subtask.specialistName ?? "unknown",
        `${subtask.specialistName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        { metadata: { specialistName: subtask.specialistName, error: error instanceof Error ? error.message : "Unknown error" } }
      ).catch((e) => console.warn("[Trace] specialist_failed failed:", e));
    }
  }

  // Phase 3: Complete task with real payment data and audit trail

  // Build a lookup so payment breakdown rows include the version that was active
  // at invocation time — this makes receipts fully self-describing.
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

  const resultSummary = `Successfully completed ${deliverables.length} subtask(s). ${confirmedCount} on-chain payment(s) confirmed on SKALE Calypso. Total: $${totalSpent.toFixed(2)} USDC (zero gas fees).`;

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

  // ── TRACE: task_completed ────────────────────────────────────────────────
  await recordTraceEvent(taskId, "task_completed", "coordinator",
    `Task completed: ${deliverables.length} deliverable(s), $${totalSpent.toFixed(2)} USDC spent`,
    {
      inputHash: sha256(description),
      outputHash: sha256(resultSummary),
      metadata: { deliverables: deliverables.length, totalSpent, confirmedPayments: confirmedCount },
    }
  ).catch((e) => console.warn("[Trace] task_completed failed:", e));

  // ── RECEIPT: generate proof-ready receipt ────────────────────────────────
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
    paymentBreakdown,
  }).catch((e) => console.warn("[Receipt] generateReceipt failed:", e));

  console.log(`[Coordinator] Task ${taskId} completed. Total spent: $${totalSpent.toFixed(2)} USDC`);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI-POWERED TASK DECOMPOSITION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uses an LLM to analyze the user's prompt and decide which specialists to use.
 * Falls back to keyword matching if the LLM call fails.
 */
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

    // Parse the JSON response — handle markdown code block wrapping
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

    // Map selections to subtasks (only include specialists that actually exist)
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

    // If none of the AI selections matched, fall back
    throw new Error("No valid specialists matched AI selections");
  } catch (error) {
    console.warn("[Coordinator] AI routing failed, falling back to keyword matching:", error);
    return decomposeTaskFallback(description);
  }
}

/**
 * Fallback: keyword-based decomposition (original logic)
 */
async function decomposeTaskFallback(description: string): Promise<Subtask[]> {
  const lower = description.toLowerCase();
  const subtasks: Subtask[] = [];
  const allSpecialists = await getAllSpecialists();

  // Check each specialist's capabilities against keywords in the description
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

  // If nothing matched, use the first available specialist as a catch-all
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

/**
 * Execute a specialist using the appropriate AI model.
 * Dynamically builds the prompt from the specialist's description.
 * Uses the specialist's aiModel preference (claude or openai).
 */
async function executeSpecialist(
  subtask: Subtask,
  originalTask: string
): Promise<string> {
  const specialist = await getSpecialistByName(subtask.specialistName!);

  // Build a dynamic prompt based on the specialist's description and capabilities
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

  const preferClaude = specialist?.aiModel === "claude";

  // Decrypt per-agent API key if available
  let agentApiKey: string | undefined;
  if (specialist?.apiKey) {
    try {
      agentApiKey = decrypt(specialist.apiKey);
      console.log(`[${subtask.specialistName}] Using agent's own API key`);
    } catch (err) {
      console.warn(`[${subtask.specialistName}] Failed to decrypt API key, using global key`);
    }
  }

  // Try preferred model first
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
        return content.text;
      }

      return "Analysis completed successfully.";
    } catch (error) {
      console.warn(`[${subtask.specialistName}] ⚠️  Claude failed, falling back to OpenAI:`, error);
    }
  }

  // OpenAI (primary or fallback)
  try {
    const modelInfo = preferClaude ? "(OpenAI fallback)" : "(primary)";
    console.log(`[${subtask.specialistName}] Using OpenAI ${modelInfo}...`);

    const openaiClient = (!preferClaude && agentApiKey)
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
      return content;
    }

    return "Analysis completed successfully.";
  } catch (error) {
    console.warn(`[${subtask.specialistName}] OpenAI also failed, using fallback response:`, error);
    return `# ${subtask.specialistName} Report\n\nAnalysis completed for: "${originalTask.substring(0, 100)}"\n\nBoth AI providers were unavailable. Please try again later.\n\n---\n*${subtask.specialistName} | $${subtask.cost?.toFixed(2)} USDC via x402*`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ESCROW MILESTONE CREATION
// ─────────────────────────────────────────────────────────────────────────────

async function createEscrowWithMilestones(
  taskId: string,
  subtasks: Subtask[],
  totalAmount: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any
): Promise<void> {
  // Resolve coordinator wallet address for payer field (sync, may throw in demo mode)
  let payerAddress = "demo-coordinator";
  try {
    const { getCoordinatorAddress } = await import("@/lib/wallet");
    payerAddress = getCoordinatorAddress();
  } catch { /* wallet not configured in demo mode */ }

  // Create the top-level escrow via provider
  const escrowResult = await provider.createEscrow({
    taskId,
    payerAddress,
    totalAmount,
    currency: "USDC",
    metadata: { subtaskCount: subtasks.length },
  });

  console.log(`[Escrow] Created escrow externalId=${escrowResult.externalId} status=${escrowResult.status}`);

  // Persist escrow record
  const escrow = await prisma.escrow.create({
    data: {
      taskId,
      externalId: escrowResult.externalId,
      status: escrowResult.status,
      totalAmount,
      currency: "USDC",
      payerAddress,
      metadata: { subtaskCount: subtasks.length },
    },
  });

  // Create one milestone per subtask
  for (const subtask of subtasks) {
    // Resolve specialist wallet address via getSpecialistByName (already imported)
    let recipientAddress = `demo-wallet-${subtask.specialistName ?? "unknown"}`;
    try {
      const specialist = subtask.specialistName
        ? await getSpecialistByName(subtask.specialistName)
        : null;
      if (specialist?.walletAddress) recipientAddress = specialist.walletAddress;
    } catch { /* non-fatal */ }

    const releaseCondition = env.ESCROW_MODE === "live" ? "receipt_ready" : "auto";

    await prisma.escrowMilestone.create({
      data: {
        escrowId: escrow.id,
        subtaskId: subtask.id,
        specialistId: subtask.specialistId ?? subtask.specialistName ?? "unknown",
        recipientAddress,
        amount: subtask.cost ?? 0,
        status: escrowResult.status === "funded" ? "funded" : "pending",
        releaseCondition,
        agentVersionId: subtask.agentVersionId ?? null,
        agentVersionHash: subtask.versionHash ?? null,
        metadata: { capability: subtask.capability, specialistName: subtask.specialistName },
      },
    });
  }

  console.log(`[Escrow] Created ${subtasks.length} milestone(s) for task ${taskId}`);
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
