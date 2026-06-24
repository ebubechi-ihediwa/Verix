/**
 * Example 1 — Create an agent.
 *
 * Run: VERIX_API_KEY=vx_test_... npx tsx examples/create-agent.ts
 */
import { Verix } from "@verix/sdk";

async function main() {
  const verix = new Verix({ apiKey: process.env.VERIX_API_KEY! });

  const agent = await verix.agents.create({
    name: "Treasury Yield Bot",
    agentType: "blend_yield",
    walletAddress: process.env.AGENT_WALLET ?? "G".padEnd(56, "A"),
    price: 1.5,
    config: { asset: "USDC", supplyAmount: 250 },
  });

  console.log("Created agent:", agent.id, "—", agent.name);
  console.log(await verix.agents.list());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
