"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Zap } from "lucide-react";
import { createProject, testProviderStandalone } from "@/lib/console-client";
import type { ProjectAIProvider, ProjectNetwork } from "@/types/project";
import ApiKeyRevealModal from "@/components/projects/ApiKeyRevealModal";

const PROVIDERS: { id: ProjectAIProvider; label: string; models: string }[] = [
  { id: "anthropic", label: "Claude (Anthropic)", models: "claude-sonnet-4-6, claude-haiku-4-5" },
  { id: "openai", label: "Codex (OpenAI)", models: "gpt-4o, gpt-4o-mini" },
  { id: "groq", label: "Groq", models: "llama-3.3-70b-versatile" },
  { id: "kimi", label: "Kimi (Moonshot)", models: "moonshot-v1-128k" },
];

const STEPS = ["Project info", "AI provider", "Review"] as const;

export default function CreateProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [network, setNetwork] = useState<ProjectNetwork>("testnet");
  const [aiProvider, setAiProvider] = useState<ProjectAIProvider>("anthropic");
  const [aiApiKey, setAiApiKey] = useState("");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function next() {
    if (step === 0 && !name.trim()) {
      toast.error("Project name is required");
      return;
    }
    if (step === 1 && !aiApiKey.trim()) {
      toast.error("Enter your provider API key");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function runTest() {
    if (!aiApiKey.trim()) {
      toast.error("Enter a key to test");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // Real provider connection test via the standalone (project-less) endpoint.
      const result = await testProviderStandalone(aiProvider, aiApiKey.trim());
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

  async function submit() {
    setCreating(true);
    try {
      const res = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        network,
        aiProvider,
        aiApiKey: aiApiKey.trim(),
      });
      setCreatedId(res.project.id);
      setRevealKey(res.apiKey.key);
      toast.success("Project created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create project");
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[680px]">
      <div className="vc-kicker mb-3">New project</div>
      <h1 className="mb-8 text-[30px]">
        Create a <span className="vc-gradient-text italic">project</span>
      </h1>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-5">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`vc-step ${i === step ? "vc-step-active" : ""} ${i < step ? "vc-step-done" : ""}`}
          >
            <span className="vc-step-num">{i < step ? <Check size={12} /> : i + 1}</span>
            <span className="hidden sm:inline">{label}</span>
          </div>
        ))}
      </div>

      <div className="vc-panel p-6">
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="vc-label">Project name</span>
              <input
                className="vc-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Savings App Production"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="vc-label">Description (optional)</span>
              <textarea
                className="vc-textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this project powers"
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="vc-label">Network</span>
              <div className="flex gap-2">
                {(["testnet", "mainnet"] as ProjectNetwork[]).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNetwork(n)}
                    className={`vc-btn flex-1 ${network === n ? "vc-btn-primary" : ""}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[11.5px] text-[var(--vc-faint)]">
                Determines your key prefix: {network === "mainnet" ? "vx_live_…" : "vx_test_…"}
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="vc-label">AI provider (BYOK)</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setAiProvider(p.id);
                      setTestResult(null);
                    }}
                    className={`vc-panel-2 flex flex-col items-start gap-1 p-3 text-left transition-colors ${
                      aiProvider === p.id
                        ? "border-[rgba(124,107,255,0.5)] bg-[rgba(75,59,255,0.08)]"
                        : "hover:border-[var(--vc-line)]"
                    }`}
                  >
                    <span className="text-[13px] text-[var(--vc-text)]">{p.label}</span>
                    <span className="vc-mono text-[11px] text-[var(--vc-faint)]">{p.models}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="vc-label">Provider API key</span>
              <input
                className="vc-input"
                type="password"
                value={aiApiKey}
                onChange={(e) => {
                  setAiApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder="sk-…"
                autoComplete="off"
              />
              <p className="text-[11.5px] text-[var(--vc-faint)]">
                Encrypted with AES-256-GCM before storage. Never returned in full.
              </p>
            </label>

            <div className="flex items-center gap-3">
              <button type="button" onClick={runTest} className="vc-btn" disabled={testing}>
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Test connection
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
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <Row label="Name" value={name} />
            {description && <Row label="Description" value={description} />}
            <Row label="Network" value={network} />
            <Row label="AI provider" value={PROVIDERS.find((p) => p.id === aiProvider)?.label ?? aiProvider} />
            <Row label="Provider key" value="•••••••• (encrypted on save)" />
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--vc-muted)]">
              On create, Verix generates your project API key and shows it once.
            </p>
          </div>
        )}

        {/* Footer nav */}
        <div className="mt-7 flex items-center justify-between border-t border-[var(--vc-line)] pt-5">
          {step > 0 ? (
            <button type="button" onClick={back} className="vc-btn" disabled={creating}>
              <ArrowLeft size={14} />
              Back
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="vc-btn vc-btn-primary">
              Continue
              <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={submit} className="vc-btn vc-btn-primary" disabled={creating}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Create project
            </button>
          )}
        </div>
      </div>

      {revealKey && (
        <ApiKeyRevealModal
          apiKey={revealKey}
          onClose={() => {
            setRevealKey(null);
            if (createdId) router.push(`/projects/${createdId}`);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--vc-line-2)] pb-3">
      <span className="vc-label">{label}</span>
      <span className="truncate text-[13px] text-[var(--vc-text)]">{value}</span>
    </div>
  );
}
