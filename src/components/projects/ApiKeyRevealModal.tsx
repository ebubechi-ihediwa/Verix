"use client";

import { AlertTriangle, X } from "lucide-react";
import CopyButton from "@/components/console/CopyButton";

/**
 * One-time reveal of a freshly generated Verix API key. The raw key is never
 * retrievable again after this modal closes.
 */
export default function ApiKeyRevealModal({
  apiKey,
  title = "Your Verix API key",
  onClose,
}: {
  apiKey: string;
  title?: string;
  onClose: () => void;
}) {
  const snippet = `import { VerixClient } from '@verix/sdk'

const verix = new VerixClient({
  apiKey: '${apiKey}',
})`;

  return (
    <div className="vc-overlay" role="dialog" aria-modal>
      <div className="vc-panel relative w-full max-w-[560px] p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-[var(--vc-faint)] hover:text-[var(--vc-text)]"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="vc-kicker mb-4">Shown once</div>
        <h2 className="mb-2 text-[22px]">{title}</h2>
        <p className="mb-5 text-[13px] leading-relaxed text-[var(--vc-muted)]">
          Copy this key now and store it securely. For your protection it is{" "}
          <span className="text-[var(--vc-text)]">never displayed in full again</span>.
        </p>

        <div className="vc-panel-2 mb-4 flex items-center gap-3 p-3">
          <code className="vc-mono flex-1 truncate text-[13px] text-[var(--vc-accent-ink)]">
            {apiKey}
          </code>
          <CopyButton value={apiKey} label="Copy key" />
        </div>

        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-[rgba(166,107,0,0.35)] bg-[rgba(166,107,0,0.08)] px-3.5 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#e8b75a]" />
          <p className="text-[12px] leading-relaxed text-[#e8c98a]">
            This key grants full SDK access to this project. Treat it like a password —
            keep it out of client-side code and version control.
          </p>
        </div>

        <div className="mb-5">
          <div className="vc-label mb-2">Quick start</div>
          <pre className="vc-panel-2 overflow-x-auto p-4 text-[12px] leading-relaxed text-[var(--vc-muted)]">
            <code className="vc-mono">{snippet}</code>
          </pre>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="vc-btn vc-btn-primary">
            I&apos;ve saved my key
          </button>
        </div>
      </div>
    </div>
  );
}
