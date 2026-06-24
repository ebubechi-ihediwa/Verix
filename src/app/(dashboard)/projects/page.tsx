"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, FolderPlus } from "lucide-react";
import { listProjects } from "@/lib/console-client";
import type { ProjectSummary } from "@/types/project";
import ProjectCard from "@/components/projects/ProjectCard";

export default function ProjectsOverviewPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load projects");
        setProjects([]);
      });
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="vc-kicker mb-3">Projects</div>
          <h1 className="text-[32px]">
            Your <span className="vc-gradient-text italic">projects</span>
          </h1>
        </div>
        {projects && projects.length > 0 && (
          <Link href="/projects/new" className="vc-btn vc-btn-primary">
            <Plus size={15} />
            New project
          </Link>
        )}
      </div>

      {projects === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="vc-panel h-[150px] animate-pulse-subtle opacity-50" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="vc-panel flex flex-col items-center justify-center gap-5 px-6 py-20 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--vc-line)] text-[var(--vc-accent-2)]">
        <FolderPlus size={20} />
      </div>
      <div>
        <h2 className="mb-2 text-[20px]">No projects yet</h2>
        <p className="mx-auto max-w-[380px] text-[13px] leading-relaxed text-[var(--vc-muted)]">
          A project holds its own API key, AI provider configuration, and agent
          history. Create one to get your Verix API key and start integrating the SDK.
        </p>
      </div>
      <Link href="/projects/new" className="vc-btn vc-btn-primary">
        <Plus size={15} />
        Create your first project
      </Link>
    </div>
  );
}
