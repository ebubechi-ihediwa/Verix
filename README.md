# Verix

Verifiable Autonomous Work Infrastructure for hackathon demos: users submit
complex work, specialist agents execute subtasks, traces are hash-chained,
receipts are proof-checked, and settlement is modeled through Stellar/Soroban
escrow flows powered by Trustless Work.

## Current Architecture

- **App**: Next.js App Router, React, TypeScript
- **Persistence**: Prisma + PostgreSQL
- **Agents**: versioned specialist registry with proof policies
- **Execution**: staged coordinator pipeline with spend-cap checks
- **Trace**: structured hash-chained execution events
- **Proofs**: local deterministic workflow verifier
- **Settlement**: Stellar/Soroban + Trustless Work escrow milestones
- **Contracts**: minimal Soroban `agent_registry` and `receipt_anchor`

## What Is Proven

The proof path verifies workflow integrity, not LLM inference:

- task input commitment
- selected agent version hashes
- registry snapshot hash
- trace root consistency
- spend-cap compliance
- payout split total correctness
- receipt hash integrity

## Environment

Copy `.env.local.example` to `.env.local`.

Key Stellar/Soroban variables:

```env
COORDINATOR_STELLAR_PUBLIC_KEY=G...
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_USDC_CODE=USDC
STELLAR_USDC_ISSUER=G...
TRUSTLESS_WORK_API_URL=https://dev.api.trustlesswork.com
TRUSTLESS_WORK_API_KEY=...
TRUSTLESS_WORK_SIGNER_ADDRESS=G...
TRUSTLESS_WORK_ESCROW_TYPE=multi-release
SOROBAN_AGENT_REGISTRY_CONTRACT_ID=C...
SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID=C...
```

## Development

```bash
npm install
npx prisma generate
npm run dev
```

## Golden-Path Demo Data

Seed the judge demo scenario with one repeatable task and three specialist
agents:

```bash
npm run demo:seed
```

The seeded prompt is:

```text
Audit a Soroban escrow milestone release flow for security risks, compare the market positioning against existing AI work platforms, and produce a concise investor-ready launch memo with proof-backed settlement requirements.
```

Expected demo flow:

1. Coordinator snapshots the agent registry and routes to CodeAuditor,
   MarketAnalyst, and CreativeWriter.
2. Spend-cap enforcement checks the $5.00 USDC demo cap.
3. Specialist executions create trace events and Stellar/Trustless Work payout
   intents.
4. Receipt generation commits to the input, agent versions, trace root, spend
   cap, outputs, and payout summary.
5. The result card exposes approval, proof verification, escrow status, and
   Trustless Work viewer links.
6. Proof verification plus payer approval can unlock Trustless Work milestone
   release.

In the dashboard, use **Load demo flow** to prefill the canonical prompt and
demo spend cap. In `ESCROW_MODE=demo`, escrow IDs and transaction hashes are
clearly synthetic; in `ESCROW_MODE=live`, real Trustless Work viewer links are
shown when external contract IDs are available.

Reset only demo-owned task data:

```bash
npm run demo:reset -- --force
```

Reset the demo task plus demo-owned agents:

```bash
npm run demo:reset -- --force --include-agents
```

The reset script is intentionally scoped to `ownerId = "demo:golden-path"` and
the deterministic demo task ID. It refuses to run without `--force`.

Run checks:

```bash
npm test
npx tsc --noEmit --incremental false
npm run build
```

## Soroban Contracts

Contract sources live in `contracts/soroban`.

```bash
cd contracts/soroban
cargo build --target wasm32-unknown-unknown --release
```

See `contracts/soroban/README.md` for deploy and invocation commands.

## Trustless Work

Trustless Work handles escrow creation, funding, milestone status, and release
on Stellar/Soroban. Verix does not duplicate escrow contracts; it anchors agent
and receipt trust metadata while using Trustless Work for settlement.
