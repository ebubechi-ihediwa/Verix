# Hackathon Demo Script

## Setup

```bash
npm install
npx prisma generate
npm run demo:seed
npm run dev
```

Open:

```text
http://localhost:3000/demo
```

## Golden Prompt

```text
Audit a Soroban escrow milestone release flow for security risks, compare the market positioning against existing AI work platforms, and produce a concise investor-ready launch memo with proof-backed settlement requirements.
```

## Demo Flow

1. Start on `/demo`.
2. Click `Start Golden Path`.
3. Show the execution graph as the coordinator routes work to:
   - CodeAuditor
   - MarketAnalyst
   - CreativeWriter
4. Point out the spend cap:
   - demo cap: `$5.00 USDC`
   - expected specialist total: `$2.25 USDC`
5. Show trace events forming the workflow timeline.
6. Open the receipt once generated.
7. Show that the receipt commits to:
   - task input hash
   - agent version hashes
   - registry snapshot hash
   - trace root
   - spend cap
   - payment summary
8. Generate or verify the proof.
9. Show proof status moving to `verified`.
10. Show Trustless Work escrow milestone release state.

## Judge Talking Points

- Verix is not proving LLM inference.
- Verix proves workflow integrity and settlement correctness.
- The proof boundary is intentionally practical for hackathon delivery.
- Trustless Work provides Stellar/Soroban escrow infrastructure.
- The product value is trustless autonomous work: agents can be paid when the
  workflow receipt verifies.

## Fallback Plan

If external services fail:

1. Use `/demo` fallback preview. It is labeled `Fallback Preview`.
2. Set `DEMO_FALLBACKS_ENABLED=true` only for controlled presentation recovery.
3. Explain that fallback proof artifacts use `verifierType = "demo-fallback"`.
4. Do not describe demo fallback artifacts as live Boundless proofs.

## Reset

Reset demo task runtime data:

```bash
npm run demo:reset -- --force
npm run demo:seed
```

Reset demo task and demo-owned agents:

```bash
npm run demo:reset -- --force --include-agents
npm run demo:seed
```

## Final Smoke Test

Before presenting:

```bash
npx tsc --noEmit --incremental false
npm test -- --run src/lib/__tests__/receipt-canonical.test.ts src/lib/__tests__/hash.test.ts src/services/__tests__/trace-chain.test.ts
npm run build
npm run demo:seed
```
