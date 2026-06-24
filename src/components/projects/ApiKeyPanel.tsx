"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/console-client";
import type { ApiKeyView } from "@/types/project";
import ApiKeyRevealModal from "@/components/projects/ApiKeyRevealModal";

export default function ApiKeyPanel({ projectId }: { projectId: string }) {
  const [keys, setKeys] = useState<ApiKeyView[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function load() {
    try {
      setKeys(await listApiKeys(projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load keys");
      setKeys([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await createApiKey(projectId);
      setRevealKey(res.key);
      await load();
      toast.success("API key generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate key");
    } finally {
      setGenerating(false);
    }
  }

  async function revoke(keyId: string) {
    setRevoking(keyId);
    try {
      await revokeApiKey(projectId, keyId);
      await load();
      toast.success("API key revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setRevoking(null);
    }
  }

  const activeKeys = keys?.filter((k) => !k.revokedAt) ?? [];

  return (
    <section className="vc-panel p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="vc-kicker">API keys</div>
        <button type="button" onClick={generate} className="vc-btn vc-btn-primary" disabled={generating}>
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Generate key
        </button>
      </div>

      <p className="mb-5 text-[12.5px] leading-relaxed text-[var(--vc-muted)]">
        These keys authenticate the Verix SDK for this project. Raw keys are shown only
        once at creation — revoke and regenerate if a key is lost or exposed.
      </p>

      {keys === null ? (
        <div className="h-16 animate-pulse-subtle rounded-lg border border-[var(--vc-line-2)] opacity-50" />
      ) : activeKeys.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--vc-line)] py-10 text-center">
          <KeyRound size={18} className="text-[var(--vc-faint)]" />
          <p className="text-[13px] text-[var(--vc-muted)]">No active keys. Generate one to start.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {activeKeys.map((k) => (
            <li
              key={k.id}
              className="vc-panel-2 flex items-center justify-between gap-4 p-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <KeyRound size={15} className="shrink-0 text-[var(--vc-accent-2)]" />
                <div className="min-w-0">
                  <code className="vc-mono text-[13px] text-[var(--vc-text)]">
                    {k.keyPrefix}…{k.last4}
                  </code>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--vc-faint)]">
                    <span className="vc-chip">{k.environment}</span>
                    {k.label && <span>{k.label}</span>}
                    <span>· created {new Date(k.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => revoke(k.id)}
                className="vc-btn vc-btn-danger"
                disabled={revoking === k.id}
              >
                {revoking === k.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {revealKey && (
        <ApiKeyRevealModal
          apiKey={revealKey}
          title="New API key"
          onClose={() => setRevealKey(null)}
        />
      )}
    </section>
  );
}
