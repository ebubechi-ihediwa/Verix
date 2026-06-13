"use client";

import { useState } from "react";
import { X, ChevronRight } from "lucide-react";

export type MandateTemplate = {
  id: string;
  protocol: "blend" | "soroswap" | "aquarius" | "anchor";
  label: string;
  tag: string;
  description: string;
  fields: MandateField[];
};

type MandateField = {
  key: string;
  label: string;
  type: "number" | "text" | "select";
  placeholder?: string;
  options?: string[];
  unit?: string;
  defaultValue?: string;
};

const TEMPLATES: MandateTemplate[] = [
  {
    id: "blend-supply",
    protocol: "blend",
    label: "Supply to Blend",
    tag: "Yield",
    description: "Supply USDC to a Blend lending pool and earn yield.",
    fields: [
      { key: "amount", label: "Amount", type: "number", placeholder: "100", unit: "USDC" },
      { key: "pool", label: "Pool", type: "select", options: ["USDC-XLM", "USDC-ETH", "USDC-BTC"], defaultValue: "USDC-XLM" },
      { key: "minApy", label: "Min APY", type: "number", placeholder: "5", unit: "%" },
    ],
  },
  {
    id: "blend-withdraw",
    protocol: "blend",
    label: "Withdraw from Blend",
    tag: "Yield",
    description: "Withdraw supplied USDC from a Blend pool.",
    fields: [
      { key: "amount", label: "Amount", type: "number", placeholder: "100", unit: "USDC" },
      { key: "pool", label: "Pool", type: "select", options: ["USDC-XLM", "USDC-ETH", "USDC-BTC"], defaultValue: "USDC-XLM" },
    ],
  },
  {
    id: "soroswap-swap",
    protocol: "soroswap",
    label: "Swap on Soroswap",
    tag: "Trading",
    description: "Execute a token swap with configurable slippage.",
    fields: [
      { key: "tokenIn", label: "From", type: "select", options: ["USDC", "XLM", "ETH", "BTC"], defaultValue: "USDC" },
      { key: "tokenOut", label: "To", type: "select", options: ["XLM", "USDC", "ETH", "BTC"], defaultValue: "XLM" },
      { key: "amountIn", label: "Amount", type: "number", placeholder: "50", unit: "USDC" },
      { key: "maxSlippage", label: "Max Slippage", type: "number", placeholder: "0.5", unit: "%" },
    ],
  },
  {
    id: "aquarius-add-liquidity",
    protocol: "aquarius",
    label: "Add Liquidity to Aquarius",
    tag: "Liquidity",
    description: "Deposit into an Aquarius AMM pool and earn trading fees.",
    fields: [
      { key: "tokenPair", label: "Pool", type: "select", options: ["XLM/USDC", "XLM/AQUA", "USDC/BTC"], defaultValue: "XLM/USDC" },
      { key: "amount", label: "Amount", type: "number", placeholder: "200", unit: "USDC equiv." },
    ],
  },
  {
    id: "anchor-payment",
    protocol: "anchor",
    label: "Cross-border Payment",
    tag: "Payments",
    description: "Send USDC internationally via the best Stellar anchor route.",
    fields: [
      { key: "amount", label: "Amount", type: "number", placeholder: "500", unit: "USDC" },
      { key: "destination", label: "Currency", type: "select", options: ["NGN", "KES", "GHS", "ZAR", "USD"], defaultValue: "NGN" },
      { key: "maxFeePercent", label: "Max Fee", type: "number", placeholder: "1.5", unit: "%" },
    ],
  },
];

const PROTOCOL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blend:    { bg: "rgba(74,222,128,0.07)", border: "rgba(74,222,128,0.20)", text: "#4ade80" },
  soroswap: { bg: "rgba(251,191,36,0.07)", border: "rgba(251,191,36,0.20)", text: "#fbbf24" },
  aquarius: { bg: "rgba(129,140,248,0.10)", border: "rgba(129,140,248,0.25)", text: "#818cf8" },
  anchor:   { bg: "rgba(56,189,248,0.07)", border: "rgba(56,189,248,0.20)", text: "#38bdf8" },
};

interface Props {
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}

export default function DefiMandateWizard({ onClose, onSubmit }: Props) {
  const [step, setStep] = useState<"pick" | "configure">("pick");
  const [selected, setSelected] = useState<MandateTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  function pickTemplate(tpl: MandateTemplate) {
    const defaults: Record<string, string> = {};
    tpl.fields.forEach((f) => {
      if (f.defaultValue) defaults[f.key] = f.defaultValue;
    });
    setSelected(tpl);
    setValues(defaults);
    setStep("configure");
  }

  function buildPrompt(): string {
    if (!selected) return "";
    const parts = selected.fields.map((f) => {
      const v = values[f.key] ?? "";
      if (!v) return null;
      return `${f.label}: ${v}${f.unit ? " " + f.unit : ""}`;
    }).filter(Boolean);
    return `${selected.description} ${parts.join(", ")}.`;
  }

  const canSubmit = selected?.fields.every((f) => !!values[f.key]) ?? false;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--color-dark-surface, #0f1120)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 14,
        width: "100%", maxWidth: 540,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", margin: "0 0 4px" }}>
              DeFi Mandate Wizard
            </p>
            <h2 style={{ fontSize: 15, fontWeight: 650, color: "#eef0f8", margin: 0, letterSpacing: "-0.01em" }}>
              {step === "pick" ? "Choose a protocol action" : `Configure: ${selected?.label}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "rgba(255,255,255,0.45)",
            }}
          >
            <X size={13} />
          </button>
        </div>

        {step === "pick" && (
          <div style={{ padding: "16px 20px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {TEMPLATES.map((tpl) => {
                const col = PROTOCOL_COLORS[tpl.protocol];
                return (
                  <button
                    key={tpl.id}
                    onClick={() => pickTemplate(tpl)}
                    style={{
                      background: "rgba(255,255,255,0.025)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10, padding: "14px 14px 12px",
                      textAlign: "left", cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = col.border;
                      (e.currentTarget as HTMLButtonElement).style.background = col.bg;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.025)";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                        color: col.text,
                        background: col.bg, border: `1px solid ${col.border}`,
                        padding: "2px 7px", borderRadius: 999,
                      }}>{tpl.tag}</span>
                      <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.2)" }} />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#eef0f8", margin: "0 0 5px", letterSpacing: "-0.01em" }}>{tpl.label}</p>
                    <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.5 }}>{tpl.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "configure" && selected && (
          <div style={{ padding: "20px 20px 24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              {selected.fields.map((field) => {
                const val = values[field.key] ?? "";
                return (
                  <div key={field.key}>
                    <label style={{
                      display: "block", fontSize: 11, fontWeight: 600,
                      color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em",
                      textTransform: "uppercase", marginBottom: 6,
                    }}>
                      {field.label}{field.unit ? <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.2)", marginLeft: 4 }}>({field.unit})</span> : null}
                    </label>
                    {field.type === "select" ? (
                      <select
                        value={val}
                        onChange={(e) => setValues((p) => ({ ...p, [field.key]: e.target.value }))}
                        style={{
                          width: "100%", padding: "8px 12px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 8, color: "#eef0f8",
                          fontSize: 13, outline: "none",
                        }}
                      >
                        <option value="" disabled>Choose…</option>
                        {field.options?.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ position: "relative" }}>
                        <input
                          type={field.type}
                          value={val}
                          placeholder={field.placeholder}
                          onChange={(e) => setValues((p) => ({ ...p, [field.key]: e.target.value }))}
                          style={{
                            width: "100%", padding: "8px 12px",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 8, color: "#eef0f8",
                            fontSize: 13, outline: "none",
                            paddingRight: field.unit ? 52 : 12,
                          }}
                        />
                        {field.unit && (
                          <span style={{
                            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                            fontSize: 11, color: "rgba(255,255,255,0.3)", pointerEvents: "none",
                          }}>{field.unit}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Preview prompt */}
            {canSubmit && (
              <div style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8, padding: "10px 13px", marginBottom: 16,
              }}>
                <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", margin: "0 0 4px" }}>Generated prompt</p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.5 }}>{buildPrompt()}</p>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setStep("pick")}
                style={{
                  flex: 1, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.45)", cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                onClick={() => { if (canSubmit) onSubmit(buildPrompt()); }}
                disabled={!canSubmit}
                style={{
                  flex: 2, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 650,
                  background: canSubmit ? "#5b5fc7" : "rgba(91,95,199,0.3)",
                  border: "none", color: "#fff", cursor: canSubmit ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                }}
              >
                Use this mandate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
