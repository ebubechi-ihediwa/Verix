import { env } from "@/lib/env";
import { isStellarPublicKey } from "@/lib/stellar-config";
import type { SigningMode } from "@/services/protocols/types";

/**
 * Blend transaction signing (Sprint 7D).
 *
 *   server — coordinator key signs server-side (testnet). Funds source + signer
 *            is COORDINATOR_STELLAR_PRIVATE_KEY.
 *   wallet — build unsigned XDR; the user signs in-browser and submits it back
 *            (no server custody). Required for mainnet.
 */

export interface BlendSigner {
  publicKey: string;
  secret: string;
}

/** The configured signing mode. */
export function resolveSigningMode(): SigningMode {
  return env.BLEND_SIGNING_MODE;
}

/**
 * Resolve the server signer (coordinator wallet). Server mode only — mainnet
 * server signing is rejected (mainnet must use wallet mode to avoid custody).
 */
export function resolveServerSigner(): BlendSigner {
  if (env.BLEND_NETWORK === "mainnet") {
    throw new Error(
      "Server-side signing on mainnet is not allowed — use BLEND_SIGNING_MODE=wallet (no server custody)."
    );
  }
  const secret = env.COORDINATOR_STELLAR_PRIVATE_KEY;
  if (!secret) {
    throw new Error(
      "COORDINATOR_STELLAR_PRIVATE_KEY is required for server-side Blend signing (testnet)."
    );
  }
  const publicKey = env.COORDINATOR_STELLAR_PUBLIC_KEY;
  if (!isStellarPublicKey(publicKey)) {
    throw new Error("COORDINATOR_STELLAR_PUBLIC_KEY must be a valid Stellar public key (G...).");
  }
  return { publicKey, secret };
}
