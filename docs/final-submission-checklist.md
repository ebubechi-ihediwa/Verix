# Final Submission Checklist

## Required Links

- Deployed app URL:
- GitHub repository:
- Demo video:
- Trustless Work escrow reference:
- Stellar/Soroban contract IDs:
- Example receipt URL:
- Example trace URL:

## Environment

- `DATABASE_URL` configured.
- `ENCRYPTION_KEY` configured for production.
- `STELLAR_NETWORK=testnet`.
- `STELLAR_HORIZON_URL` configured.
- `SOROBAN_RPC_URL` configured.
- `TRUSTLESS_WORK_API_URL` configured for live escrow mode.
- `TRUSTLESS_WORK_API_KEY` configured for live escrow mode.
- `TRUSTLESS_WORK_SIGNER_ADDRESS` configured.
- `PROOF_MODE=local` or live Boundless mode when available.
- `DEMO_FALLBACKS_ENABLED=false` for normal final run.

## Demo Data

- `npm run demo:seed` completed.
- `/demo` loads.
- `Start Golden Path` creates a task.
- Execution graph updates.
- Receipt page loads.
- Proof status appears.
- Escrow timeline does not block page rendering.

## Technical Claims

- State clearly that LLM inference is not proven.
- State that workflow integrity is proven.
- State that payment correctness and spend cap compliance are proven.
- State when a fallback artifact is used.
- Do not claim production decentralization.

## Validation

- `npx tsc --noEmit --incremental false`
- `npm test -- --run src/lib/__tests__/receipt-canonical.test.ts src/lib/__tests__/hash.test.ts src/services/__tests__/trace-chain.test.ts`
- `npm run build`
- `/api/health` returns `healthy` or understood `degraded` fields.
- `/api/debug/jobs` is accessible to the demo operator.

## Presentation Assets

- Golden prompt ready.
- Demo script rehearsed.
- Backup screenshots or recording available.
- API keys and secrets not shown on screen.
- Browser zoom set for projector readability.
- Seed/reset commands tested.
