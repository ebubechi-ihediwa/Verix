"use client";

import { useState } from "react";
import { Anchor, Check } from "lucide-react";

/**
 * Soroban anchor state. When anchored with a txHash, clicking copies the hash.
 */
export default function AnchorBadge({
  status,
  txHash,
}: {
  status: string | null;
  txHash?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const anchored = status === "anchored";

  async function copy() {
    if (!txHash) return;
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (!anchored) {
    const label = status === "failed" ? "Failed" : status === null ? "—" : "Pending";
    const color = status === "failed" ? "#ff9a9a" : "var(--vc-faint)";
    return (
      <span className="vc-chip" style={{ color }}>
        <span className="vc-dot" />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={txHash ? `Copy tx: ${txHash}` : "Anchored"}
      className="vc-chip"
      style={{ color: "var(--vc-m-teal)", cursor: txHash ? "pointer" : "default" }}
    >
      {copied ? <Check size={11} /> : <Anchor size={11} />}
      {copied ? "Copied" : "Anchored"}
    </button>
  );
}
