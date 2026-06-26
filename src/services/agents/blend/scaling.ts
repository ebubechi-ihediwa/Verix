/**
 * Amount scaling for Blend / Stellar Soroban tokens.
 *
 * Stellar assets (incl. USDC) use 7 decimals. On-chain amounts are i128 integers
 * in the smallest unit; in JS we represent them as `bigint`. Scaling goes through
 * a fixed-decimal string to avoid binary-float drift (e.g. 0.1 * 1e7).
 */

export const BLEND_DECIMALS = 7;
const SCALE = BigInt(10) ** BigInt(BLEND_DECIMALS);

/** Convert a human USDC amount → on-chain i128 (bigint). Rounds to 7 decimals. */
export function toBlendAmount(amount: number): bigint {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new Error(`toBlendAmount: amount must be a finite number (got ${amount})`);
  }
  if (amount < 0) {
    throw new Error(`toBlendAmount: amount must be non-negative (got ${amount})`);
  }
  // toFixed(7) yields a plain decimal string (no exponent) rounded to 7 places.
  const fixed = amount.toFixed(BLEND_DECIMALS); // e.g. "250.0000000"
  const [intPart, fracPart] = fixed.split(".");
  return BigInt(intPart) * SCALE + BigInt(fracPart);
}

/** Convert an on-chain i128 (bigint) back to a human number (display only). */
export function fromBlendAmount(raw: bigint): number {
  const whole = raw / SCALE;
  const frac = raw % SCALE;
  return Number(whole) + Number(frac) / Number(SCALE);
}
