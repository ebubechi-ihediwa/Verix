"use client";

import { createContext, useContext } from "react";
import type { ProjectSummary } from "@/types/project";

interface ProjectContextValue {
  project: ProjectSummary;
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export const ProjectProvider = ProjectContext.Provider;

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a project layout");
  return ctx;
}
