"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { listProjects } from "@/lib/console-client";
import type { ProjectSummary } from "@/types/project";

/**
 * Live project switcher. Fetches the current user's projects and navigates
 * between them. The active project is derived from the route param.
 */
export default function ProjectSwitcher() {
  const router = useRouter();
  const params = useParams<{ projectId?: string }>();
  const currentId = params?.projectId;

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = projects?.find((p) => p.id === currentId);
  const label = current?.name ?? "All projects";

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg border border-[var(--vc-line)] px-3 py-1.5 text-[13px] text-[var(--vc-muted)] transition-colors hover:border-[rgba(124,107,255,0.35)] hover:text-[var(--vc-text)]"
      >
        <span className="vc-dot text-[var(--vc-m-teal)]" />
        <span className="max-w-[180px] truncate">{label}</span>
        <ChevronsUpDown size={13} className="text-[var(--vc-faint)]" />
      </button>

      {open && (
        <div className="vc-panel absolute left-0 top-[calc(100%+6px)] z-50 w-[260px] p-1.5">
          <button
            type="button"
            onClick={() => go("/projects")}
            className="vc-navitem w-full justify-start"
          >
            All projects
          </button>
          <div className="my-1 h-px bg-[var(--vc-line-2)]" />
          <div className="max-h-[280px] overflow-y-auto">
            {projects === null ? (
              <div className="px-3 py-2 text-[12px] text-[var(--vc-faint)]">Loading…</div>
            ) : projects.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-[var(--vc-faint)]">No projects yet</div>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => go(`/projects/${p.id}`)}
                  className="vc-navitem w-full justify-start"
                >
                  <span className="flex-1 truncate text-left">{p.name}</span>
                  {p.id === currentId && <Check size={14} className="text-[var(--vc-m-teal)]" />}
                </button>
              ))
            )}
          </div>
          <div className="my-1 h-px bg-[var(--vc-line-2)]" />
          <button
            type="button"
            onClick={() => go("/projects/new")}
            className="vc-navitem w-full justify-start text-[var(--vc-accent-2)]"
          >
            <Plus size={14} />
            New project
          </button>
        </div>
      )}
    </div>
  );
}
