# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Verix — **Verifiable Autonomous Work Infrastructure** on Stellar/Soroban. Multi-agent AI task orchestration with hash-chained execution traces, Trustless Work escrow settlement, and deterministic proof of workflow integrity.

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # prisma generate + next build
npm test             # vitest run (all tests)
npm run test:watch   # vitest interactive
npm run lint         # eslint
npm run demo:seed    # seed demo scenario data
npm run demo:reset   # clear demo data
npx tsc --noEmit     # type-check (run after every change)
npx prisma generate  # regenerate Prisma client after schema changes
npx prisma db push   # push schema to DB (dev)
```

Run a single test file:
```bash
npx vitest run src/services/__tests__/trace-chain.test.ts
```

## Operational Modes

Set via `APP_MODE` env var (auto-detected if not set):

| Mode | DB | AI keys | Blockchain | Use case |
|------|----|---------|------------|----------|
| `demo` | not required | optional | mocked | Quick local demo |
| `local` | required | optional (falls back to mock) | optional | Development |
| `production` | required | required | required | Live |

`ESCROW_MODE=disabled|demo|live` and `PROOF_MODE=disabled|local` are independent of `APP_MODE`.

## Architecture

### Core pipeline (`src/services/coordinator.ts`)

Five ordered stages per task:

1. **stageInitialize** — record `coordinator_start` trace event, set effective spend cap
2. **stageRoute** — AI decomposes task into subtasks, selects specialists, snapshots `registrySnapshotHash` (sha256 of sorted specialist registry)
3. **stageSpendCap** — reject if estimated total exceeds cap
4. **stageExecute** — Phase A: serial payment creation per subtask → Phase B: concurrent AI calls (`COORDINATOR_CONCURRENCY_LIMIT` batches via `Promise.allSettled`). Specialists may delegate subtasks to other specialists up to `COORDINATOR_DELEGATION_MAX_DEPTH` (default 1); delegation is rejected if depth is exceeded, budget is insufficient, or a specialist tries to delegate to itself.
5. **stageSynthesize** — build payment breakdown, call `generateReceipt()`, record `task_completed` event

### Hash-chained trace (`src/services/trace.ts`)

Every significant coordinator action appends an `ExecutionTraceEvent`. Each event commits to `(taskId, sequence, eventType, actor, inputHash, outputHash, prevEventHash)` via SHA-256, producing `eventHash`. The last event's hash is the **trace root** — a tamper-evident commitment to the entire execution history.

### Receipts and proofs (`src/services/receipt.ts`, `proofs/verifier.ts`)

`generateReceipt()` hashes a canonical JSON of all receipt fields including `registrySnapshotHash` and `traceRoot`. `proofs/verifier.ts` runs 5 deterministic checks:
1. Receipt integrity (recomputed hash matches)
2. Spend cap compliance (totalCost ≤ cap)
3. Payment correctness (sum of payment intents = totalCost)
4. Agent membership (agentVersionHashes non-empty)
5. Trace commitment (traceRoot is valid 64-char hex)

The verifier does **not** prove LLM outputs or off-chain computation quality.

### Escrow (`src/services/escrow.ts`, `src/lib/trustless-work.ts`)

Adapter pattern — `DemoEscrowAdapter` (in-process) or `TrustlessWorkAdapter` (Stellar/Soroban via REST API). Milestone release conditions: `proof_verified`, `receipt_ready`, `manual`, `auto`. `releaseEscrowMilestones()` is called after proof verification.

XDR signing modes: `TRUSTLESS_WORK_SIGNING_MODE=wallet` — server returns unsigned XDR; user signs via Albedo/Freighter in-browser. `TRUSTLESS_WORK_SIGNING_MODE=server` (default) — server signs XDR using `COORDINATOR_STELLAR_PRIVATE_KEY`.

### On-chain anchoring (`src/services/anchor.ts`)

After proof verification, receipt hashes are anchored to a Soroban `ReceiptAnchor` contract. Contract IDs are stored in `SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID` env var.

### Agents/specialists (`src/services/discovery.ts`, `src/services/routing.ts`)

Specialists are stored in the DB with `aiModel` (claude/openai/groq), `proofPolicy` (trace-only/receipt-proof/escrow-eligible), `priceUsdc`, and `walletAddress` (Stellar `G...` public key). Routing uses AI to match subtasks to specialists. Supported AI providers: Claude (Anthropic), GPT-4o (OpenAI), and Llama 3.3 70B via Groq's OpenAI-compatible API.

### Stellar payments (`src/lib/stellar-config.ts`, `src/services/payment.ts`)

Payments are USDC transfers on Stellar. Coordinator wallet key comes from `COORDINATOR_STELLAR_PUBLIC_KEY` / specialist keys from their registered Stellar public keys. Direct transfers and Trustless Work escrow are both supported.

## Key Constraints

- Published agents use Stellar public keys (`G...`) as payout addresses — never EVM addresses.
- The old SKALE/EVM/x402 path is deprecated and removed.
- Tailwind v4: use `bg-linear-to-r` not `bg-gradient-to-r` (applies to all gradient classes).
- TypeScript path alias: `@/` resolves to `src/*`.
- One branch per GitHub issue, stacked on the previous issue's branch. Create a consolidation PR to `main` after each EPIC.
- Never add `Co-Authored-By: Claude` to commits.

## Important Paths

| Path | Purpose |
|------|---------|
| `src/services/coordinator.ts` | Staged multi-agent execution pipeline |
| `src/services/trace.ts` | Hash-chained execution event recorder |
| `src/services/receipt.ts` | Canonical receipt generation + hashing |
| `proofs/verifier.ts` | Deterministic 5-constraint workflow verifier |
| `src/services/escrow.ts` | Trustless Work escrow adapter |
| `src/services/anchor.ts` | Soroban receipt-anchor service |
| `src/services/payment.ts` | Stellar USDC payment recording |
| `src/lib/stellar-config.ts` | Stellar network + Soroban RPC config |
| `src/lib/trustless-work.ts` | Trustless Work REST API client |
| `src/lib/env.ts` | Validated env config with mode detection |
| `src/lib/hash.ts` | `sha256()` and `hashCanonical()` primitives |
| `src/types/trace.ts` | `ExecutionTraceEvent`, `ExecutionReceipt`, all 37 event types |
| `src/types/proof.ts` | `ProofInput`, `ProofJournal`, schema v1.0 |
| `prisma/schema.prisma` | DB schema (Task, Specialist, Payment, Escrow, Proof, etc.) |

## Env Variables

Key variables (see `.env.local.example` for the full list):

```
APP_MODE                          # demo | local | production
DATABASE_URL                      # PostgreSQL
ENCRYPTION_KEY                    # 32-byte hex for AES-256-GCM field encryption
CLAUDE_API_KEY / OPENAI_API_KEY   # AI providers
STELLAR_NETWORK                   # testnet | mainnet
STELLAR_HORIZON_URL               # Horizon REST API
SOROBAN_RPC_URL                   # Soroban JSON-RPC
SOROBAN_AGENT_REGISTRY_CONTRACT_ID
SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID
ESCROW_MODE                       # disabled | demo | live
TRUSTLESS_WORK_API_URL / API_KEY
TRUSTLESS_WORK_SIGNING_MODE       # wallet | server (default: server)
PROOF_MODE                        # disabled | local
COORDINATOR_CONCURRENCY_LIMIT     # default 1 (serial)
COORDINATOR_DELEGATION_MAX_DEPTH  # default 1; set 0 to disable delegation
COORDINATOR_STELLAR_PRIVATE_KEY   # required for server-side XDR signing
GROQ_API_KEY                      # Groq AI provider
GROQ_MODEL                        # default: llama-3.3-70b-versatile
```
