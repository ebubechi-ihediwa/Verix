import { Payment } from "@/types/payment";
import { prisma } from "@/lib/db";
import { getCoordinatorAddress } from "@/lib/wallet";
import { isStellarPublicKey, stellarTxExplorerUrl } from "@/lib/stellar-config";
import { getSpecialistById, getSpecialistByName } from "@/services/discovery";

async function persistPayment(payment: Payment, dbSpecialistId?: string): Promise<void> {
  if (!dbSpecialistId) return;

  try {
    await prisma.payment.upsert({
      where: { id: payment.id },
      create: {
        id: payment.id,
        taskId: payment.taskId,
        specialistId: dbSpecialistId,
        amount: payment.amount,
        currency: payment.currency,
        txHash: payment.txHash,
        blockNumber: payment.blockNumber,
        fromAddress: payment.from,
        toAddress: payment.to,
        status: payment.status,
        protocol: payment.protocol,
        createdAt: new Date(payment.createdAt),
        confirmedAt: payment.confirmedAt ? new Date(payment.confirmedAt) : null,
      },
      update: {
        amount: payment.amount,
        currency: payment.currency,
        txHash: payment.txHash,
        blockNumber: payment.blockNumber,
        fromAddress: payment.from,
        toAddress: payment.to,
        status: payment.status,
        protocol: payment.protocol,
        confirmedAt: payment.confirmedAt ? new Date(payment.confirmedAt) : null,
      },
    });
  } catch (error) {
    console.error(`[Payment] Failed to persist payment ${payment.id}:`, error);
  }
}

/**
 * Stellar/Trustless Work settlement intent.
 *
 * The old SKALE/x402 path transferred funds before specialist execution. The
 * hackathon target is proof-gated escrow release on Stellar/Soroban, so this
 * function now records the intended per-agent payout that receipts and escrow
 * milestones commit to. Actual release happens through Trustless Work after
 * proof verification.
 */
export async function createPayment(
  taskId: string,
  specialistName: string,
  amount: number,
  specialistId?: string
): Promise<Payment> {
  // Resolve the recipient by ID first when available (pinned/project agents).
  // Public display names (config.name) are NOT globally unique, so resolving a
  // project agent's wallet by name could pick another project's agent. The ID
  // path eliminates that. Legacy/unpinned subtasks carry no specialistId and
  // fall back to name lookup (seeded specialists have globally-unique names).
  const specialist =
    (specialistId ? await getSpecialistById(specialistId) : undefined) ??
    (await getSpecialistByName(specialistName));
  const coordinator = safeCoordinatorAddress();
  const recipient = specialist?.walletAddress;

  if (!recipient || !isStellarPublicKey(recipient)) {
    const payment = failedPayment(taskId, specialistName, amount, coordinator, recipient);
    await persistPayment(payment, specialist?.id);
    return payment;
  }

  const intentId = crypto.randomUUID();
  const payment: Payment = {
    id: intentId,
    taskId,
    specialistId: specialistName,
    amount,
    currency: "USDC",
    txHash: `stellar-intent-${intentId}`,
    from: coordinator,
    to: recipient,
    status: "confirmed",
    protocol: "trustless_work",
    createdAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
  };

  await persistPayment(payment, specialist?.id);
  return payment;
}

export async function verifyPayment(txHash: string): Promise<boolean> {
  if (txHash.startsWith("stellar-intent-")) return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(stellarTxExplorerUrl(txHash), {
      method: "HEAD",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function settleViaAP2(
  paymentId: string
): Promise<{ settled: boolean; settlementId: string }> {
  console.log(`[Payment] AP2 settlement skipped; Stellar/Trustless Work handles settlement for ${paymentId}`);
  return { settled: true, settlementId: crypto.randomUUID() };
}

function safeCoordinatorAddress(): string {
  try {
    return getCoordinatorAddress();
  } catch {
    return "stellar-coordinator-not-configured";
  }
}

function failedPayment(
  taskId: string,
  specialistName: string,
  amount: number,
  coordinator?: string,
  recipient?: string
): Payment {
  return {
    id: crypto.randomUUID(),
    taskId,
    specialistId: specialistName,
    amount,
    currency: "USDC",
    from: coordinator,
    to: recipient,
    status: "failed",
    protocol: "trustless_work",
    createdAt: new Date().toISOString(),
  };
}
