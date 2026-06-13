# Verix

**The verifiable AI execution layer for Stellar DeFi.**

Verix enables AI agents to act autonomously across Stellar's DeFi protocols — executing yield strategies on Blend, routing swaps on Soroswap, managing liquidity on Aquarius, and settling cross-border payments through anchors — while producing cryptographic proof of every action. Not trust that the agent did what it claimed. *Proof.*

Every execution produces a verifiable receipt anchored to Soroban. A single cryptographic commitment to the entire execution history — tamper-evident, independently verifiable, permanently on-chain.

---

## What Verix Does

### The Core Loop

1. **User defines a mandate** — "maximize my yield on Blend, stay within this spend cap, rebalance if rates shift"
2. **AI coordinator decomposes the mandate** into subtasks and routes each to the right specialist agent
3. **Agents act on-chain** — supplying liquidity to Blend pools, executing swaps on Soroswap, routing payments through anchors
4. **Every action is traced** — a hash-chained `ExecutionTraceEvent` is appended for each operation, producing a tamper-evident execution history
5. **A receipt is generated** — a canonical SHA-256 commitment to the task input, agent versions, trace root, spend cap, total cost, and payment summary
6. **A proof verifies integrity** — 5 deterministic constraints check that the receipt is internally consistent, the spend cap was honoured, and payments sum correctly
7. **Escrow releases automatically** — Trustless Work milestones on Stellar release USDC to agents after proof verification

### What Verix Proves

**Proven (execution integrity):**
- Task input hash — what the user asked for
- Agent version hashes — immutable snapshots of which agents ran, at what price, with what capabilities
- Registry snapshot hash — which agents were available at routing time
- Trace root — hash-chained commitment to every action in sequence
- Spend-cap compliance — total cost ≤ user-defined cap
- Payment correctness — sum of payments = total cost; all recipients are valid Stellar addresses
- Receipt hash integrity — recomputed hash matches the committed digest

**Not proven:** LLM output quality, off-chain computation correctness, or agent reasoning quality.

### Flagship Use Cases

**Yield Optimization** — A user deposits USDC into Blend Protocol. A Verix agent monitors yield rates across Blend pools, reallocates when better opportunities emerge, and produces a verifiable receipt for every reallocation.

**Payment Routing** — A business paying contractors across Africa and Latin America deploys a Verix agent that finds the optimal anchor route for each payment (best rate, lowest fee, fastest settlement), executes the Stellar path payment, and delivers an auditable log of every transaction.

**Treasury Management** — A Stellar-native protocol deploys a multi-agent Verix setup: one agent analyses market conditions, another executes operations on Soroswap or Aquarius, a third verifies outcomes match the mandate. Every step produces on-chain proof.

**Developer SDK** — Builders on Stellar embed Verix agents in their own products. A savings app offers "auto-yield" powered by a Verix Blend agent. The SDK handles agent logic, on-chain verification, and receipt infrastructure.

---

## Why Stellar

This is not a chain-agnostic product. Stellar is non-negotiable to what Verix does.

- **Soroban is the verification layer.** The Receipt Anchor contract stores verifiable execution receipts on-chain. On Ethereum, anchoring every receipt would be prohibitively expensive. On Stellar, it is practical.
- **Trustless Work enables agent escrow.** Milestone-based USDC payment for AI agents — gated by proof, not trust. This integration is native to Stellar.
- **Stellar's DeFi stack is the target.** Blend, Aquarius, Soroswap, and the anchor network are what Verix agents operate on.
- **USDC on Stellar is the settlement asset.** All agent fees, DeFi positions, and receipts are denominated in Stellar USDC.

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript 5 |
| Persistence | Prisma 7 + PostgreSQL (`@prisma/adapter-pg`) |
| AI Providers | Anthropic Claude, OpenAI, Groq — cascade fallback per agent |
| Blockchain | Stellar SDK 13.3, Soroban RPC |
| Escrow | Trustless Work REST API — USDC milestone settlement on Soroban |
| Wallet | Stellar Wallets Kit — Freighter, Albedo, LOBSTR, xBull |
| Contracts | Soroban: `receipt_anchor`, `agent_registry` (Rust) |
| Crypto | Node.js native `crypto` — SHA-256, AES-256-GCM |

### Coordinator Pipeline (5 Stages)

```
Initialize     → record coordinator_start trace event, set spend cap
Route          → AI decomposes task, selects agents, snapshots registrySnapshotHash
Spend Cap      → reject if estimated total > cap
Execute        → serial payment creation → concurrent agent calls
Synthesize     → build receipt, run proof, release escrow milestones
```

### Hash-Chained Trace

Every action appends an `ExecutionTraceEvent`:

```
eventHash = SHA-256({
  taskId, sequence, eventType, actor,
  inputHash, outputHash, prevEventHash
})
```

The last `eventHash` is the **trace root** — mutating any earlier event invalidates all subsequent hashes.

### Receipt Commitment

```
receiptHash = SHA-256(canonical JSON of {
  taskId, taskInputHash,
  agentVersionHashes[],      ← sorted, immutable version snapshots
  spendCap, totalCost,
  traceRoot,                 ← last eventHash in the chain
  registrySnapshotHash,      ← SHA-256 of agent registry at routing time
  outputHash,
  paymentSummary[]           ← [{specialist, amount, txHash, recipientAddress, versionHash}]
})
```

### 5-Constraint Proof Verifier

| # | Constraint | What It Checks |
|---|-----------|----------------|
| 1 | Receipt Integrity | Recomputed `receiptHash` matches committed digest |
| 2 | Spend Cap | `totalCost ≤ spendCap` |
| 3 | Payment Correctness | `∑payments ≈ totalCost` (±$0.001); all recipients match `/^G[A-Z2-7]{55}$/` |
| 4 | Agent Membership | All `agentVersionHashes` are non-empty strings |
| 5 | Trace Commitment | `traceRoot` is a valid 64-char hex SHA-256 |

### Soroban Contracts

**`receipt_anchor`** — immutable on-chain storage of verified receipts. `anchor_receipt(receipt_hash, task_id_hash, trace_root, proof_ref)` panics if already anchored. Any party can verify a Verix receipt independently by querying this contract.

**`agent_registry`** — on-chain agent version tracking. `register_agent()` and `update_version()` maintain a history of agent metadata hashes. `has_version(agent_id, version_hash)` enables membership proofs.

---

## Build Roadmap

### Current Status

The core orchestration and verification machinery is built and independently validated ("Best Technical Integration" — hackathon award).

| Component | Status |
|-----------|--------|
| 5-Stage Coordinator Pipeline | ✅ Production |
| Hash-Chained Trace (37+ event types) | ✅ Production |
| Canonical Receipt Engine | ✅ Production |
| 5-Constraint Proof Verifier | ✅ Production |
| Trustless Work Escrow Integration | ✅ Production (live credentials needed) |
| Agent Reputation System | ✅ Production |
| Multi-Provider AI Routing | ✅ Production |
| Agent Delegation System | ✅ Production |
| Soroban Contracts (code) | ✅ Written — deployment pending |
| On-Chain Receipt Anchoring | ⚠️ Stub — live Soroban invocation pending |
| Blend Protocol Agent | 🔜 Tranche 1 |
| Soroswap Trading Agent | 🔜 Tranche 1 |
| Aquarius Liquidity Agent | 🔜 Tranche 1 |
| Anchor Payment Agent | 🔜 Tranche 1 |
| DeFi Dashboard | 🔜 Tranche 2 |
| Developer SDK | 🔜 Tranche 3 |

### Tranche 0 — On-Chain Infrastructure
Deploy Receipt Anchor + Agent Registry to Stellar testnet. Replace `anchor.ts` stub with live `anchor_receipt()` Soroban invocations. Wire Freighter signing into Trustless Work escrow flow. End-to-end test: task → proof → receipt anchored → real txHash on Stellar explorer.

### Tranche 1 — DeFi Agent Library
- **Blend Agent** — supply/withdraw USDC; monitor rates; rebalance on yield threshold
- **Soroswap Agent** — execute swaps with slippage limits; condition-based price monitoring
- **Aquarius Agent** — manage AMM liquidity; track fee accrual; rebalance on parameters
- **Anchor Agent** — route cross-border USDC payments through optimal anchors; compare rates before executing

Each agent type produces full trace events and anchored receipts.

### Tranche 2 — Verification Dashboard
Agent deployment wizard (type → parameters → deploy with one wallet signature). Live position monitoring (balance, APY, fees accrued, last action). Receipt verification UI with Soroban explorer links. Escrow status panel with live milestone gates.

### Tranche 3 — Mainnet Launch & SDK
Full mainnet deployment of both Soroban contracts. Verix Developer SDK (npm package). Public receipt verification API. RISC Zero upgrade path design document. Soroban contract security review via SCF Audit Bank.

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — platform overview and entry points |
| `/dashboard` | Main console — connect wallet, submit tasks, view live execution |
| `/marketplace` | Browse and filter registered specialist agents |
| `/marketplace/[id]` | Agent profile — stats, capabilities, version history |
| `/settings` | Publish, edit, and delete your own specialist agents |
| `/receipts/[id]` | Receipt explorer — cryptographic commitments and proof status |
| `/trace/[id]` | Execution trace — full hash-chained event log |

---

## Operational Modes

Set via `APP_MODE` in `.env.local` (auto-detected if not set):

| Mode | Database | AI Keys | Blockchain | Use case |
|------|----------|---------|------------|----------|
| `demo` | not required | optional | mocked | Quick local demo |
| `local` | required | optional | optional | Development |
| `production` | required | required | required | Live deployment |

`ESCROW_MODE=disabled|demo|live` and `PROOF_MODE=disabled|local` are independent of `APP_MODE`.

---

## Environment Setup

Copy `.env.local.example` to `.env.local`:

```env
APP_MODE=local                    # demo | local | production

DATABASE_URL=postgresql://user:password@localhost:5432/verix
ENCRYPTION_KEY=<64-char hex>      # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# AI Providers (all optional — cascade fallback to mock)
CLAUDE_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
GROQ_API_KEY=gsk_...

# Stellar Network
COORDINATOR_STELLAR_PUBLIC_KEY=G...
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_EXPLORER_URL=https://stellar.expert/explorer/testnet
STELLAR_USDC_CODE=USDC
STELLAR_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

# Soroban Contracts
SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID=C...
SOROBAN_AGENT_REGISTRY_CONTRACT_ID=C...

# Trustless Work Escrow
ESCROW_MODE=demo                  # disabled | demo | live
TRUSTLESS_WORK_API_URL=https://dev.api.trustlesswork.com
TRUSTLESS_WORK_API_KEY=...
TRUSTLESS_WORK_SIGNER_ADDRESS=G...
TRUSTLESS_WORK_ESCROW_TYPE=multi-release
TRUSTLESS_WORK_SIGNING_MODE=wallet   # wallet | server

# Required for server-side milestone release signing
COORDINATOR_STELLAR_PRIVATE_KEY=S...

PROOF_MODE=local                  # disabled | local
COORDINATOR_CONCURRENCY_LIMIT=2
COORDINATOR_DELEGATION_MAX_DEPTH=1
```

---

## Development

```bash
npm install
npx prisma generate
npx prisma db push          # create tables (dev only)
npm run dev                 # Next.js dev server with Turbopack
```

If routes hang after a code change:

```bash
rm -rf .next && npm run dev
```

Run checks:

```bash
npm test                    # vitest test suite
npx tsc --noEmit            # type-check
npm run lint                # eslint
npm run build               # prisma generate + next build
npx vitest run src/services/__tests__/trace-chain.test.ts   # single file
```

---

## Demo

Seed built-in specialist agents and demo data:

```bash
npm run demo:seed
```

The canonical demo prompt:

> Audit a Soroban escrow milestone release flow for security risks, compare the market positioning against existing AI work platforms, and produce a concise investor-ready launch memo with proof-backed settlement requirements.

Expected flow:

1. Coordinator snapshots the agent registry, routes to CodeAuditor ($1.00), MarketAnalyst ($0.75), CreativeWriter ($0.50) — total $2.25 USDC
2. Spend-cap check passes (under the $5.00 demo cap)
3. Serial payment intents recorded on Stellar
4. Specialist AI calls execute; trace events stream live to the dashboard
5. Receipt commits to input hash, agent version hashes, trace root, spend cap, outputs, payment summary
6. Local verifier checks all 5 constraints — proof marked verified
7. Trustless Work escrow milestones release automatically (`ESCROW_MODE=live`)

Reset demo data:

```bash
npm run demo:reset -- --force
npm run demo:reset -- --force --include-agents   # also removes demo agents
```

---

## Escrow Flow (Trustless Work)

Set `ESCROW_MODE=live` to settle real USDC on Stellar testnet.

**Wallet signing mode (`TRUSTLESS_WORK_SIGNING_MODE=wallet`):**

1. Task submits → coordinator routes, records payment intents
2. Trustless Work deploys a multi-release escrow contract — unsigned XDR returned
3. User signs **deploy transaction** via Freighter or Albedo
4. User signs **funding transaction** — escrow is live on Stellar
5. Agents execute; receipt generated; proof verified
6. User clicks **Approve payout** — server runs 3-step on-chain release per milestone:
   - `change-milestone-status` → `approve-milestone` → `release-milestone-funds`

**Server signing mode (`TRUSTLESS_WORK_SIGNING_MODE=server`):**
All XDR signing done server-side using `COORDINATOR_STELLAR_PRIVATE_KEY`. No wallet interaction after task submission.

---

## Agent Versioning

Every time a specialist's price, wallet address, capabilities, proof policy, or AI model changes, a new immutable `AgentVersion` snapshot is created:

```
versionHash = SHA-256("name|version|price|walletAddress|capabilities|proofPolicy|aiModel")
```

Subtasks pin the version active at invocation time. Receipts commit to the sorted array of all `versionHash` values used. Any party can verify exactly what each agent's configuration was at the time they ran.

---

## Soroban Contracts

Contract sources are in `contracts/soroban/`.

```bash
cd contracts/soroban
cargo build --target wasm32-unknown-unknown --release
```

See `contracts/soroban/README.md` for deploy and invocation commands.

---

## Contributing

See [AGENT_GUIDE.md](./AGENT_GUIDE.md) for publishing specialist agents.
See [TESTING.md](./TESTING.md) for the full end-to-end QA checklist.

---

*Verix — Making Stellar DeFi intelligent, verifiable, and autonomous.*
