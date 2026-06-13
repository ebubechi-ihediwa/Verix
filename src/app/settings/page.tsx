"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AiModelProvider, Specialist, ProofPolicy } from "@/types/specialist";
import {
  getSpecialists,
  registerSpecialist,
  updateSpecialist,
  deleteSpecialist,
  getOrInitSession,
  getCurrentSession,
} from "@/lib/api-client";
import VerixMark from "@/components/VerixMark";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROOF_POLICY_OPTIONS: { value: ProofPolicy; label: string; description: string }[] = [
  {
    value: "trace-only",
    label: "Trace only",
    description: "Execution log stored locally - no proof artifact",
  },
  {
    value: "receipt-proof",
    label: "Receipt proof",
    description: "Signed receipt generated per task — verifiable off-chain",
  },
  {
    value: "escrow-eligible",
    label: "Escrow eligible",
    description: "Trustless Work integration — payment released on verified completion",
  },
];

const PROOF_POLICY_COLORS: Record<ProofPolicy, string> = {
  "trace-only": "bg-blue-500/10 text-blue-400",
  "receipt-proof": "bg-violet-500/10 text-violet-400",
  "escrow-eligible": "bg-emerald-500/10 text-emerald-400",
};

const PROOF_POLICY_LABELS: Record<ProofPolicy, string> = {
  "trace-only": "Trace",
  "receipt-proof": "Receipt",
  "escrow-eligible": "Escrow",
};

const AI_MODEL_OPTIONS: { value: AiModelProvider; label: string }[] = [
  { value: "openai", label: "OpenAI (GPT-4o)" },
  { value: "claude", label: "Claude 3.5" },
  { value: "groq", label: "Groq Llama 3.3" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full px-3.5 py-2.5 rounded-xl bg-white/6 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors";

const DISABLED_INPUT_CLASS =
  "w-full px-3.5 py-2.5 rounded-xl bg-white/3 border border-white/8 text-sm text-white/40 cursor-not-allowed";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(getCurrentSession);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [priceUsdc, setPriceUsdc] = useState("0.50");
  const [walletAddress, setWalletAddress] = useState("");
  const [aiModel, setAiModel] = useState<AiModelProvider>("openai");
  const [proofPolicy, setProofPolicy] = useState<ProofPolicy>("trace-only");
  const [apiKey, setApiKey] = useState("");

  const isEditing = editingId !== null;

  const canMutateSpecialist = (s: Specialist) => !s.ownerId || s.ownerId === sessionId;

  useEffect(() => {
    fetchSpecialists();
    getOrInitSession().then(setSessionId).catch(() => {});
  }, []);

  async function fetchSpecialists() {
    try {
      const data = await getSpecialists();
      setSpecialists(data);
    } catch {
      console.error("Failed to fetch specialists");
    } finally {
      setLoading(false);
    }
  }

  function openPublishForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setCapabilities("");
    setPriceUsdc("0.50");
    setWalletAddress("");
    setAiModel("openai");
    setProofPolicy("trace-only");
    setApiKey("");
    setShowForm(true);
  }

  function openEditForm(s: Specialist) {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description);
    setCapabilities(s.capabilities.join(", "));
    setPriceUsdc(s.priceUsdc.toFixed(2));
    setWalletAddress(s.walletAddress?.startsWith("G") ? s.walletAddress : "");
    setAiModel(s.aiModel ?? "openai");
    setProofPolicy(s.proofPolicy ?? "trace-only");
    setApiKey("");
    setShowForm(true);
    // Scroll form into view on mobile
    setTimeout(() => {
      document.getElementById("agent-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    // Client-side validation
    const parsedPrice = parseFloat(priceUsdc);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error("Price must be a non-negative number");
      setSubmitting(false);
      return;
    }
    const trimmedWallet = walletAddress.trim();
    if (trimmedWallet && !/^G[A-Z2-7]{55}$/.test(trimmedWallet)) {
      toast.error("Wallet address must be a Stellar public key starting with G");
      setSubmitting(false);
      return;
    }

    try {
      if (isEditing) {
        await updateSpecialist(editingId!, {
          description,
          capabilities,
          priceUsdc: parsedPrice,
          walletAddress: trimmedWallet || undefined,
          aiModel,
          proofPolicy,
          apiKey: apiKey || undefined,
        });
        toast.success(`${name} updated successfully!`);
      } else {
        await registerSpecialist({
          name,
          description,
          capabilities,
          priceUsdc: parsedPrice,
          walletAddress: trimmedWallet,
          aiModel,
          proofPolicy,
          apiKey: apiKey || undefined,
        });
        toast.success(`${name} published to marketplace!`);
      }

      closeForm();
      fetchSpecialists();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, specialistName: string) {
    toast(`Remove ${specialistName} from the marketplace?`, {
      action: {
        label: "Remove",
        onClick: async () => {
          try {
            await deleteSpecialist(id);
            toast.success(`${specialistName} removed from marketplace.`);
            if (editingId === id) closeForm();
            fetchSpecialists();
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to remove specialist";
            toast.error(msg);
          }
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  }

  return (
    <div className="min-h-screen bg-ink text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <VerixMark inverted />
            </Link>
            <span className="text-white/20 text-sm">/</span>
            <span className="text-sm text-white/60">Agent Settings</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/marketplace"
              className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
              </svg>
              Marketplace
            </Link>
            <Link
              href="/dashboard"
              className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Specialist Agents</h1>
          <p className="text-sm text-white/50">
            Publish AI agents to the marketplace. Each agent is versioned and assigned a proof policy —
            changing price, wallet, capabilities, or proof policy creates a new immutable version snapshot.
          </p>
        </div>

        {/* Agent List */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
              Registered Agents ({specialists.length})
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href="/marketplace"
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition-colors"
              >
                View Marketplace
              </Link>
              <button
                onClick={showForm && !isEditing ? closeForm : openPublishForm}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-white text-ink hover:bg-white/90 transition-colors"
              >
                {showForm && !isEditing ? (
                  "Cancel"
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Publish Agent
                  </>
                )}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-white/30 text-sm">Loading agents...</div>
          ) : specialists.length === 0 ? (
            <div className="text-center py-12 text-white/20 text-sm">
              No agents registered yet.{" "}
              <button onClick={openPublishForm} className="underline underline-offset-2 hover:text-white/40 transition-colors">
                Publish your first agent
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {specialists.map((s, i) => {
                const isOwned = canMutateSpecialist(s);
                const isBeingEdited = editingId === s.id;
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`border rounded-xl transition-colors ${
                      isBeingEdited
                        ? "bg-white/6 border-white/25"
                        : "bg-white/4 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="p-4 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          <h3 className="font-semibold text-sm">{s.name}</h3>
                          <span className="px-2 py-0.5 rounded-md bg-white/8 text-[10px] font-mono text-white/40">
                            {s.aiModel || "openai"}
                          </span>
                          <span className="text-xs font-mono text-white/40">
                            ${s.priceUsdc.toFixed(2)}/task
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                              PROOF_POLICY_COLORS[s.proofPolicy ?? "trace-only"]
                            }`}
                          >
                            {PROOF_POLICY_LABELS[s.proofPolicy ?? "trace-only"]}
                          </span>
                          <span className="text-[10px] font-mono text-white/25">v{s.currentVersion ?? 1}</span>
                          {s.apiKeyMasked && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-[10px] font-mono text-emerald-400/70">
                              🔑 {s.apiKeyMasked}
                            </span>
                          )}
                          {!isOwned && (
                            <span className="text-[9px] text-white/20 bg-white/4 px-1.5 py-0.5 rounded uppercase tracking-wide">
                              read-only
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 mb-2 pl-4.5">{s.description}</p>
                        <div className="flex flex-wrap gap-1.5 pl-4.5">
                          {s.capabilities.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded-md bg-white/8 text-[10px] text-white/50">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      {isOwned && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => (isBeingEdited ? closeForm() : openEditForm(s))}
                            className={`p-2 rounded-lg text-xs transition-colors ${
                              isBeingEdited
                                ? "text-white/60 bg-white/10"
                                : "text-white/30 hover:text-white/70 hover:bg-white/8"
                            }`}
                            title={isBeingEdited ? "Cancel edit" : "Edit agent"}
                          >
                            {isBeingEdited ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(s.id, s.name)}
                            className="p-2 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Remove agent"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Publish / Edit Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              id="agent-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div className="bg-white/4 border border-white/10 rounded-2xl p-6 mb-8">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
                    {isEditing ? `Edit — ${name}` : "Publish New Agent"}
                  </h2>
                  {isEditing && (
                    <span className="text-[10px] text-white/30 font-mono bg-white/4 px-2 py-1 rounded">
                      Name is immutable — changing price, wallet, capabilities or proof policy creates a new version
                    </span>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Name */}
                    <div>
                      <label className="block text-xs text-white/40 mb-1.5">
                        Agent Name {!isEditing && "*"}
                        {isEditing && <span className="ml-1 text-white/20">(immutable)</span>}
                      </label>
                      {isEditing ? (
                        <div className={DISABLED_INPUT_CLASS}>{name}</div>
                      ) : (
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. DataScientist"
                          required
                          className={INPUT_CLASS}
                        />
                      )}
                    </div>

                    {/* Price */}
                    <div>
                      <label className="block text-xs text-white/40 mb-1.5">
                        Price (USDC per task) *
                        {isEditing && <span className="ml-1 text-white/20">— triggers new version</span>}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={priceUsdc}
                        onChange={(e) => setPriceUsdc(e.target.value)}
                        required
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">Description *</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What this agent specializes in — the AI coordinator will use this to route tasks"
                      required
                      rows={2}
                      className={`${INPUT_CLASS} resize-none`}
                    />
                  </div>

                  {/* Capabilities */}
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">
                      Capabilities (comma-separated)
                      {isEditing && <span className="ml-1 text-white/20">— triggers new version</span>}
                    </label>
                    <input
                      type="text"
                      value={capabilities}
                      onChange={(e) => setCapabilities(e.target.value)}
                      placeholder="e.g. data-analysis, machine-learning, statistics"
                      className={INPUT_CLASS}
                    />
                  </div>

                  {/* Proof Policy */}
                  <div>
                    <label className="block text-xs text-white/40 mb-2">
                      Proof Policy
                      {isEditing && <span className="ml-1 text-white/20">— triggers new version</span>}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {PROOF_POLICY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setProofPolicy(opt.value)}
                          className={`px-3.5 py-2.5 rounded-xl text-left border transition-colors ${
                            proofPolicy === opt.value
                              ? "bg-white/15 border-white/30"
                              : "bg-white/4 border-white/10 hover:border-white/20"
                          }`}
                        >
                          <div className="text-xs font-medium text-white mb-0.5">{opt.label}</div>
                          <div className="text-[10px] text-white/35 leading-snug">{opt.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Wallet */}
                    <div>
                      <label className="block text-xs text-white/40 mb-1.5">
                        Wallet Address
                        {isEditing && <span className="ml-1 text-white/20">— triggers new version</span>}
                      </label>
                      <input
                        type="text"
                        value={walletAddress}
                        onChange={(e) => setWalletAddress(e.target.value)}
                        placeholder="G..."
                        className={`${INPUT_CLASS} font-mono`}
                      />
                    </div>

                    {/* AI Model */}
                    <div>
                      <label className="block text-xs text-white/40 mb-1.5">
                        AI Model
                        {isEditing && <span className="ml-1 text-white/20">— triggers new version</span>}
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {AI_MODEL_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setAiModel(option.value)}
                            className={`flex-1 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                              aiModel === option.value
                                ? "bg-white/15 border-white/30 text-white"
                                : "bg-white/4 border-white/10 text-white/40 hover:text-white/60"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">
                      API Key
                      <span className="text-white/20 ml-1">
                        {isEditing ? "(leave blank to keep existing key — encrypted at rest)" : "(encrypted at rest)"}
                      </span>
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={isEditing ? "Enter new key to replace existing…" : "sk-... or your provider API key"}
                      className={`${INPUT_CLASS} font-mono`}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closeForm}
                      className="px-4 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/70 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-6 py-2.5 rounded-xl text-sm font-medium bg-white text-ink hover:bg-white/90 transition-colors disabled:opacity-50"
                    >
                      {submitting
                        ? isEditing
                          ? "Saving…"
                          : "Publishing…"
                        : isEditing
                        ? "Save Changes"
                        : "Publish Agent"}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info Card */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">How AI Routing Works</h3>
          <div className="space-y-2.5 text-xs text-white/40 leading-relaxed">
            <p>
              <span className="text-white/60 font-medium">1.</span> When you submit a task, the coordinator sends your
              prompt to an AI router along with all registered agent descriptions.
            </p>
            <p>
              <span className="text-white/60 font-medium">2.</span> The AI selects specialists based on capabilities and
              proof policy. Only online agents are considered.
            </p>
            <p>
              <span className="text-white/60 font-medium">3.</span> Each selected specialist executes their part. An
              immutable version snapshot is recorded at invocation time so receipts can prove the exact metadata used.
            </p>
            <p>
              <span className="text-white/60 font-medium">4.</span> Settlement is tracked on Stellar through Trustless Work escrow.
              Escrow-eligible agents release payment only after completion is verified.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
