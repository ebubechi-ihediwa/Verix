# @verix/sdk

Typed Node SDK for **Verix** — the verifiable AI execution layer on Stellar/Soroban.
Wraps the `/api/v1` gateway: deploy agents, submit mandates, and fetch
cryptographic receipts + proofs with their on-chain Soroban anchor.

- Node 18+ · native `fetch` · ESM + CJS
- **Zero runtime dependencies**
- Fully typed (contracts shared with the Verix API)

## Install

```bash
npm install @verix/sdk
```

## Quickstart

```ts
import { Verix } from "@verix/sdk";

const verix = new Verix({
  apiKey: process.env.VERIX_API_KEY!, // vx_test_... or vx_live_...
});

const agent = await verix.agents.create({
  name: "Treasury Yield Bot",
  agentType: "blend_yield",
  walletAddress: "G...", // Stellar payout address
});

const execution = await verix.executions.create({
  agentId: agent.id,
  mandate: "Supply 250 USDC",
});

// The receiptHash becomes available once the execution completes.
const { receiptHash } = await verix.executions.get(execution.id);
const receipt = await verix.receipts.get(receiptHash!);

console.log(receipt.anchor.explorerUrl);
```

## Configuration

```ts
new Verix({
  apiKey: "vx_live_...",            // required
  baseUrl: "https://api.verix.xyz", // default
  timeoutMs: 30_000,                // per-request timeout
  fetch: customFetch,               // optional fetch override
});
```

## API

### Agents
```ts
await verix.agents.create({ name, agentType?, walletAddress, price?, config? });
await verix.agents.list();
await verix.agents.get(id);
await verix.agents.update(id, { price?, config?, ... });
await verix.agents.delete(id);
```

### Executions
```ts
await verix.executions.create({ agentId, mandate });   // or { agentId, description }
await verix.executions.list();
await verix.executions.get(id);                         // trace + receipt detail
```

### Receipts
```ts
const receipt = await verix.receipts.get(hash);   // { receipt, proof, anchor }
await verix.receipts.verify(hash);                // run the 5-constraint verifier
await verix.receipts.waitForAnchor(hash);         // resolve once anchored on Soroban
```

**`waitForAnchor`** returns immediately if already anchored, otherwise polls every
**2s** and throws a `VerixError` (`code: "anchor_timeout"`) after **60s**. Override
with `waitForAnchor(hash, { intervalMs, timeoutMs })`.

## Errors

Every failure is a `VerixError` (or subclass), carrying `status`, `code`, and the
parsed `body`:

| HTTP | Error |
|------|-------|
| 401  | `AuthenticationError` |
| 404  | `NotFoundError` |
| 400 / 422 | `ValidationError` |
| 429  | `RateLimitError` |
| 5xx / other | `ApiError` |

```ts
import { Verix, NotFoundError } from "@verix/sdk";

try {
  await verix.receipts.get(hash);
} catch (err) {
  if (err instanceof NotFoundError) {
    // 404 — unknown receipt or not owned by this key's project
  }
}
```

## Examples

See [`examples/`](./examples):

1. [`create-agent.ts`](./examples/create-agent.ts) — Create an agent
2. [`run-execution.ts`](./examples/run-execution.ts) — Run an execution
3. [`verify-receipt.ts`](./examples/verify-receipt.ts) — Verify a receipt + wait for anchor
4. [`basic.ts`](./examples/basic.ts) — End-to-end quickstart

## Notes

- Node-only for now (no browser/React/SSE/webhooks).
- `agentType: "blend_yield"` currently runs a **labelled stub** — real Blend
  protocol execution is not yet implemented.
