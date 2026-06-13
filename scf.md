# Verix — Product Requirements Document
### The Verifiable AI Execution Layer for Stellar DeFi
**Version 1.0 | SCF Build Award — Open Track**

---

## 1. The Problem

Stellar's DeFi ecosystem is growing. Blend Protocol is live with lending and borrowing. Aquarius manages liquidity incentives. Soroswap enables on-chain trading. Anchors bridge fiat to stablecoins across emerging markets. The infrastructure exists.

But there is a ceiling.

Every interaction with these protocols today requires a human decision or a custom, one-off script. There is no trusted, autonomous layer sitting between a user's intent and the execution of that intent across Stellar's DeFi stack. No intelligence layer. No way to say: "maximize my yield on Blend, rebalance if rates shift, stay within this risk threshold — and prove to me everything happened correctly."

This is the gap. And it is not a small one.

**The consequences:**

- Liquidity is passive. Capital sits in positions that humans are too slow or too busy to rebalance.
- Sophistication is gated. Only technical users who can write custom automation interact with DeFi intelligently. Everyone else clicks buttons manually.
- Trust is absent. When an agent or script acts on someone's behalf, there is no proof it did what it claimed — no audit trail, no verifiable receipt, no accountability.
- Protocols underperform. Blend, Aquarius, and Soroswap are only as active as the humans who choose to interact with them. That is a hard cap on volume, TVL, and ecosystem growth.

No blockchain has cleanly solved the AI agent trust problem in DeFi. Stellar can be the first.

---

## 2. The Vision

**Verix is the verifiable AI execution layer for Stellar DeFi.**

It enables AI agents to act autonomously across Stellar's protocols — executing DeFi strategies, routing payments, managing positions — while producing cryptographic proof of every action. Not trust that the agent did what it claimed. *Proof.*

This is not automation for automation's sake. Verix makes Stellar's DeFi stack accessible to a new class of participant: users who want AI to manage their on-chain activity, developers who want to build agent-powered financial products, and institutions that need auditable, bounded AI execution before they will let agents touch real money.

Verix removes the intelligence ceiling on Stellar DeFi.

---

## 3. What Verix Becomes

### 3.1 Core Product: The DeFi Agent Execution Layer

Verix is a platform where users deploy AI agents that:

- **Monitor** Stellar DeFi protocols in real time — rates, liquidity depth, yield opportunities, price movements
- **Decide** what actions to take, within user-defined constraints (spend caps, risk thresholds, asset limits)
- **Execute** those actions on-chain — supplying liquidity to Blend pools, executing swaps on Soroswap, routing payments through anchors, adjusting positions on Aquarius
- **Prove** that every action happened correctly — which agent ran, what it cost, what it did, that no constraint was violated, and that funds moved to exactly the right addresses

Every execution produces a verifiable receipt anchored to Soroban. The receipt is a single cryptographic commitment to the entire execution history — tamper-evident, independently verifiable, permanently on-chain.

### 3.2 Flagship Use Cases

**Use Case 1 — Yield Optimization Agent**
A user deposits USDC into Blend Protocol. A Verix agent monitors yield rates across Blend pools, reallocates liquidity when better opportunities emerge, and produces a verifiable receipt for every reallocation. The user sees a dashboard showing every decision, every execution, every dollar moved — with proof that the agent stayed within their defined parameters.

**Use Case 2 — Payment Routing Agent**
A business paying contractors across Africa and Latin America deploys a Verix agent that finds the optimal anchor route for each payment (best rate, lowest fee, fastest settlement), executes the Stellar path payment, and delivers an auditable log of every transaction. Compliance teams get receipts. No spreadsheets. No manual reconciliation.

**Use Case 3 — Treasury Management Agent**
A Stellar-native protocol or DAO deploys a multi-agent Verix setup: one agent analyzes market conditions and DeFi risk, another executes approved operations on Soroswap or Aquarius, a third verifies outcomes match the mandate. Every step produces on-chain proof. Governance can verify the treasury was managed exactly as voted.

**Use Case 4 — Developer SDK — Agent-Powered DeFi Apps**
Developers building on Stellar can embed Verix agents into their own products. A savings app can offer "auto-yield" powered by a Verix yield agent. A neobank can offer "AI-managed DeFi exposure" with one tap. The Verix SDK handles the agent logic, the on-chain verification, and the receipt infrastructure.

---

## 4. Why Stellar — Not Another Chain

This is not a chain-agnostic product that happens to run on Stellar. Stellar is non-negotiable to what Verix does.

**Soroban is the verification layer.** The Receipt Anchor contract (already built) stores verifiable execution receipts on-chain. Soroban's smart contract environment makes this anchoring cheap, fast, and final — properties that matter enormously for high-frequency agent operations. On Ethereum, anchoring every receipt would be prohibitively expensive. On Stellar, it is practical.

**Trustless Work enables agent escrow.** Verix uses Trustless Work's Soroban-based escrow to hold agent fees in USDC until execution is verified and approved. This is milestone-based payment for AI agents — gated by proof, not trust. This integration is native to Stellar and does not exist in this form on any other chain.

**Stellar's DeFi stack is the target market.** Blend, Aquarius, Soroswap, and the anchor network are the protocols Verix agents operate on. This is not an abstraction layer over generic DeFi — it is purpose-built for Stellar's specific protocols and their specific interfaces.

**USDC on Stellar is the settlement asset.** All agent fees and DeFi positions are denominated in USDC on Stellar. The payment infrastructure, the escrow, the receipts — everything is denominated in and settled via Stellar's native USDC rails.

Verix cannot exist in its full form anywhere else.

---

## 5. Technical Foundation

Verix enters this build with significant prior work that de-risks the SCF scope.

### 5.1 What Already Exists

| Component | Status | Description |
|---|---|---|
| 5-Stage Coordinator Pipeline | ✅ Built | Orchestrates multi-agent task execution with spend cap enforcement |
| Hash-Chained Trace System | ✅ Built | 37+ event types, cryptographic chain of custody for every execution |
| Execution Receipt Engine | ✅ Built | Canonical SHA-256 receipt committing to agents, costs, trace root, and payment summary |
| 5-Constraint Proof Verifier | ✅ Built | Deterministic verification of receipt integrity, spend cap, payment correctness, agent membership, trace commitment |
| Soroban Receipt Anchor Contract | ✅ Built (stub) | Immutable on-chain receipt storage — needs funded deployment and live invocation |
| Soroban Agent Registry Contract | ✅ Built (stub) | On-chain agent version tracking — needs funded deployment |
| Trustless Work Escrow Integration | ✅ Built | USDC milestone-based escrow via Soroban, with multi-release and condition-gated approval |
| Agent Reputation System | ✅ Built | Rolling weighted score separating verified completions from demo completions |
| Multi-Provider AI Routing | ✅ Built | Claude, OpenAI, Groq with cascade fallback |
| Delegation System | ✅ Built | Agents subcontracting to other agents with depth limits and spend cap tracking |
| Hackathon Validation | ✅ Awarded | "Best Technical Integration" — independent technical validation of the core architecture |

### 5.2 What Needs to Be Built (SCF Scope)

The existing system proves the execution and verification machinery works. What SCF funding builds is the **DeFi application layer** on top of it — the actual protocol integrations, the user-facing product, and the full on-chain deployment.

---

## 6. SCF Build Scope

### 6.1 Scope Overview

The SCF build converts Verix from a verified orchestration engine into a live DeFi intelligence layer on Stellar mainnet. Four work streams:

1. **On-Chain Infrastructure** — Deploy and activate the Soroban contracts; move from integration stubs to live on-chain anchoring
2. **DeFi Agent Library** — Build purpose-built agents for Blend, Aquarius, Soroswap, and the anchor network
3. **Verification Dashboard** — User-facing interface for deploying agents, setting parameters, and verifying execution receipts
4. **Developer SDK** — Enable other Stellar builders to embed Verix agents in their own products

### 6.2 Milestone Plan

SCF Build Awards are distributed across four tranches (10% / 20% / 30% / 40%). The following milestone plan maps to that structure.

---

#### Tranche 0 — Foundation (10%)
**Goal: On-chain infrastructure live on Stellar testnet**

Deliverables:
- Deploy Receipt Anchor contract to Stellar testnet with funded coordinator wallet
- Deploy Agent Registry contract to Stellar testnet
- Replace `anchor.ts` stub with live Soroban contract invocations — real `anchor_receipt()` calls, real on-chain txHash returned
- Replace pseudo-txHash generation with actual Stellar transaction hashes
- Freighter wallet integration for user-signed Trustless Work XDR transactions (vs server-only signing)
- End-to-end test: task executes → proof passes → receipt anchored on-chain → txHash verifiable on Stellar explorer

Success criteria: A verifiable receipt can be independently confirmed on Stellar testnet via any block explorer.

---

#### Tranche 1 — DeFi Agent Library (20%)
**Goal: Agents that operate on Stellar's live DeFi protocols**

Deliverables:
- **Blend Protocol Agent** — supplies and withdraws liquidity from Blend pools; monitors borrow/supply rates; executes reallocation when yield thresholds are met
- **Soroswap Trading Agent** — executes token swaps with slippage limits; monitors price for condition-based execution
- **Aquarius Liquidity Agent** — manages AMM liquidity positions; tracks fee accrual and rebalances based on user-defined parameters
- **Anchor Payment Agent** — routes cross-border USDC payments through optimal Stellar anchors; compares rates and settlement times before executing
- Each agent type produces full trace events and anchored receipts
- Spend cap enforcement active on all agent types — agents cannot exceed user-defined budgets

Success criteria: Each agent type executes a live operation on Stellar testnet with a verifiable on-chain receipt.

---

#### Tranche 2 — Verification Dashboard & UX (30%)
**Goal: A usable product that non-technical users can operate**

Deliverables:
- **Agent Deployment Interface** — users select agent type (yield, payment, trading, liquidity), set parameters (spend cap, risk tolerance, target protocols, rebalancing frequency), and deploy with one wallet signature
- **Live Execution Feed** — real-time view of agent activity: what the agent is doing, what it spent, what it earned, what decisions it made
- **Receipt Verification UI** — for any execution receipt, the user can independently verify all 5 proof constraints and view the full hash-chained trace; links to Stellar explorer for on-chain confirmation
- **Reputation Dashboard** — per-agent verified completion history, success rate, cost history
- **Escrow Status Panel** — live view of milestone gates, release conditions, USDC balances held in Trustless Work escrow
- Freighter and Albedo wallet connection for all transaction signing
- Mobile-responsive design

Success criteria: A non-technical user can deploy a Blend yield agent, let it run for 48 hours, and independently verify every action it took without asking Verix for help.

---

#### Tranche 3 — Mainnet Launch & Ecosystem Integration (40%)
**Goal: Live on Stellar mainnet, open to the ecosystem**

Deliverables:
- Full mainnet deployment — Receipt Anchor and Agent Registry contracts live on Stellar mainnet
- **Verix Developer SDK** — npm package enabling other Stellar builders to embed Verix agent execution in their products; includes agent templates, receipt verification, and webhook callbacks for execution events
- Integration documentation for Stellar DeFi protocols (Blend, Aquarius, Soroswap) — how each protocol is called, what parameters agents use, what edge cases exist
- **RISC Zero proof upgrade path** — design document and proof-of-concept for replacing the local TypeScript verifier with a RISC Zero guest program; establishes the path to trustless ZK verification in a future build
- Security review of Soroban contracts prior to mainnet deployment (via SCF Audit Bank)
- Public API for receipt verification — any third party can verify a Verix receipt without using the Verix interface
- Developer documentation published to Stellar Developer Docs standards
- At least one integration with an existing Stellar project using the Verix SDK

Success criteria: Verix is live on mainnet. At least one external Stellar project has integrated the Verix SDK. Receipts are independently verifiable by any party using only on-chain data.

---

## 7. How Verix Grows the Stellar Ecosystem

### 7.1 Direct Ecosystem Impact

**More activity on existing protocols.** Every Verix agent deployed to Blend, Aquarius, or Soroswap is a persistent source of transaction volume, liquidity rebalancing, and protocol usage that does not require a human to be actively engaged. Protocols grow in activity density, not just user count.

**New builders entering Stellar.** AI-native developers have no compelling reason to choose Stellar today. Verix gives them one. A developer building an AI-powered personal finance product, a yield automation tool, or an agent-based payment system now has a home on Stellar with infrastructure designed for their use case. Verix is an acquisition channel for a class of builder the ecosystem currently misses.

**Institutional AI finance becomes viable.** Before enterprises deploy AI agents to manage real money, they need audit trails. Verix's verifiable receipt system — receipts anchored on Soroban, independently verifiable, cryptographically committed — is the compliance layer that makes institutional AI DeFi possible on Stellar. This is a positioning upgrade for the entire network.

**Compounding value within the SCF portfolio.** Protocols like Blend, Blockroll, Fundable Finance, and Bloccpay are already funded by SCF. Verix agents operate on these protocols. An SCF-funded infrastructure layer that makes other SCF-funded protocols more powerful creates compounding ecosystem value within the fund's own portfolio.

### 7.2 Soroban as the Differentiator

Every verifiable receipt Verix anchors is a demonstration that Soroban enables things other chains cannot cheaply or practically replicate. The Receipt Anchor contract is not a novelty — it is a live argument for Soroban's unique value. Every use of Verix is ecosystem marketing at the protocol level.

---

## 8. Success Metrics

| Metric | Target (Mainnet Launch) |
|---|---|
| Verifiable receipts anchored on-chain | 500+ |
| Active DeFi agent types | 4 (Blend, Soroswap, Aquarius, Anchor) |
| Unique agent deployments | 50+ |
| External SDK integrations | 1+ |
| Proof verification public API uptime | 99%+ |
| Soroban contracts audited | 2 (Receipt Anchor, Agent Registry) |

---

## 9. Team Capability Evidence

- **Hackathon validation** — "Best Technical Integration" award demonstrates independent expert assessment of the core Verix architecture
- **Existing codebase** — 5-stage coordinator pipeline, hash-chained trace system, 5-constraint proof verifier, Soroban contracts (Receipt Anchor + Agent Registry), Trustless Work escrow integration, and multi-provider AI routing are all built and functional
- **Stellar/Soroban experience** — Active Stellar SDK 13.3 and Soroban RPC integration in production codebase; Rust smart contracts deployed and tested
- **Full-stack capability** — Next.js 16, TypeScript 5, Prisma/PostgreSQL, React 19; team can ship the entire product without external dependency
- **AI integration depth** — Multi-provider AI routing (Claude, OpenAI, Groq) with cascade fallback and per-agent model preferences already implemented

---

## 10. Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Soroban contract deployment complexity | Contracts already written and tested; Tranche 0 is specifically scoped to de-risk this before DeFi work begins |
| DeFi protocol API changes | Modular agent architecture — each protocol integration is an isolated module; one protocol changing does not break others |
| Proof is local TypeScript, not ZK | Explicitly scoped as a known limitation; RISC Zero upgrade path is a Tranche 3 deliverable, not a promise |
| AI agent output quality cannot be guaranteed | Verix proves execution integrity, not output quality — this distinction is explicit in all documentation and user-facing copy |
| Spend cap edge cases in concurrent execution | COORDINATOR_CONCURRENCY_LIMIT defaults to 1 (serial); parallelism is opt-in with documented trade-offs |

---

## 11. What This Is Not

- **Not a trading bot.** Verix does not make speculative trading decisions. Agents operate within user-defined constraints and spend caps. Users define the mandate; agents execute it.
- **Not a custodial product.** Users sign their own transactions via Freighter or Albedo. Verix does not hold private keys.
- **Not a general-purpose AI platform.** Verix is purpose-built for Stellar DeFi execution. The agent library, the receipt format, the Soroban contracts, and the escrow integration are all specific to this ecosystem.
- **Not a proof of concept.** The core orchestration and verification machinery is already built and independently validated. SCF funding builds the DeFi application layer on top of it — not the foundation.

---

*Verix — Making Stellar DeFi intelligent, verifiable, and autonomous.*