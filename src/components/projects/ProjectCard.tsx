"use client";

import Link from "next/link";
import { ArrowUpRight, KeyRound, KeySquare } from "lucide-react";
import type { ProjectSummary } from "@/types/project";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
  kimi: "Kimi",
};

export default function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="vc-panel group flex flex-col gap-5 p-5 transition-colors hover:border-[rgba(124,107,255,0.35)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[18px]">{project.name}</h3>
          {project.description && (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--vc-muted)]">
              {project.description}
            </p>
          )}
        </div>
        <ArrowUpRight
          size={16}
          className="shrink-0 text-[var(--vc-faint)] transition-colors group-hover:text-[var(--vc-accent-2)]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="vc-chip">
          <span
            className={`vc-dot ${
              project.network === "mainnet" ? "text-[var(--vc-m-teal)]" : "text-[var(--vc-accent-2)]"
            }`}
          />
          {project.network}
        </span>
        <span className="vc-chip">{PROVIDER_LABEL[project.aiProvider] ?? project.aiProvider}</span>
        <span className="vc-chip">
          {project.hasApiKey ? <KeyRound size={11} /> : <KeySquare size={11} />}
          {project.hasApiKey ? "Key active" : "No key"}
        </span>
      </div>
    </Link>
  );
}
