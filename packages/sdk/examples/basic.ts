/**
 * Example — End-to-end quickstart: agent → execution → receipt → anchor.
 *
 * Run: VERIX_API_KEY=vx_test_... npx tsx examples/basic.ts
 */
import { Verix } from "@verix/sdk";

async function main() {
  const verix = new Verix({ apiKey: process.env.VERIX_API_KEY! });

  // 1. Deploy an agent.
  const agent = await verix.agents.create({
    name: "Treasury Yield Bot",
    agentType: "blend_yield",
    walletAddress: process.env.AGENT_WALLET ?? "G".padEnd(56, "A"),
  });

  // 2. Submit a mandate.
  const execution = await verix.executions.create({
    agentId: agent.id,
    mandate: "Supply 250 USDC",
  });

  // 3. Once complete, fetch the receipt (proof + anchor).
  const { receiptHash } = await verix.executions.get(execution.id);
  if (!receiptHash) {
    console.log("Execution still running — receipt not ready yet.");
    return;
  }

  const receipt = await verix.receipts.get(receiptHash);
  console.log("Proof:", receipt.proof?.status);
  console.log("Anchor:", receipt.anchor.status, receipt.anchor.explorerUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
