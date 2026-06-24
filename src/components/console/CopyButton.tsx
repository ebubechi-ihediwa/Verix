"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <button type="button" onClick={copy} className={`vc-btn ${className}`}>
      {copied ? <Check size={14} className="text-[var(--vc-m-teal)]" /> : <Copy size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}
