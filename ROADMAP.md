# Verix — Product Roadmap

**The verifiable AI execution layer for Stellar DeFi.**

This document is the authoritative reference for what has been built, what is being built, and what comes next. It maps directly to the SCF Build Award milestone structure (Tranche 0–3) and adds the design and infrastructure work that must happen between tranches.

---

## Current State

The core orchestration and verification engine is production-grade and independently validated ("Best Technical Integration" — hackathon award). Every UI route exists, is wired to real services, and handles the full execution lifecycle.

### What is fully working today

| Component | Status | Notes |
|-----------|--------|-------|
| 5-stage coordinator pipeline | Production | Initialize → Route → Spend Cap → Execute → Synthesize |
| Hash-chained trace (37+ event types) | Production | SHA-256 per event, tamper-evident by construction |
| Canonical receipt engine | Production | Single SHA-256 commitment to full execution history |
| 5-constraint proof verifier | Production | Receipt integrity, spend cap, payment correctness, agent membership, trace commitment |
| Trustless Work escrow integration | Production | Multi-release, condition-gated, wallet-signed XDR |
| Agent reputation system | Production | Rolling weighted score, verified vs demo completions |
| Multi-provider AI routing | Production | Claude, OpenAI, Groq — cascade fallback |
| Agent delegation system | Production | Subcontracting with depth limits + spend cap tracking |
| Dashboard (chat + trace UI) | Production | Task submission, real-time SSE trace, approval gate |
| Marketplace | Production | Browse, filter, sort agents; capability and proof policy filters |
| Agent settings | Production | Publish, edit, delete specialists; encrypted API keys |
| Receipt explorer | Production | Full receipt view, 5-constraint proof display |
| Trace explorer | Production | Full hash-chained event log |

### What is stubbed or missing today

| Component | Status | Blocker |
|-----------|--------|---------|
| On-chain receipt anchoring (`anchor.ts`) | Stub | Contracts not deployed; fake txHash generated locally |
| Soroban contracts (deployment) | Written, undeployed | Needs funded coordinator wallet on testnet |
| DeFi protocol agents (Blend, Soroswap, Aquarius, Anchor) | Not built | Phase 1 must complete first |
| Agent deployment wizard (structured DeFi UI) | Not built | Phase 2 work |
| Live position monitor | Not built | Phase 2 work |
| Client-side receipt verification | Not built | Phase 3 work |
| Developer SDK | Not built | Phase 4 work |
| Public verification API | Not built | Phase 4 work |

---

## Phase 0 — Design System Consistency

**Status:** In progress  
**Dependency:** None — runs in parallel with Phase 1  
**Scope:** UI polish, not feature work

The landing page uses the dark Verix shell (`#09090f`, indigo accent). The app shell uses the light system (beige surface, ink text). Both are intentional — the split is correct. What is not correct is the internal inconsistency *within* the app: broken shadows (Tailwind shadow classes are zeroed by a global override), mixed spacing, status badges that look different across pages, and metadata that still says "Verifiable Autonomous Work Infrastructure" instead of the new positioning.

### Deliverables

- [ ] Fix all broken shadow instances across dashboard, marketplace, receipts, trace — replace Tailwind shadow classes with inline CSS
- [ ] Standardise status badge styles across all pages using `verix-status` design tokens
- [ ] Audit and fix typography inconsistencies (font sizes, letter-spacing, line-height) against `globals.css` tokens
- [ ] Update `layout.tsx` metadata title and description to reflect the DeFi trajectory
- [ ] Standardise empty state components across all pages
- [ ] Ensure all hover and focus states are consistent across interactive elements

### Success signal

A user moving from landing page → dashboard → marketplace → receipt page feels like one product, not three different apps.

---

## Phase 1 — On-Chain Infrastructure (Tranche 0)

**Status:** Not started  
**Dependency:** None — this is the critical path  
**SCF milestone:** Tranche 0 (10%)

This is the most important unblocked engineering work. `anchor.ts` is a complete stub — it generates a fake `txHash` by SHA-256-hashing a local string, never touches Soroban RPC. Every "anchored receipt" in the app today is a lie. Phase 1 makes the core value proposition real.

### 1.1 Deploy Soroban contracts to testnet

Both contracts are written in Rust and ready. They need a funded coordinator wallet and deployment to Stellar testnet.

```bash
cd contracts/soroban
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/receipt_anchor.wasm \
  --source coordinator \
  --network testnet
```

**Contracts:**
- `receipt_anchor` — immutable on-chain receipt storage. `anchor_receipt(receipt_hash, task_id_hash, trace_root, proof_ref)` panics if already anchored. Any party can query this to verify a receipt independently.
- `agent_registry` — on-chain agent version tracking. `register_agent()`, `update_version()`, `has_version()` enable on-chain agent membership proofs.

After deployment, set `SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID` and `SOROBAN_AGENT_REGISTRY_CONTRACT_ID` in `.env.local`.

### 1.2 Replace the `anchor.ts` stub

`src/services/anchor.ts` currently generates a pseudo-txHash like this:

```typescript
// Current stub — generates a fake hash, never touches Soroban
const pseudoTxHash = sha256(`soroban-anchor:${contractId}:${receiptHash}`);
```

Replace with a real Soroban contract invocation using `@stellar/stellar-sdk`:

```typescript
// Target — real Soroban invocation
const server = new SorobanRpc.Server(SOROBAN_RPC_URL);
const contract = new Contract(SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID);
const tx = await buildAnchorTransaction(receiptHash, taskIdHash, traceRoot, proofRef);
const result = await submitAndWait(server, tx);
return result.txHash; // real Stellar transaction hash
```

### 1.3 Wire Freighter signing into Trustless Work flow

Currently most escrow XDR signing falls back to server-side signing with `COORDINATOR_STELLAR_PRIVATE_KEY`. The target is wallet-signed XDR via Freighter for all user-initiated transactions.

**Flow to implement:**
1. Server builds unsigned XDR, returns it to client
2. Client requests Freighter signature via `@stellar/wallets-kit`
3. Client posts signed XDR back to server
4. Server submits to Horizon

This is partially built in `EscrowTimeline.tsx` for the deploy and funding steps. Extend it to cover milestone approval.

### 1.4 End-to-end testnet verification

After 1.1–1.3 are complete:
1. Submit a task in demo mode
2. Task executes → proof passes → `anchor.ts` invokes `anchor_receipt()` on Soroban
3. A real txHash is returned and stored in the DB
4. Navigate to the receipt page — click the anchor link
5. The txHash resolves on stellar.expert/explorer/testnet

**Success signal:** A real txHash from a Verix receipt is visible and confirmed on a public Stellar block explorer.

---

## Phase 2 — DeFi Agent Library (Tranche 1)

**Status:** Not started  
**Dependency:** Phase 1 must be complete (receipts need real on-chain anchoring)  
**SCF milestone:** Tranche 1 (20%)

The current "specialist agents" are generic AI workers (CodeAuditor, MarketAnalyst, DocWriter). None of them touch a DeFi protocol. Phase 2 builds the agents that justify why Verix runs on Stellar.

Each agent is a self-contained module. Each produces full trace events and anchored receipts. Each registers in the marketplace with `proofPolicy: "escrow-eligible"` and a real Stellar wallet address.

### 2a. Blend Protocol agent

**What it does:** Supplies and withdraws USDC from Blend lending pools. Monitors borrow and supply rates. Rebalances when yield thresholds are crossed.

**Inputs:** USDC amount, target pool, yield threshold (minimum acceptable APY), spend cap  
**Actions:** `supply(poolId, amount)`, `withdraw(poolId, amount)`, `getRates(poolId)`  
**Trace events:** `blend_rate_check`, `blend_supply_initiated`, `blend_supply_confirmed`, `blend_rebalance_triggered`  
**Receipt commitment:** includes pool ID, rate at execution time, amount supplied, txHash on Stellar

**Reference:** Blend Protocol SDK / REST API documentation

### 2b. Soroswap agent

**What it does:** Executes token swaps with configurable slippage limits. Monitors price for condition-based execution (e.g. "swap when XLM/USDC crosses 0.12").

**Inputs:** Asset pair, amount, slippage limit, optional price condition  
**Actions:** `getQuote(assetIn, assetOut, amount)`, `executeSwap(quote)`, `monitorPrice(pair, threshold)`  
**Trace events:** `soroswap_quote_fetched`, `soroswap_swap_initiated`, `soroswap_swap_confirmed`  
**Receipt commitment:** includes asset pair, quoted rate, executed rate, slippage, txHash

### 2c. Aquarius agent

**What it does:** Manages AMM liquidity positions. Tracks fee accrual in real time. Rebalances based on configurable parameters.

**Inputs:** Token pair, liquidity range, fee tier, rebalance threshold  
**Actions:** `getPoolState(pair)`, `addLiquidity(pair, amount)`, `removeLiquidity(positionId)`, `claimFees(positionId)`  
**Trace events:** `aquarius_pool_read`, `aquarius_liquidity_added`, `aquarius_fees_claimed`, `aquarius_rebalance_triggered`  
**Receipt commitment:** includes pool address, position ID, fees earned, amounts in/out, txHash

### 2d. Anchor payment agent

**What it does:** Routes cross-border USDC payments through optimal Stellar anchors. Compares rates and settlement times before executing. Delivers an auditable log of every transaction.

**Inputs:** Destination (country/currency), amount, max acceptable fee, max settlement time  
**Actions:** `queryAnchors(destination, amount)`, `compareRoutes(quotes)`, `executePayment(route)`  
**Trace events:** `anchor_routes_queried`, `anchor_route_selected`, `payment_path_built`, `payment_submitted`, `payment_settled`  
**Receipt commitment:** includes anchor selected, fee paid, exchange rate, settlement time, txHash

### Agent registration

Each agent is registered via the settings page with:
- `aiModel`: appropriate model for its task
- `proofPolicy`: `escrow-eligible`
- `walletAddress`: a real Stellar `G...` public key
- `capabilities`: specific to its protocol (e.g. `["blend-supply", "blend-withdraw", "yield-monitoring"]`)

---

## Phase 3 — Dashboard & UX Redesign (Tranche 2)

**Status:** Not started  
**Dependency:** Phase 2 must have at least one working DeFi agent  
**SCF milestone:** Tranche 2 (30%)

The current dashboard is a generic chat interface. For a DeFi execution layer it should feel like a control panel. The chat view is kept but demoted — it becomes a debug log, not the primary interface.

### 3.1 Agent deployment wizard

Replace the free-text task input with a structured deployment flow.

**Step 1 — Select agent type**
Four tiles: Yield Optimization (Blend), Token Trading (Soroswap), Liquidity Management (Aquarius), Payment Routing (Anchor). Each tile shows the protocol logo, a one-line description, and current availability.

**Step 2 — Configure mandate**
Protocol-specific parameter form:
- Yield: USDC amount, target pool, minimum APY, rebalancing frequency, spend cap
- Trading: Asset pair, size, slippage limit, optional price condition trigger
- Liquidity: Token pair, range, rebalance threshold, fee claim schedule
- Payments: Destination, amount, max fee, max settlement time

**Step 3 — Review and deploy**
Summary of the mandate, estimated cost (from routing pre-check), wallet to be used, escrow amount. Single "Deploy" button that submits the task and opens the escrow signing flow.

### 3.2 Live position monitor

For each active mandate, show a persistent monitoring card:
- Agent type and protocol
- Current on-chain position (balance, pool, liquidity amount)
- APY or yield earned since deployment
- Last action taken (with link to trace event)
- Next scheduled action
- Spend used / spend cap remaining
- Status: active / paused / completed / failed

### 3.3 Mandate history

Replace the flat task list in the sidebar with structured mandate history:
- Agent type icon
- Protocol (Blend / Soroswap / Aquarius / Anchor)
- Duration (deployed date → completed date)
- Total spend vs spend cap
- Outcome (receipts count, verified/failed)
- Link to most recent receipt

### 3.4 Execution log panel

The current chat trace view is useful for debugging. Keep it, but move it to a collapsible right-side panel labelled "Execution log". It surfaces:
- Real-time trace events as they stream
- Each event's hash and sequence number
- Actor badges (coordinator / specialist / payment)
- Link to full trace explorer for the task

---

## Phase 4 — Verification Tools & Developer Access (Tranche 2 continued + Tranche 3)

**Status:** Not started  
**Dependency:** Phase 1 must be complete for on-chain verification to be meaningful

### 4.1 Client-side receipt verification

The receipts page currently calls the server to verify. Add a fully client-side verification path so users can verify a receipt without trusting Verix.

**Implementation:** Port the 5-constraint verifier from `proofs/verifier.ts` to a browser-safe module. Run it against the receipt JSON fetched from the API. Display each constraint result independently — users can see exactly which check passed or failed and why.

### 4.2 Hash-chain visualiser on trace page

The trace page currently shows a flat event list. Add an interactive hash-chain validator:
- Each event row shows its `eventHash` and `prevEventHash`
- The `prevEventHash` of event N links visually to the `eventHash` of event N-1
- A green "chain intact" badge on each link confirms the hash matches
- If any link is broken, a red "chain broken" flag appears with the specific sequence number

This lets anyone verify the trace root independently by following the chain from the last event back to the first.

### 4.3 Soroban anchor status on receipt page

Once Phase 1 is live, add a live anchor status section to the receipt page:
- Query the `receipt_anchor` contract directly via Soroban RPC
- Show: anchored (yes/no), anchor timestamp, txHash with stellar.expert link
- This is the independent verification path — it reads from the contract, not from the Verix database

### 4.4 Public verification API

Unauthenticated endpoint for third-party verification:

```
GET /api/verify/:receiptHash
```

Returns:
```json
{
  "receiptHash": "...",
  "status": "verified",
  "constraints": {
    "receipt_integrity": true,
    "spend_cap": true,
    "payment_correctness": true,
    "agent_membership": true,
    "trace_commitment": true
  },
  "anchor": {
    "txHash": "...",
    "network": "testnet",
    "explorerUrl": "https://stellar.expert/explorer/testnet/tx/..."
  }
}
```

No API key required. Any third party can verify a Verix receipt using only this endpoint.

### 4.5 Verix Developer SDK

npm package: `verix-sdk`

```typescript
import { Verix } from "verix-sdk";

const verix = new Verix({ network: "mainnet" });

// Deploy an agent mandate
const mandate = await verix.deploy({
  agent: "blend-yield",
  params: { pool: "USDC-XLM", minApy: 0.08, spendCap: 50 },
  wallet: freighterAddress,
});

// Get a receipt
const receipt = await verix.getReceipt(mandate.receiptId);

// Verify independently
const result = await verix.verify(receipt);
// { verified: true, constraints: {...}, anchor: { txHash: "..." } }

// Subscribe to execution events
verix.onExecution(mandate.taskId, (event) => {
  console.log(event.eventType, event.actor, event.eventHash);
});
```

---

## Phase 5 — Mainnet Launch (Tranche 3)

**Status:** Not started  
**Dependency:** Phase 4, security review of Soroban contracts  
**SCF milestone:** Tranche 3 (40%)

### Deliverables

- Deploy `receipt_anchor` and `agent_registry` to Stellar mainnet (after SCF Audit Bank review)
- Migrate all testnet agent wallet addresses to mainnet `G...` keys
- Publish `verix-sdk` to npm
- Publish developer documentation to Stellar Developer Docs standards
- At least one external Stellar project integrates the Verix SDK
- RISC Zero upgrade path design document: defines how the TypeScript 5-constraint verifier would be replaced with a RISC Zero guest program for trustless ZK verification

---

## Execution sequence

```
Phase 0 (design consistency)   ──┐
                                  ├── parallel
Phase 1 (on-chain infra)       ──┘
         │
         ▼
Phase 2 (DeFi agents)          ── sequential: 2a → 2b → 2c → 2d
         │
         ▼
Phase 3 (dashboard redesign)   ──┐
                                  ├── parallel
Phase 4 (verification tools)   ──┘
         │
         ▼
Phase 5 (mainnet launch)
```

**Critical path:** Phase 1 is the blocker for everything downstream. It cannot be skipped or deferred — every feature in Phase 2–5 requires real on-chain anchoring to be credible.

---

## SCF milestone mapping

| Tranche | % | Phase | Key deliverable |
|---------|---|-------|-----------------|
| Tranche 0 | 10% | Phase 1 | Receipt anchored on Stellar testnet, real txHash verifiable on stellar.expert |
| Tranche 1 | 20% | Phase 2 | All 4 DeFi agents live on testnet with anchored receipts |
| Tranche 2 | 30% | Phase 3 + 4 | Agent deployment wizard, position monitor, client-side verification |
| Tranche 3 | 40% | Phase 5 | Mainnet deployment, SDK published, at least one external integration |

---

## Success metrics (from SCF PRD)

| Metric | Target |
|--------|--------|
| Verifiable receipts anchored on-chain | 500+ |
| Active DeFi agent types | 4 (Blend, Soroswap, Aquarius, Anchor) |
| Unique agent deployments | 50+ |
| External SDK integrations | 1+ |
| Public verification API uptime | 99%+ |
| Soroban contracts audited | 2 (Receipt Anchor, Agent Registry) |

---

*Last updated: 2026-06-08*  
*Version: 1.0 — initial roadmap*
