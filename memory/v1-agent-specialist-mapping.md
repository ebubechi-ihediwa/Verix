---
name: v1-agent-specialist-mapping
description: How /api/v1 "Agent" maps onto the internal Specialist DB model
metadata:
  type: project
---

SDK gateway agents (`/api/v1/agents`) are stored as project-scoped `Specialist`
rows (model NOT renamed). Logic lives in `src/lib/v1-agents.ts`.

**Key gotcha:** `Specialist.name` is GLOBALLY `@unique` (discovery.ts upserts/
findUnique by name), so it cannot hold a per-project display name. Therefore:
- `Specialist.name` = generated unique sentinel `vx_agent_<hex>` (internal only).
- The developer-facing name + arbitrary settings live in the additive
  `Specialist.config` JSON column as `{ name, settings }`.
- `Specialist.endpoint` is set to the sentinel `"sdk:pending"` (no execution yet).
- `toAgentResponse()` reads `config.name` / `config.settings` back out.

**How to apply (real execution):** resolve an agent's display name from
`config.name`, not `Specialist.name`. Bearer auth for `/api/v1` is in
`src/lib/v1-auth.ts` → `findProjectByApiKey` (see [[console-auth-cookie-vs-legacy-session]]);
never use x-session-id for `/api/v1`. All v1 queries filter by `projectId`.

**Sprint 5B (current state) — PINNED execution works.** `POST /api/v1/executions`
now sets `requestedSpecialistId = agent.id` so the coordinator pins to the project
agent. The sentinel-leak problem is solved at one chokepoint: `toSpecialist()` in
`src/services/discovery.ts` now resolves the PUBLIC name (`config.name`) into
`Specialist.name` and keeps the sentinel on `Specialist.internalName`; the
exported `resolvePublicName()` is the helper, and `getSpecialistByName()` matches
public names too (so payment resolves SDK agents). Result: trace/receipt/payment
summaries all show the public name, never `vx_agent_`.
- `POST /api/v1/agents` also creates a v1 `AgentVersion` (public name + deterministic
  `computeVersionHash`) so proof constraint 4 (agent membership) passes; `walletAddress`
  is now validated as a Stellar `G...` key (422 otherwise).
- `agentType: "blend_yield"` runs a deterministic STUB in `src/services/agents/blend-yield.ts`
  (`runBlendYieldStub`) — no real Blend call; result is labelled `mode: "stub"`. The
  coordinator branches to it in `executeSpecialist` before any LLM call.

**Sprint 5C — payment is now ID-safe.** `createPayment(taskId, name, amount, specialistId?)`
resolves the recipient by `getSpecialistById(specialistId)` first (pinned/project
agents), falling back to `getSpecialistByName` only for legacy/unpinned subtasks
(seeded names are globally unique). Coordinator passes `subtask.specialistId` /
`child.specialistId`. So two project agents sharing a public `config.name` can no
longer cross-resolve wallets. Tests: `src/services/__tests__/payment-id-safety.test.ts`.

**Sprint 5C — live console tabs.** Cookie-authed owner-scoped read routes
`GET /api/projects/[id]/{agents,executions,verifications}` (in addition to the
Bearer `/api/v1/*`) back the console Agents/Receipts/Verifications tabs. Read
aggregation is in `src/lib/console-data.ts` (light — no coordinator import); it
resolves agent names via `resolvePublicName` (never the sentinel). ProjectSwitcher
is now live.

**Sprint 5D — Soroban receipt anchoring (status-tracked).** After proof
verification, `verifyProof` (in `src/services/proof.ts`) calls
`anchorReceipt()` in `src/services/receipt-anchor.ts` — a status-tracking,
idempotent, non-fatal wrapper over the existing `src/services/anchor.ts`
(`anchorVerifiedReceipt`, which owns the Soroban `receipt_anchor` contract call).
It records `ExecutionReceipt.anchorStatus` ("pending" | "anchored" | "failed");
if Soroban is unavailable it sets "pending" and never throws. `getAnchoredReceipt`
/ `isReceiptAnchored` / `toAnchorView` are the read helpers. Contract gained
`is_anchored()` (additive). `GET /api/v1/receipts/:hash` now returns
`{ receiptHash, receipt, proof, anchor }`; console Receipts/Verifications tabs
show anchor state via `AnchorBadge`. Tests: `receipt-anchor.test.ts`,
`api/v1/__tests__/receipts.test.ts`, `lib/__tests__/console-data.test.ts`.

**Sprint 6 — `@verix/sdk` shipped.** Typed Node SDK in `packages/sdk/` wrapping
`/api/v1/*` (`Verix` client → `.agents`/`.executions`/`.receipts`, typed errors,
`waitForAnchor` polling). It re-exports contracts from `src/types/sdk.ts` (single
source of truth — added `AnchorView` + `ReceiptGetResponse` there). Wired into the
monorepo via root tsconfig path `@verix/sdk` → `packages/sdk/src/index.ts` and a
vitest `include`/alias for `packages/**`. Zero runtime deps; build via tsup (not run
here). Tests: `packages/sdk/src/__tests__/sdk.test.ts`.

**Known follow-up (Sprint 7):** real Blend protocol calls — replace the stub in
`src/services/agents/blend-yield.ts` with on-chain Soroban supply/withdraw.
