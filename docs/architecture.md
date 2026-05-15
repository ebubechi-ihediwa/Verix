# Verix Architecture

Verix is a verifiable autonomous work infrastructure demo. Users submit a
complex task, a coordinator routes work to specialist agents, execution events
are hash-chained, a receipt commits to the workflow, and proof verification can
gate Trustless Work escrow milestone release on Stellar/Soroban.

## System Boundary

```text
User
  |
  v
Next.js App Router
  |
  +-- Task API --------------------+
  |                                |
  v                                |
Execution Service                  |
  |                                |
  v                                |
Coordinator Pipeline               |
  |                                |
  +--> Agent Discovery / Versions  |
  +--> Spend-Cap Check             |
  +--> Specialist Execution        |
  +--> Payment Intent Recording    |
  +--> Trace Event Chain           |
  |                                |
  v                                |
Receipt Service                    |
  |                                |
  +--> Proof Service               |
  |      |
  |      +--> Local workflow verifier
  |      +--> Future Boundless/RISC Zero prover
  |
  +--> Escrow Service
         |
         +--> Trustless Work API
         +--> Stellar/Soroban settlement
```

## Runtime Components

- `src/app/**`: Next.js pages and API routes.
- `src/services/execution.ts`: task creation, state transitions, and task
  persistence.
- `src/services/coordinator.ts`: staged multi-agent execution pipeline.
- `src/services/discovery.ts`: specialist registry and immutable agent version
  snapshots.
- `src/services/trace.ts`: structured, hash-chained trace event persistence.
- `src/services/receipt.ts`: canonical execution receipt generation.
- `src/services/proof.ts`: proof lifecycle and verification.
- `src/services/escrow.ts`: Trustless Work escrow adapter and milestone release.
- `contracts/soroban/**`: minimal Soroban registry and receipt anchor contracts.

## Execution Lifecycle

```text
pending
  -> decomposing
  -> discovering
  -> processing
  -> completed
  -> receipt proof_ready
  -> proof proven
  -> proof verified
  -> escrow milestones released
```

Failed stages emit trace events instead of disappearing silently. Demo fallback
artifacts are explicitly labeled when enabled.

## Data Commitments

The receipt commits to:

- task input hash
- selected agent version hashes
- registry snapshot hash
- spend cap
- total cost
- trace root
- output summary hash
- payment summary
- receipt hash

These commitments are the handoff between agent orchestration, proof
verification, and escrow release.

## Trustless Work / Stellar Flow

Verix uses Trustless Work as the escrow layer. The app records proof-gated
milestones locally and calls Trustless Work APIs when live escrow mode is
enabled. Trustless Work returns Stellar/Soroban transaction material; live
signing and deployment-specific transaction submission remain isolated in the
escrow adapter.

## Demo Modes

- `APP_MODE=demo`: no database required; service layers may use in-memory or
  labeled fallback behavior where supported.
- `APP_MODE=local`: database-backed local development.
- `APP_MODE=production`: strict environment validation.

`DEMO_FALLBACKS_ENABLED=true` allows explicitly labeled backup artifacts for
controlled presentations. It must not be used to claim production-grade proof
generation.
