# Verix Deployment Guide

Verix — **Verifiable Autonomous Work Infrastructure** on Stellar/Soroban. Multi-agent
AI task orchestration with hash-chained execution traces, deterministic proofs, and
on-chain receipt anchoring. This guide covers running Verix locally and in production.

---

## Architecture

```
                         ┌────────────────────────────────────────┐
                         │  Developer Console (Next.js dashboard)  │  cookie auth
                         │  /login /signup /projects/*             │
                         └───────────────┬────────────────────────┘
                                         │  same-origin fetch
┌────────────────┐  Bearer vx_*  ┌───────▼─────────────────────────┐
│  @verix/sdk    │──────────────►│  API (Next.js route handlers)   │
│  (Node)        │               │  /api/v1/*  + /api/auth/*       │
└────────────────┘               └───────┬─────────────────────────┘
                                         │
            ┌────────────────────────────┼───────────────────────────────┐
            ▼                            ▼                               ▼
   ┌────────────────┐         ┌────────────────────┐          ┌────────────────────┐
   │  PostgreSQL    │         │  Coordinator +     │          │  Stellar / Soroban │
   │  (Prisma)      │◄───────►│  Job queue (DB)    │─────────►│  Horizon + RPC     │
   │  tasks,        │         │  trace→receipt→    │          │  Blend pools,      │
   │  receipts,     │         │  proof→anchor      │          │  receipt_anchor    │
   │  proofs, sigs  │         └────────────────────┘          │  contract          │
   └────────────────┘                                         └────────────────────┘
```

| Component | What it is | Tech |
|---|---|---|
| **Dashboard** | Developer console (auth, projects, API keys, agents, receipts, verifications) | Next.js App Router, cookie sessions |
| **API** | `/api/v1/*` SDK gateway (Bearer) + `/api/auth/*` + `/api/projects/*` (cookie) | Next.js route handlers |
| **Database** | Source of truth — projects, keys, tasks, trace events, receipts, proofs, signature requests | PostgreSQL + Prisma |
| **Soroban contracts** | `receipt_anchor` (anchors verified receipt hashes), `agent_registry` | Rust / Soroban SDK |
| **SDK** | `@verix/sdk` — typed Node client wrapping `/api/v1/*` | TypeScript, zero deps |
| **Blend integration** | Pool discovery + supply/withdraw via Soroban Pool contracts | `src/services/agents/blend/`, `src/services/protocols/` |

> **No Redis / no external queue.** The durable job queue is the `Job` table
> (atomic `queued → running` claim). Background work runs in-process (fire-and-forget
> from route handlers), surviving restarts via the DB job rows.

---

## Required Services

| Service | Required? | Notes |
|---|---|---|
| **Node.js ≥ 18** | Yes | Native `fetch`; Next.js 16. Node 20 LTS recommended. |
| **PostgreSQL ≥ 14** | Yes (local/production) | Prisma datasource. Not required in `demo` mode. |
| **Redis** | **No** | Not used — jobs are DB-backed. |
| **Soroban RPC** | For on-chain (anchor/Blend) | `https://soroban-testnet.stellar.org` (testnet). |
| **Stellar Horizon** | For balances/accounts | `https://horizon-testnet.stellar.org` (testnet). |
| **AI provider key** | Optional | Claude/OpenAI/Groq. Falls back to deterministic mock if absent. |

---

## Environment Variables

Set via `.env.local` (local) or your platform's secret manager (production). See
`.env.local.example` for a starter. `APP_MODE` selects how strict validation is:
`demo` (no DB/keys), `local` (DB required), `production` (DB + encryption + wallet keys required).

### Authentication
| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_MODE` | No | auto | `demo` \| `local` \| `production`. Auto: `production` if `NODE_ENV=production`, else `local` if `DATABASE_URL` set, else `demo`. |
| `ENCRYPTION_KEY` | **production** | dev sentinel | 32-byte hex — AES-256-GCM for BYOK provider keys. Must be a strong secret in production. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `ADMIN_SECRET` | No | — | Grants admin override via `X-Admin-Token` header (demos/cleanup). |

> Sessions are httpOnly cookies (`asn_session`); the `Secure` flag is set when
> `NODE_ENV=production`. No additional session secret env var is required (only `sha256(token)` is stored).

### Database
| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | local + production | — | PostgreSQL connection string. Not needed in `demo` mode. |

### AI Providers
| Variable | Required | Default | Description |
|---|---|---|---|
| `CLAUDE_API_KEY` | No | — | Anthropic key (coordinator routing + LLM specialists). |
| `OPENAI_API_KEY` | No | — | OpenAI key. |
| `GROQ_API_KEY` | No | — | Groq (OpenAI-compatible). |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq model id. |

> All AI keys are optional; the service layer falls back to a deterministic mock if none are set.

### Stellar
| Variable | Required | Default | Description |
|---|---|---|---|
| `STELLAR_NETWORK` | No | `testnet` | `testnet` \| `mainnet`. |
| `STELLAR_HORIZON_URL` | No | testnet Horizon | Horizon REST API base. |
| `STELLAR_NETWORK_PASSPHRASE` | No | testnet passphrase | Network passphrase used for signing. |
| `STELLAR_EXPLORER_URL` | No | stellar.expert testnet | Explorer base for tx links. |
| `STELLAR_USDC_CODE` | No | `USDC` | Asset code for balance display. |
| `STELLAR_USDC_ISSUER` | No | — | USDC issuer `G...` (enables USDC balance reads). |
| `COORDINATOR_STELLAR_PUBLIC_KEY` | **production** | — | Coordinator wallet public key `G...` (server-signing funds source). |
| `COORDINATOR_STELLAR_PRIVATE_KEY` | server signing | — | Coordinator secret `S...` — signs anchor + server-mode Blend txs. **Never commit.** |

### Soroban
| Variable | Required | Default | Description |
|---|---|---|---|
| `SOROBAN_RPC_URL` | on-chain | testnet RPC | Soroban JSON-RPC endpoint. |
| `SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID` | anchoring | — | Deployed `receipt_anchor` contract `C...`. Without it, anchoring degrades to `pending`. |
| `SOROBAN_AGENT_REGISTRY_CONTRACT_ID` | optional | — | Deployed `agent_registry` contract `C...`. |

### Blend
| Variable | Required | Default | Description |
|---|---|---|---|
| `BLEND_MODE` | No | `STELLAR_NETWORK` | `testnet` \| `mainnet` — operational network. |
| `BLEND_NETWORK` | No | `BLEND_MODE`/`STELLAR_NETWORK` | Network whose vetted pool allowlist is used. |
| `BLEND_API_URL` | No | per-network | Override for the Blend rates API base. |
| `BLEND_SIGNING_MODE` | No | `server` | `server` (coordinator signs; testnet) \| `wallet` (unsigned XDR; user signs; **required for mainnet**). |
| `BLEND_POOLS` | mainnet / real funds | built-in testnet | JSON allowlist override: `{"testnet":[{"asset","poolId","name","assetContractId"}],"mainnet":[...]}`. Mainnet ships **no** defaults — must be configured (incl. `assetContractId` SAC). |

### SDK
| Variable | Required | Default | Description |
|---|---|---|---|
| `VERIX_API_KEY` | SDK consumers | — | Project API key (`vx_test_...` / `vx_live_...`) used by `@verix/sdk`. **Set in the consuming app, not the server.** |

```ts
import { Verix } from "@verix/sdk";
const verix = new Verix({ apiKey: process.env.VERIX_API_KEY!, baseUrl: "https://api.your-verix.dev" });
```

### Security
| Variable | Required | Default | Description |
|---|---|---|---|
| `ENCRYPTION_KEY` | production | — | (see Authentication) AES-256-GCM key for BYOK provider secrets. |
| `ADMIN_SECRET` | No | — | (see Authentication) admin override token. |

### Escrow / Proof / Coordinator (operational tuning)
| Variable | Required | Default | Description |
|---|---|---|---|
| `ESCROW_MODE` | No | `disabled` | `disabled` \| `demo` \| `live` (Trustless Work). |
| `TRUSTLESS_WORK_API_URL` / `TRUSTLESS_WORK_API_KEY` | `ESCROW_MODE=live` | — | Trustless Work REST credentials. |
| `TRUSTLESS_WORK_SIGNER_ADDRESS` / `TRUSTLESS_WORK_KEY_ID` | `ESCROW_MODE=live` | — | Release signer / key id. |
| `TRUSTLESS_WORK_ESCROW_TYPE` | No | `multi-release` | `single-release` \| `multi-release`. |
| `TRUSTLESS_WORK_SIGNING_MODE` | No | `server` | `server` \| `wallet`. |
| `PROOF_MODE` | No | `local` | `disabled` \| `local` (in-process deterministic verifier). |
| `COORDINATOR_CONCURRENCY_LIMIT` | No | `1` | Max concurrent specialist AI calls per run. |
| `COORDINATOR_DELEGATION_MAX_DEPTH` | No | `1` | Max agent→agent delegation depth (`0` disables). |

---

## Local Development

```bash
# 1. Install
npm install

# 2. Configure
cp .env.local.example .env.local      # then edit (set DATABASE_URL, keys, etc.)

# 3. Migrate (creates/updates the schema)
npx prisma migrate dev                 # or: npx prisma db push  (quick, no migration history)

# 4. Seed demo data (optional)
npm run demo:seed                      # npm run demo:reset to clear

# 5. Run
npm run dev                            # http://localhost:3000

# 6. Test / typecheck / lint
npm test                               # vitest run (all tests)
npx tsc --noEmit                       # type-check
npm run lint                           # eslint
```

**Quick demo mode (no DB):** `APP_MODE=demo npm run dev` — blockchain + DB ops are mocked.

---

## Production Deployment

`npm run build` runs `prisma generate && next build`.

### API + Dashboard
The API and Dashboard are the **same Next.js app** (route handlers + pages). Deploy once:

```bash
npm ci
npx prisma migrate deploy              # apply migrations to the production DB
npm run build
npm run start                          # next start (or a Node host / container / serverless)
```

- Set all production env vars (Authentication, Database, Stellar, Soroban as needed).
- Behind a reverse proxy/CDN, ensure `Authorization` headers and cookies pass through.
- `APP_MODE=production` enforces `DATABASE_URL`, a strong `ENCRYPTION_KEY`, and `COORDINATOR_STELLAR_PUBLIC_KEY`.

### Background workers
There is **no separate worker process**. Background jobs (coordinator runs, proof
generation, anchoring) execute in-process via fire-and-forget from route handlers and
survive restarts through the durable `Job` table (atomic claim prevents double-runs).
If you run multiple API instances, they safely share the DB job queue. (A dedicated
worker/cron is a future enhancement; see Monitoring.)

### Contracts
Soroban contracts are built + deployed separately (see **Contract deployment**). Deploy
once per network and set `SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID`.

---

## Database migrations

```bash
# Local (creates migration files + applies):
npx prisma migrate dev --name <change>

# Production (apply committed migrations, no schema drift):
npx prisma migrate deploy

# Regenerate the client after schema edits (also run by `npm run build`):
npx prisma generate
```

Migrations live in `prisma/migrations/`. All Verix migrations are **additive**
(new columns/tables, nullable) and backwards compatible. Notable recent ones:
`add_receipt_blend_operation`, `add_execution_signature_request`.

---

## Contract deployment

See `contracts/DEPLOY.md`. Summary (testnet):

```bash
cd contracts/soroban
soroban contract build                                   # → target/wasm32-unknown-unknown/release/*.wasm
soroban contract deploy --wasm <receipt_anchor.wasm> \
  --source <admin-key> --network testnet                 # → prints CONTRACT_ID (C...)
soroban contract invoke --id <CONTRACT_ID> --source <admin-key> \
  --network testnet -- init --admin <admin G-address>
```

Then set `SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID=<CONTRACT_ID>`. The `receipt_anchor`
contract exposes `anchor_receipt`, `get_receipt`, `is_anchored`. **Do not change
contract interfaces** without re-deploying and updating the env var.

---

## Wallet mode

Non-custodial signing (required for mainnet — no server custody of user funds).

1. Set `BLEND_SIGNING_MODE=wallet`.
2. A Blend execution runs discovery + validation, builds an **unsigned XDR**, and the
   task **pauses** at `awaiting_signature`. An `ExecutionSignatureRequest` row persists
   the unsigned XDR, source wallet, and a 15-minute `expiresAt`.
3. The client fetches the unsigned XDR from the execution detail
   (`GET /api/v1/executions/:id` → `signature.unsignedXdr`), signs it with the user's
   wallet (Freighter/Albedo), and submits:
   ```ts
   await verix.executions.resume(executionId, signedXdr);
   ```
4. `POST /api/v1/executions/:id/resume` submits → confirms → generates receipt → proof → anchor.
   **Idempotent:** a duplicate resume returns the existing state without resubmitting
   (atomic `awaiting_signature → resuming` claim). Expired requests are rejected (409).

> The in-browser signer UI (Freighter round-trip) is the remaining piece for a turnkey
> wallet flow; the API + SDK + persistence are complete.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Missing required environment variable` box at boot | `production` mode missing a required var | Set the named var or run `APP_MODE=demo`. |
| `ENCRYPTION_KEY must be a strong secret in production` | dev sentinel in production | Set a 32-byte hex `ENCRYPTION_KEY`. |
| 401 from `/api/v1/*` | bad/missing `Authorization: Bearer vx_*` | Generate a key in the console; check it isn't revoked. |
| Console 401 / redirect loop | cookie not sent | Ensure same-origin; proxy must forward cookies. Console uses `lib/console-client.ts` (cookie), **not** `x-session-id`. |
| `asset_contract_not_configured` | Blend SAC id missing | Configure `BLEND_POOLS` with `assetContractId`. |
| Anchor stuck `pending` | no `SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID` / `COORDINATOR_STELLAR_PRIVATE_KEY` | Set both; anchoring degrades to `pending` without them (non-fatal). |
| `Server-side signing on mainnet is not allowed` | `BLEND_NETWORK=mainnet` + `server` mode | Use `BLEND_SIGNING_MODE=wallet`. |
| Stale `awaiting_signature` tasks | user never signed | They expire after 15 min; resume returns 409 expired. |

---

## Health checks

- **Liveness:** `GET /api/health` → `200`.
- **DB:** any authenticated `/api/projects` call (cookie) confirms DB connectivity.
- **Soroban/Stellar readiness:** `GET /api/wallet/balance` (coordinator wallet) confirms Horizon reachability.
- **Protocol diagnostics:** `diagnoseProtocol("blend")` (in `src/services/protocols/diagnostics.ts`)
  returns readiness checks (RPC, pool allowlist, asset SAC, signer, mainnet-signing guard).

---

## Backup strategy

- **PostgreSQL is the source of truth** — back it up (managed snapshots or `pg_dump`)
  on a schedule. It holds projects, keys (hashed), tasks, hash-chained trace events,
  receipts, proofs/journals, and signature requests.
- **Secrets** (`ENCRYPTION_KEY`, `COORDINATOR_STELLAR_PRIVATE_KEY`) live only in the
  secret manager — back them up there; **losing `ENCRYPTION_KEY` makes stored BYOK
  provider keys unrecoverable**.
- **On-chain anchors** are independently durable on Soroban (re-derivable from `anchorTxHash`).
- Migrations are committed in git — schema is reproducible.

---

## Monitoring

- **Logs:** structured `console` logs per stage (`[Coordinator]`, `[Receipt]`, `[blend]`, `[anchor]`).
- **Job queue:** monitor the `Job` table — alert on rows stuck in `running` or repeated `failed` (retries exhaust at `maxAttempts`).
- **Anchoring:** alert on receipts with `anchorStatus="pending"` older than N minutes.
- **Signature requests:** count `awaiting_signature` rows; sweep/expire stale ones (cron — future).
- **Proof:** alert on `Proof.status="failed"`.
- Add an APM/error tracker (e.g. Sentry) around route handlers for production.

---

## Production checklist

- [ ] `APP_MODE=production`, `NODE_ENV=production`.
- [ ] Strong `ENCRYPTION_KEY` (32-byte hex) set in the secret manager.
- [ ] `DATABASE_URL` points at a managed Postgres with backups + TLS.
- [ ] `npx prisma migrate deploy` run against the production DB.
- [ ] Coordinator wallet funded; `COORDINATOR_STELLAR_PUBLIC_KEY` set (+ `_PRIVATE_KEY` only if using server signing on testnet).
- [ ] `SOROBAN_RECEIPT_ANCHOR_CONTRACT_ID` deployed + set (anchoring on).
- [ ] **Mainnet:** `BLEND_SIGNING_MODE=wallet` + vetted `BLEND_POOLS` (pool ids + `assetContractId`).
- [ ] AI provider keys set (or accept mock fallback).
- [ ] `npm run build` succeeds; `npm test` green (3 known pre-existing demo/escrow test mismatches excepted); `tsc --noEmit` clean.
- [ ] HTTPS + reverse proxy forwarding `Authorization` + cookies.
- [ ] Health checks wired to your uptime monitor.
- [ ] Secrets never logged; `.env*` excluded from git (already in `.gitignore`).

---

## End-to-end verification checklist

Verifies the full non-custodial flow. Use a project API key (`vx_test_...`) and a
funded testnet wallet.

```
Create Project          POST /api/projects                         (or console wizard)
      ↓                  → project + one-time API key
Create Agent            POST /api/v1/agents                         { name, agentType:"blend_yield",
      ↓                                                               walletAddress:"G...", config:{ asset:"USDC",
      ↓                                                               operation:"supply", amount:250 } }
Generate API Key        (returned at project creation, or POST /api/projects/:id/keys)
      ↓
Execute Blend Supply    POST /api/v1/executions { agentId, mandate:"Supply 250 USDC" }
      ↓                  → task runs; wallet mode → status "awaiting_signature"
Wallet Signature        GET /api/v1/executions/:id → signature.unsignedXdr
      ↓                  → sign with Freighter/Albedo → signedXdr
Resume Execution        POST /api/v1/executions/:id/resume { signedXdr }   (idempotent)
      ↓                  → submit → confirm
Receipt                 GET /api/v1/receipts/:hash  → receipt + operation { protocol:"blend", txHash, ... }
      ↓
Proof                   GET /api/v1/receipts/:hash  → proof.status "verified"
      ↓                  (or POST /api/v1/receipts/:hash/verify)
Anchor                  GET /api/v1/receipts/:hash  → anchor.status "anchored", anchor.explorerUrl
```

**Step-by-step asserts**

1. **Create Project** → response has `project.id` + one-time `apiKey.key` (shown once).
2. **Create Agent** → `agent.name` is the public `config.name` (never `vx_agent_*`); a v1 `AgentVersion` is created.
3. **Generate API Key** → `vx_test_…`; use as `Authorization: Bearer`.
4. **Execute Blend Supply** → `201` with `execution.id`; the agent is pinned, discovery records `blend_rate_check` + `blend_pool_selected`.
5. **Wallet Signature** (wallet mode) → execution `status="awaiting_signature"`, `signature.resumeAvailable=true`, `signature.unsignedXdr` present, `signature.expiresAt` in ~15 min.
6. **Resume Execution** → `200 { status:"resumed", txHash }`; a duplicate call → `200 { status:"already_resumed" }` (no double-submit).
7. **Receipt** → `operation` present with the confirmed `txHash`; canonical `receiptHash` unchanged by the Blend metadata.
8. **Proof** → 5-constraint journal; `verified=true` (agent membership passes via the AgentVersion).
9. **Anchor** → `anchor.status="anchored"` with a Soroban `txHash` + `explorerUrl` (or `pending` if anchoring env not configured — non-fatal).

> **Server mode** (testnet, `BLEND_SIGNING_MODE=server`) collapses steps 5–6: the
> coordinator signs and confirms inline; the execution goes straight to `completed`
> with the receipt/proof/anchor.
