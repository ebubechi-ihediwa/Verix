"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/console-client";
import type { ProjectSummary } from "@/types/project";
import { ProjectProvider } from "@/components/console/ProjectContext";
import ProjectTabs from "@/components/console/ProjectTabs";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
  kimi: "Kimi",
};

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");

  const refresh = useCallback(async () => {
    const p = await getProject(projectId);
    setProject(p);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((p) => {
        if (!active) return;
        setProject(p);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("notfound");
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 py-20 text-[13px] text-[var(--vc-muted)]">
        <span className="vc-dot animate-pulse-subtle text-[var(--vc-accent-2)]" />
        Loading project…
      </div>
    );
  }

  if (status === "notfound" || !project) {
    return (
      <div className="vc-panel mx-auto max-w-[520px] p-10 text-center">
        <h2 className="mb-2 text-[20px]">Project not found</h2>
        <p className="mb-6 text-[13px] text-[var(--vc-muted)]">
          It may have been deleted, or you don&apos;t have access to it.
        </p>
        <Link href="/projects" className="vc-btn vc-btn-primary">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <ProjectProvider value={{ project, refresh }}>
      <div className="mx-auto w-full max-w-[1000px]">
        <Link
          href="/projects"
          className="mb-5 inline-flex items-center gap-2 text-[12.5px] text-[var(--vc-faint)] hover:text-[var(--vc-text)]"
        >
          <ArrowLeft size={13} />
          All projects
        </Link>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px]">{project.name}</h1>
          <span className="vc-chip">
            <span
              className={`vc-dot ${
                project.network === "mainnet"
                  ? "text-[var(--vc-m-teal)]"
                  : "text-[var(--vc-accent-2)]"
              }`}
            />
            {project.network}
          </span>
          <span className="vc-chip">{PROVIDER_LABEL[project.aiProvider] ?? project.aiProvider}</span>
        </div>

        <div className="mb-8">
          <ProjectTabs projectId={projectId} />
        </div>

        {children}
      </div>
    </ProjectProvider>
  );
}
