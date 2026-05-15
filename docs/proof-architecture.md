# Proof Architecture

Verix proves workflow integrity. It does not prove arbitrary LLM inference.

## What Is Proven

The current verifier checks:

1. The receipt hash matches the canonical receipt fields.
2. The trace root is committed in the receipt.
3. The selected agent version hashes are present and unique.
4. The total cost is within the user spend cap.
5. The payment summary adds up to the declared total cost.

These are the constraints needed for proof-backed escrow release:

```text
task input
  + selected agent versions
  + trace root
  + spend cap
  + payment summary
  + output hash
  -> canonical receipt hash
  -> proof journal
  -> verification
  -> escrow release eligibility
```

## What Is Not Proven

Verix does not claim to prove:

- LLM inference correctness
- subjective answer quality
- hidden model weights
- arbitrary external API behavior
- real-world truth of generated content

Agent output is committed by hash so the workflow can prove consistency, not
semantic correctness.

## Current Proof Backend

The current backend is the deterministic local TypeScript verifier in
`proofs/verifier.ts`. It is designed to mirror the eventual circuit/program
boundary for Boundless/RISC Zero integration.

The proof service stores:

- `Proof.status`
- `Proof.receiptHash`
- `Proof.journal`
- `Proof.artifactUri`
- `Proof.provenAt`
- `Proof.verifiedAt`

## Boundless Integration Target

The intended Boundless/RISC Zero handoff is:

```text
ExecutionReceipt
  -> ProofInput
  -> RISC Zero guest program
  -> Boundless proof request
  -> proof artifact URI
  -> journal verification
  -> receipt status verified
```

The guest program should recompute the same constraints currently checked by
`proofs/verifier.ts`.

## Demo Fallbacks

When `DEMO_FALLBACKS_ENABLED=true`, a failed proof attempt may create a
`demo-fallback` journal. This is explicitly labeled in the UI and stored with a
`demo-fallback://` artifact URI. It is a presentation safety mechanism, not a
production proof claim.

## Verification and Escrow Release

`verifyProof()` performs journal validation and marks the receipt verified. Once
the receipt is verified, proof-gated Trustless Work milestones can be released
by `releaseEscrowMilestones()`.
