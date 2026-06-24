/**
 * Example 2 — Run an execution.
 *
 * Run: VERIX_API_KEY=vx_test_... AGENT_ID=... npx tsx examples/run-execution.ts
 */
import { Verix } from "@verix/sdk";

async function main() {
  const verix = new Verix({ apiKey: process.env.VERIX_API_KEY! });

  const execution = await verix.executions.create({
    agentId: process.env.AGENT_ID!,
    mandate: "Supply 250 USDC to the best Blend pool",
    spendCap: 10,
  });

  console.log("Execution submitted:", execution.id, "status:", execution.status);

  // Inspect status / trace / receipt as it progresses.
  const detail = await verix.executions.get(execution.id);
  console.log("Agent:", detail.agent?.name);
  console.log("Trace events:", detail.trace?.eventCount ?? 0);
  console.log("Receipt hash:", detail.receiptHash ?? "(pending)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
