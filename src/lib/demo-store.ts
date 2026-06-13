/**
 * Singleton in-memory stores for demo / no-DB mode.
 *
 * Pinned to globalThis so they survive Turbopack HMR module re-evaluations.
 * Without this, trace events and receipts written during an execution are lost
 * the moment any imported module is hot-reloaded.
 */

import { ExecutionTraceEvent } from "@/types/trace";
import { ExecutionReceipt } from "@/types/trace";

type DemoGlobal = {
  __demoTraceStore: Map<string, ExecutionTraceEvent[]> | undefined;
  __demoReceiptStore: Map<string, ExecutionReceipt> | undefined;
};

const g = globalThis as unknown as DemoGlobal;

if (!g.__demoTraceStore) g.__demoTraceStore = new Map();
if (!g.__demoReceiptStore) g.__demoReceiptStore = new Map();

export const demoTraceStore: Map<string, ExecutionTraceEvent[]> = g.__demoTraceStore;
export const demoReceiptStore: Map<string, ExecutionReceipt> = g.__demoReceiptStore;
