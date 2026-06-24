/**
 * Example 3 + 4 — Verify a receipt and wait for its Soroban anchor.
 *
 * Run: VERIX_API_KEY=vx_test_... RECEIPT_HASH=... npx tsx examples/verify-receipt.ts
 */
import { Verix, VerixError } from "@verix/sdk";

async function main() {
  const verix = new Verix({ apiKey: process.env.VERIX_API_KEY! });
  const hash = process.env.RECEIPT_HASH!;

  // Fetch the receipt with its proof + anchor state.
  const receipt = await verix.receipts.get(hash);
  console.log("Receipt status:", receipt.receipt.status);
  console.log("Proof status:", receipt.proof?.status ?? "(none)");

  // Run the deterministic 5-constraint verifier (idempotent).
  const verification = await verix.receipts.verify(hash);
  console.log("Verified:", verification.verified);

  // Wait until anchored on Soroban (returns immediately if already anchored).
  try {
    const anchor = await verix.receipts.waitForAnchor(hash);
    console.log("Anchored! tx:", anchor.txHash);
    console.log("Explorer:", anchor.explorerUrl);
  } catch (err) {
    if (err instanceof VerixError && err.code === "anchor_timeout") {
      console.log("Still pending after timeout — try again later.");
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
