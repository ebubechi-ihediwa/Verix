"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Zap } from "lucide-react";
import { setProvider, testProvider } from "@/lib/console-client";
import type { ProjectAIProvider } from "@/types/project";
import { useProject } from "@/components/console/ProjectContext";

const PROVIDERS: { id: ProjectAIProvider; label: string }[] = [
  { id: "anthropic", label: "Claude (Anthropic)" },
  { id: "openai", label: "Codex (OpenAI)" },
  { id: "groq", label: "Groq" },
  { id: "kimi", label: "Kimi (Moonshot)" },
];

export default function ProviderConfig() {
  const { project, refresh } = useProject();

  const [provider, setProviderState] = useState<ProjectAIProvider>(project.aiProvider);
  const [newKey, setNewKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const providerChanged = provider !== project.aiProvider;
  const canSave = newKey.trim().length > 0;

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const input = newKey.trim()
        ? { aiProvider: provider, aiApiKey: newKey.trim() }
        : {}; // tests the stored key
      const result = await testProvider(project.id, input);
      setTestResult(result);
      if (result.ok) toast.success("Provider connection successful");
      else toast.error(result.detail);
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Test failed";
      setTestResult({ ok: false, detail });
      toast.error(detail);
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!canSave) {
      toast.error("Enter the provider API key to save changes");
      return;
    }
    setSaving(true);
    try {
      await setProvider(project.id, { aiProvider: provider, aiApiKey: newKey.trim() });
      await refresh();
      setNewKey("");
      setTestResult(null);
      toast.success("Provider updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update provider");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="vc-panel p-6">
      <div className="vc-kicker mb-4">AI provider</div>

      <div className="mb-5 flex flex-col gap-2">
        <span className="vc-label">Provider</span>
        <select
          className="vc-select"
          value={provider}
          onChange={(e) => {
            setProviderState(e.target.value as ProjectAIProvider);
            setTestResult(null);
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-5 flex flex-col gap-2">
        <span className="vc-label">Provider API key</span>
        <input
          className="vc-input"
          type="password"
          value={newKey}
          onChange={(e) => {
            setNewKey(e.target.value);
            setTestResult(null);
          }}
          placeholder={project.aiApiKeyMasked ?? "sk-…"}
          autoComplete="off"
        />
        <p className="text-[11.5px] text-[var(--vc-faint)]">
          {project.aiApiKeyMasked
            ? `Current key: ${project.aiApiKeyMasked}. Leave blank to keep it (you can still test the stored key).`
            : "No key stored yet."}
          {providerChanged && " Switching provider requires a new key."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={runTest} className="vc-btn" disabled={testing}>
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Test connection
        </button>
        <button
          type="button"
          onClick={save}
          className="vc-btn vc-btn-primary"
          disabled={saving || !canSave}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save changes
        </button>
        {testResult && (
          <span
            className={`text-[12.5px] ${
              testResult.ok ? "text-[var(--vc-m-teal)]" : "text-[#ff9a9a]"
            }`}
          >
            {testResult.detail}
          </span>
        )}
      </div>
    </section>
  );
}
