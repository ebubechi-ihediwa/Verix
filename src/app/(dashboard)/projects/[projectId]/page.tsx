"use client";

import Link from "next/link";
import { KeyRound, KeySquare, Settings2 } from "lucide-react";
import { useProject } from "@/components/console/ProjectContext";
import CopyButton from "@/components/console/CopyButton";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
  kimi: "Kimi",
};

export default function ProjectOverviewPage() {
  const { project } = useProject();

  const snippet = `import { VerixClient } from '@verix/sdk'

const verix = new VerixClient({
  apiKey: process.env.VERIX_API_KEY, // ${project.network === "mainnet" ? "vx_live_…" : "vx_test_…"}
})`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Network" value={project.network} />
        <Fact label="AI provider" value={PROVIDER_LABEL[project.aiProvider] ?? project.aiProvider} />
        <Fact label="Provider key" value={project.aiApiKeyMasked ?? "Not set"} mono />
        <Fact
          label="API key"
          value={project.hasApiKey ? "Active" : "None"}
          icon={project.hasApiKey ? KeyRound : KeySquare}
        />
      </div>

      {project.description && (
        <div className="vc-panel p-5">
          <div className="vc-label mb-2">Description</div>
          <p className="text-[13.5px] leading-relaxed text-[var(--vc-muted)]">
            {project.description}
          </p>
        </div>
      )}

      <div className="vc-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="vc-kicker">Integrate</div>
          <CopyButton value={snippet} label="Copy snippet" />
        </div>
        <pre className="vc-panel-2 overflow-x-auto p-4 text-[12.5px] leading-relaxed text-[var(--vc-muted)]">
          <code className="vc-mono">{snippet}</code>
        </pre>
        <p className="mt-3 text-[12px] text-[var(--vc-faint)]">
          Generate or rotate your project API key in{" "}
          <Link
            href={`/projects/${project.id}/settings`}
            className="text-[var(--vc-accent-2)] hover:underline"
          >
            Settings
          </Link>
          . The SDK gateway that consumes these keys ships in a later sprint.
        </p>
      </div>

      <div className="flex">
        <Link href={`/projects/${project.id}/settings`} className="vc-btn">
          <Settings2 size={14} />
          Project settings
        </Link>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  icon: Icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: typeof KeyRound;
}) {
  return (
    <div className="vc-panel p-4">
      <div className="vc-label mb-2 flex items-center gap-1.5">
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div className={`truncate text-[14px] text-[var(--vc-text)] ${mono ? "vc-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
