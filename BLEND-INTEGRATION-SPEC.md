# Sprint 7 — Real Blend Protocol Integration: Implementation Specification

> Status: **DESIGN ONLY** — no implementation code. Supersedes the
> `runBlendYieldStub` placeholder (Sprint 5B). Scope is **supply + withdraw only**.
> No auto-compounding, rebalancing, arbitrage, or routing.

---

## Part 1 — Existing Blend Readiness

| Area | Status | Notes |
|------|--------|-------|
| **Blend integration code** | 🟡 Partial (stub + legacy) | Two paths exist. `src/services/agents/blend-yield.ts` (`runBlendYieldStub`) is the deterministic Sprint 5B stub the coordinator actually calls. `src/services/defi/blend-agent.ts` (`runBlendAgent`) is an older demo agent: real Blend rate API attempt with mock fallback, supply/withdraw/check-rates/rebalance, **mock txHashes**, real trace events — but **not** wired into the coordinator/receipt pipeline. Hardcoded testnet pool IDs (USDC/XLM) live here. |
| **Stellar SDK usage** | 🟢 Present | `@stellar/stellar-sdk` is a dependency, dynamically imported. `src/lib/stellar-config.ts` has `signStellarXdr(xdr, secret)`, `fetchStellarAccount()`, network/passphrase/explorer config, `isStellarPublicKey()`. `src/services/anchor.ts` is the **reference Soroban contract-call pattern**: `rpc.Server` → `Contract.call` → `simulateTransaction` → `assembleTransaction` → `sign` → `sendTransaction` → poll `getTransaction`. |
| **Soroban contract usage** | 🟢 Present | `anchor.ts` invokes the `receipt_anchor` contract end-to-end (build args via `nativeToScVal`/`xdr.ScVal`, simulate, assemble, sign, submit, confirm). Same machinery applies to Blend pool contracts. `is_anchored` added Sprint 5D. |
| **Wallet handling** | 🟡 Public-key only | `src/lib/wallet.ts`: `getCoordinatorAddress()` (public key), balance reads via Horizon. **Signing is wallet-managed** — the app holds no agent/user secret keys. Only `COORDINATOR_STELLAR_PRIVATE_KEY` exists (server signer, used for anchoring). `generateMockWallet()` returns a placeholder. No per-agent custody/signing today. |
| **Receipt generation** | 🟢 Present, must stay frozen | `src/services/receipt.ts` `generateReceipt()` → `hashReceiptCommitment()` over `{taskId, taskInputHash, agentVersionHashes, spendCap, totalCost, traceRoot, outputHash, registrySnapshotHash, paymentSummary}`. `src/lib/hash.ts` `canonicalize()` **omits absent keys** (conditionally-spread fields don't alter other receipts). `outputHash = sha256(resultSummary)`. |
| **Proof generation** | 🟢 Present | `src/services/proof.ts` + `proofs/verifier.ts`: deterministic 5-constraint journal (receipt integrity, spend cap, payment correctness, agent membership, trace commitment). Triggered post-receipt; verification triggers Soroban anchoring (Sprint 5D). **No Blend-specific change required** — Blend data is committed via `traceRoot`. |
| **Coordinator execution flow** | 🟢 Integration point identified | `src/services/coordinator.ts` → `executeSpecialist(subtask, description)` (~L967) branches on `specialist.agentType === "blend_yield"` and returns `SpecialistResult { output, model, provider }`. Pinned subtask carries `specialistId`, `agentVersionId`, wallet. `stageSynthesize` builds `paymentBreakdown` + `resultSummary` and calls `generateReceipt`. Phase A = agent fee payment; Phase B = `executeSpecialist` (where Blend work runs). |
| **Trace event vocabulary** | 🟢 Already registered | `src/types/trace.ts` `TraceEventType` already includes `blend_rate_check`, `blend_supply_initiated`, `blend_supply_confirmed`, `blend_withdraw_initiated`, `blend_withdraw_confirmed`, `blend_rebalance_triggered`. No renames needed. |
| **Env / config** | 🔴 Missing | No `BLEND_*` env vars. Pool IDs are hardcoded in `defi/blend-agent.ts`. No funds-source/signing-mode config for Blend. No USDC SAC (Stellar Asset Contract) address for Soroban transfers. |
| **Agent config plumbing** | 🟢 Present | SDK agents store `config.settings` JSON (`Specialist.config`); surfaced to the coordinator as `Specialist.config` (developer settings). `runBlendYieldStub` already reads `asset`/`supplyAmount`/`targetPool`. |

**What exists:** Soroban tx machinery, signing primitive, trace vocabulary, receipt/proof pipeline, coordinator hook, agent config storage, rate-fetch scaffold.
**What is missing:** real pool-contract `submit` calls, a funds-source/signing model for moving user assets, pool discovery/config (env), structured operation data flowing out of `executeSpecialist`, receipt display surface for the operation, balance/asset pre-checks.
**What to reuse:** `anchor.ts` Soroban call pattern, `signStellarXdr`, `stellar-config`, existing `blend_*` trace events, `fetchBlendRates()` (extract + harden), the pinned-execution path, `traceRoot` as the commitment vehicle.

---

## Part 2 — Real Blend Architecture (`blend_yield`)

New module: `src/services/agents/blend/` — `pool-discovery.ts`, `supply.ts`, `withdraw.ts`, `client.ts` (Soroban pool client), `config.ts` (validation), `index.ts` (`runBlendYield`). The coordinator's `executeSpecialist` calls `runBlendYield(ctx)` instead of `runBlendYieldStub` once live; the stub remains as the offline/demo fallback when `BLEND_MODE !== "live"`.

`SpecialistResult` is extended (additive optional field) to carry structured operation data out of `executeSpecialist`:
```
SpecialistResult { output, model, provider, operation?: BlendOperationResult }
```
`stageExecute` threads `operation` onto the subtask / execution result so `stageSynthesize` can surface it (display-only; commitment is via trace).

### Supply

1. **Inputs** — from `Specialist.config.settings` (agent defaults) merged with the execution mandate/`config` override: `asset` (e.g. "USDC"), `amount` (USDC units), optional `minApy`, `maxSlippage`; plus context: `taskId`, `subtaskId`, `agentName` (public), source wallet, `spendCap`, `network`.
2. **Validation** — `operation === "supply"`; `asset` is a supported/configured pool asset; `amount > 0`; `amount ≤ spendCap` (see Part 3); source wallet is a valid `G…` with sufficient on-chain balance of `asset` (Horizon `fetchStellarAccount`) + XLM for fees; pool resolved + reachable; if `minApy` set, current pool `supplyApy ≥ minApy` (else **abort, no tx**).
3. **Transaction construction** — resolve pool contract id (`pool-discovery`); build the Blend `Pool.submit(from, spender, to, requests=[{ request_type: SUPPLY_COLLATERAL, address: <asset SAC>, amount: <i128 scaled> }])` operation. Prefer `@blend-capital/blend-sdk` for correct request encoding; fall back to raw `Contract.call` with `nativeToScVal`. Simulate via `rpc.Server.simulateTransaction` to obtain footprint + fees.
4. **Submission** — sign per `BLEND_SIGNING_MODE`: `server` (coordinator key signs, testnet/demo) or `wallet` (return unsigned XDR; user signs out-of-band — async, see 7D). `assembleTransaction(tx, sim).sign(keypair)` → `sendTransaction`.
5. **Confirmation** — poll `getTransaction(hash)` until `SUCCESS`/`FAILED` (reuse `anchor.ts` poll loop; bounded ~30s). On `FAILED`/timeout → mark subtask failed, record failure trace, no receipt of success.
6. **Receipt generation** — unchanged hashing. The confirmation trace event (`blend_supply_confirmed`) carries `{ txHash, poolId, asset, amount, supplyApy }` and its `outputHash = sha256(txHash)`; this is hash-chained into `traceRoot` → already committed by the receipt. The structured `blendOperation` is stored additively for display (Part 4). The agent **fee** payment (Phase A) is unaffected.
7. **Proof generation** — unchanged. Constraint 5 (trace commitment) now transitively covers the Blend tx; constraints 1–4 unchanged. No verifier edits.

### Withdraw

1. **Inputs** — same shape; `operation === "withdraw"`, `amount` = USDC to withdraw (or `"max"` resolving to current position balance).
2. **Validation** — `amount > 0`; source wallet **has an existing Blend position** ≥ `amount` in that pool (read position via pool/backstop or Blend SDK `Pool.loadUser`); pool reachable. `minApy`/`maxSlippage` not applicable to withdraw (ignored with a note). Spend-cap interaction: withdraw returns funds, so it does **not** consume cap (cap still gates the agent fee).
3. **Transaction construction** — `Pool.submit(... requests=[{ request_type: WITHDRAW_COLLATERAL, address: <asset SAC>, amount }])`; simulate.
4. **Submission** — same signing modes.
5. **Confirmation** — same poll.
6. **Receipt** — `blend_withdraw_confirmed` trace carries `{ txHash, poolId, asset, amount }`; committed via `traceRoot`.
7. **Proof** — unchanged.

---

## Part 3 — Agent Configuration

```ts
interface BlendYieldConfig {
  asset: string;                       // "USDC" (resolved to a configured pool + SAC)
  amount: number;                      // USDC units, > 0
  minApy?: number;                     // supply-only floor, e.g. 0.05 (5%)
  maxSlippage?: number;                // reserved; Blend supply/withdraw has no AMM slippage
  operation: "supply" | "withdraw";
}
```

**Source/precedence:** agent defaults from `Specialist.config.settings`; per-execution overrides from `CreateExecutionRequest.config`. Effective config = `{ ...settings, ...executionConfig }`.

**Validation rules**
- `operation` ∈ `{"supply","withdraw"}` (reject others, incl. legacy `rebalance`/`check-rates`).
- `asset` non-empty and maps to a configured pool (`BLEND_POOLS` registry); else `unsupported_asset`.
- `amount` finite, `> 0`; reject `NaN`/negative/zero.
- `minApy` (if present) `0 ≤ minApy ≤ 1`; interpreted as a fraction.
- `maxSlippage` (if present) `0 ≤ maxSlippage ≤ 1`; **documented as inert** for v1 (Blend supply/withdraw is not an AMM swap). Kept in the type for forward-compat; surfaced in trace metadata only.
- Supply: `amount ≤ effectiveSpendCap`. Withdraw: `amount ≤ on-chain position`.

**Spend-cap interaction**
- The mandate spend cap (`Task.spendCap`) governs **two distinct costs**: (a) the agent **fee** (`Specialist.priceUsdc`, paid Phase A) and (b) for **supply**, the principal moved into Blend. Design: `stageSpendCap` continues to gate the fee; the Blend module independently enforces `supply.amount ≤ remaining cap` and records a `spend_cap_check` trace. Withdraw does not consume cap.
- If `fee + supplyAmount > spendCap` → abort before any tx with `spend_cap_exceeded`.

**Failure cases** (all → subtask failed, failure trace, no false receipt-of-success)
- `validation_error` (bad asset/amount/operation).
- `apy_below_minimum` (supply, `supplyApy < minApy`) — abort, no tx.
- `insufficient_balance` (source lacks asset or XLM fee).
- `insufficient_position` (withdraw > position).
- `pool_unreachable` / `pool_not_found`.
- `simulation_failed` (Soroban sim error).
- `tx_failed` / `tx_timeout` (submission/confirmation).
- `signing_unavailable` (wallet mode, no signature yet) → execution parks in a pending-signature state (7D), not a hard failure.

---

## Part 4 — Receipt Extensions (backwards compatible)

**Principle:** *do not change canonical receipt-hash behavior.* The Blend operation is **cryptographically committed via `traceRoot`** (the confirmation trace event hash-chains `txHash`/`poolId`/`asset`/`amount`/`apy`), which the receipt already commits to. No new field enters `hashReceiptCommitment`.

**Display surface (additive, NOT in the hash):**
```jsonc
{
  "protocol": "blend",
  "operation": "supply",
  "asset": "USDC",
  "amount": 250,
  "txHash": "…",
  "poolId": "…",
  "apy": 5.24
}
```
Stored as an additive nullable column `ExecutionReceipt.blendOperation Json?` (or `operationMetadata Json?` for protocol-generality) — **excluded from `hashReceiptCommitment`** so existing/non-Blend receipt hashes are byte-identical. Exposed on `GET /api/v1/receipts/:hash` as a sibling of `anchor` (e.g. `operation`), and on `ExecutionDetail`.

**Backwards-compatibility guarantees:** column nullable (legacy rows → `null`); canonical hasher omits absent keys; verifier unchanged (still validates the same 5 constraints, and the operation is provable by re-deriving the trace event hashes against `traceRoot`). Defer the actual schema/route change to **7B** (constraint: "do not modify receipts yet").

---

## Part 5 — Trace Events

Map the five required stages to existing events first; **only two additive events are proposed**, and **no `specialist_*` or existing `blend_*` events are renamed.**

| Stage | Event | Status |
|------|-------|--------|
| Pool discovery | `blend_rate_check` | ✅ exists (rate/pool query) |
| Pool selection | `blend_pool_selected` | ➕ **new (additive)** — explicit committed record of the chosen `poolId` + `supplyApy`. (Alternatively fold into `blend_rate_check` metadata; a distinct event is cleaner for the verifier/console.) |
| Transaction construction | `blend_supply_initiated` / `blend_withdraw_initiated` | ✅ exists (carry built-op metadata: poolId, asset, amount, sim fee) |
| Transaction submission | `blend_tx_submitted` | ➕ **new (additive)** — records the submitted tx hash before confirmation, so a crash between submit and confirm is auditable. (Alternatively reuse the `*_initiated` event with an added `txHash`.) |
| Transaction confirmation | `blend_supply_confirmed` / `blend_withdraw_confirmed` | ✅ exists (final `txHash`, `apy`, `amount`; `outputHash = sha256(txHash)`) |

**Decision:** add `blend_pool_selected` and `blend_tx_submitted` to the `TraceEventType` union (purely additive — appending union members does not alter existing event hashing or break the verifier). If minimality is preferred, both can be expressed as metadata on existing events; the spec recommends the two explicit events for auditability and console clarity. **No event renames; no change to `recordTraceEvent` hashing.**

---

## Part 6 — Security Review

| Concern | Analysis | Risk |
|--------|----------|------|
| **Wallet ownership** | The agent's `walletAddress` is a **public key**; Verix holds no agent/user secret. Moving *user* funds into Blend requires either (a) the user's signature (wallet mode) or (b) a custodial signer. Using `COORDINATOR_STELLAR_PRIVATE_KEY` to source/sign means the **coordinator custodies funds** — acceptable on **testnet only**. | 🔴 **High (prod):** server custody of user funds. Mitigate: production must use `BLEND_SIGNING_MODE=wallet` (unsigned XDR → Freighter/Albedo). Never sign user-asset moves with a shared server key on mainnet. |
| **Transaction signing** | Reuse `signStellarXdr` / `anchor.ts` sign+submit. Server mode signs in-process; secret only in env. Wallet mode returns unsigned XDR; nothing signed server-side. | 🟠 Medium: env secret exposure. Mitigate: secret never logged/returned; sign only after simulation; least-privilege key. |
| **Spend cap enforcement** | Enforced twice: `stageSpendCap` (agent fee) + Blend module (`supply.amount ≤ remaining cap`) before tx. | 🟠 Medium: cap bypass if Blend path skips the check. Mitigate: hard pre-tx assertion + `spend_cap_check`/`spend_cap_exceeded` trace; unit-tested. |
| **Replay protection** | Stellar txs carry account sequence numbers → a signed XDR can't be replayed once consumed. Risk is **re-submitting the same logical op** (double supply) on retry. | 🟠 Medium. Mitigate: idempotency key = `(taskId, subtaskId, operation)`; before building, check no prior `blend_*_confirmed` exists for the subtask; the durable `Job` row + atomic claim already guards re-runs. |
| **Duplicate execution** | Coordinator jobs are claimed atomically (`queued→running`) and enqueue is idempotent. But a **timeout between submit and confirm** could prompt a retry that double-spends. | 🔴 **High.** Mitigate: persist the submitted tx hash via `blend_tx_submitted` **before** confirmation; on retry, first `getTransaction(lastHash)` to reconcile instead of re-submitting; never re-build if a confirmed event exists. |
| **Failed transaction handling** | Sim failure → abort pre-submit. Submit/confirm failure → subtask failed, `*_failed`/`task_failed` trace, no success receipt; agent fee handling per existing payment rules. | 🟠 Medium: partial state (funds moved but app thinks failed). Mitigate: confirmation is source of truth; reconcile via `getTransaction`; surface explicit failed state in console; no receipt-of-success without a confirmed tx. |
| **Pool authenticity** | Wrong/hostile pool id could route funds to an attacker contract. | 🔴 **High.** Mitigate: pools come from a **vetted allowlist** (`BLEND_POOLS` env/registry), never from free-form user input; reject unknown pool ids. |
| **Amount scaling / precision** | USDC has 7 decimals on Stellar; i128 scaling errors can over/under-supply. | 🟠 Medium. Mitigate: centralized scaling util + tests; assert `simulated.amount === intended`. |
| **APY/oracle trust** | `minApy` gate relies on the rate source; a spoofed low/high APY could mislead the gate. | 🟢 Low (gate only blocks/permits; funds path is the pool contract). Note rate source in trace metadata. |

---

## Part 7 — Sprint Breakdown

### Sprint 7A — Pool Discovery ✅ DELIVERED
- **Files:** `src/services/agents/blend/{types,config,pool-discovery,index}.ts` (new) + `__tests__/pool-discovery.test.ts`; `src/lib/env.ts` (+`BLEND_MODE`, `BLEND_NETWORK`, `BLEND_API_URL`, `BLEND_POOLS`); `src/types/trace.ts` (+`blend_pool_selected`, additive); `src/services/coordinator.ts` (blend branch → `runBlendDiscovery`; `executeSpecialist` gains `taskId`). The Sprint 5B `blend-yield.ts` stub remains (offline fallback / its tests). **No receipt/contract changes.**
- **Outcome:** `getPools()` (live + deterministic mock fallback) and `selectBestPool()` (pure; highest-APY, minApy gate, allowlist). Coordinator does real discovery + selection, records `blend_rate_check` + `blend_pool_selected`, then **stops before tx** and returns a labelled stub. No funds move. 10/10 tests pass.

### Sprint 7B — Supply Execution ✅ DELIVERED
- **Files:** `src/services/agents/blend/{client,supply,scaling,signing,status}.ts` (new) + `__tests__/{scaling,supply}.test.ts`; `index.ts` (exports); `src/services/coordinator.ts` (blend branch runs `executeBlendSupply` for `operation="supply"`; `executeSpecialist` gains `spendCap`; `SpecialistResult.operation`/`ExecuteResult.operations` threaded to `generateReceipt`); `src/types/trace.ts` (+`blend_tx_submitted`, additive); `prisma/schema.prisma` (+`ExecutionReceipt.blendOperation Json?`, additive migration); `src/services/receipt.ts` (persist `blendOperation` **outside** `hashReceiptCommitment`); `src/app/api/v1/receipts/[hash]/route.ts` (surface `operation`).
- **Outcome:** real testnet server-signed supply via the `anchor.ts` Soroban pattern (simulate→assemble→sign→send→poll). Flow: validate → spend-cap → resolve signer → **balance check before signing** → build → submit (`blend_tx_submitted`) → confirm (`blend_supply_confirmed`, commits txHash via traceRoot). 7-decimal i128 scaling. `blendOperation` is additive + excluded from the receipt hash (golden test proves non-Blend hashes unchanged). 13/13 new tests pass. **No withdraw, no mainnet, no wallet-mode** (deferred to 7C/7D).

### Sprint 7C — Withdraw Execution ✅ DELIVERED
- **Refactor:** extracted the shared lifecycle into `src/services/agents/blend/operation.ts` (validation, discovery+selection, signing, submission, confirmation, status transitions, error handling, `BlendOperationError`/`BlendDiscoveryError`). `client.ts` generalized `submitSupply`→`submitPoolRequest({…, requestType})` + added `loadUserPosition`. `signing.ts` `resolveSupplySigner`→`resolveServerSigner`. `supply.ts`/`withdraw.ts` are now **thin descriptors** (request type + op-specific amount prep); `index.ts` re-exports + `runBlendDiscovery` reuses `discoverAndSelect`. No duplicated submission logic.
- **Files:** new `operation.ts`, `withdraw.ts`, `__tests__/withdraw.test.ts`; rewritten `supply.ts`, `client.ts`, `index.ts`, `__tests__/supply.test.ts`; `config.ts` (`amount: number|"max"`, `getAssetContractId`); `types.ts` (`BlendPosition`, unified `BlendExecuteInput`/`BlendOperationResult`); `coordinator.ts` (withdraw branch via `executeBlendWithdraw`).
- **Outcome:** testnet server-signed withdraw via the same engine. Loads on-chain position, resolves `"max"`→full position, rejects over-withdraw (`insufficient_position`), **does not consume spend cap**. Trace `blend_withdraw_initiated → blend_tx_submitted → blend_withdraw_confirmed` (txHash committed via traceRoot); `blendOperation` (operation:"withdraw") persisted additively. **No receipt-hash/contract changes.** 26/26 Blend tests pass (incl. engine-reuse test). Testnet + server-signing only.

### Sprint 7D — Execution Reliability & Mainnet Readiness ✅ DELIVERED
- **Platform layer (`src/services/protocols/`):** `execution-status.ts` (10-state `ExecutionStatus` machine + `canTransition`), `execution-timeline.ts` (`TimelineRecorder` + ordering), `reconcile.ts` (`reconcileOrSubmit` — never double-submit), `types.ts` (`ProtocolAdapter`), `blend-adapter.ts` + `registry.ts` (Blend behind a reusable interface), `diagnostics.ts` (replay/inspect/diagnose), `index.ts`.
- **Blend integration:** `signing.ts` `resolveSigningMode` (server|wallet); `client.ts` split into composable primitives (`buildPoolRequestXdr` / `submitSignedXdr` / `submitPoolRequest` / `getTransactionStatus` / `inspectTransaction` / `replayTransaction`); `operation.ts` integrates the platform state machine + timeline, **wallet mode** (build unsigned XDR → `AWAITING_SIGNATURE`) + `resumeBlendOperation`, and **retry reconciliation** (reads the last `blend_tx_submitted` hash from the trace, `getTransaction`-first before resubmit). `env.ts` `BLEND_SIGNING_MODE`. Execution timeline surfaced additively on `GET /api/v1/executions/:id` (`operation`). Mainnet server-signing is now blocked (must use wallet mode).
- **Outcome:** no receipt-hash / proof / anchor changes. 46 Blend+protocol tests pass (wallet flow, resume, reconciliation matrix, timeline ordering, state machine, adapter contract, no-double-submit). **Remaining:** wiring the wallet-mode `AWAITING_SIGNATURE` pause/resume into the durable Task lifecycle (the engine + resume API are ready; the coordinator currently runs server mode end-to-end and emits an awaiting-signature deliverable in wallet mode).

---

## Beta Phase 1 — Durable Wallet Execution ✅ DELIVERED
- **Durable pause/resume:** new `Task.status = "awaiting_signature"` (+ transitions) and an additive `ExecutionSignatureRequest` model (unsigned XDR, signing mode, source wallet, createdAt, expiresAt, status, txHash, resume `context`). `src/services/signature-request.ts` owns the store (create/get/owner-scoped/`claimResume` atomic/`markResolved`/expiry). Migration `20260626120000_add_execution_signature_request`.
- **Coordinator:** in wallet mode `stageExecute` surfaces an `AwaitingSignatureContext`; `executeCoordinator` calls `pauseForSignature` (persist + transition, **no receipt/proof/anchor**) instead of synthesizing. `resumeExecution(projectId, taskId, signedXdr)` is idempotent (atomic claim) → `resumeBlendOperation` → `markResolved` → reuses `stageSynthesize` (receipt → proof → anchor). Cross-project access returns not-found.
- **API/SDK/Console:** `POST /api/v1/executions/:id/resume` (Bearer, project-scoped, 404/409/422/idempotent-200); execution detail exposes `signature` (status, sourceWallet, unsignedXdr, expiry, resumeAvailable, resumedAt, txHash); `verix.executions.resume(id, signedXdr)`; Receipts tab shows an "Awaiting · resume available" / expiry / resolved cell.
- **Outcome:** no receipt-hash / proof / anchor changes. 18 new tests (signature-request service: persistence/cross-project/expiry/atomic-claim/markResolved; resume route: 401/422/404/409/idempotent/resumed/502). **Remaining:** browser wallet-signing transport (Freighter/Albedo round-trip) + a full per-execution detail page; the end-to-end coordinator pause→resume is wired but exercised via unit/contract tests, not a live DB run.

---

## Cross-cutting constraints (carried from prior sprints)
- Do **not** rename `Specialist` (public "Agent" maps to project-scoped `Specialist`; display name from `config.name`).
- Do **not** rename `specialist_*` or existing `blend_*` trace events.
- Do **not** change canonical receipt-hash fields/behavior (commit Blend via `traceRoot`/`outputHash`; store display data additively).
- Keep the stub (`runBlendYieldStub`) as the non-live fallback; never claim stubbed runs are real.
- Reuse the `anchor.ts` Soroban pattern, `signStellarXdr`, and existing trace/receipt/proof machinery.
