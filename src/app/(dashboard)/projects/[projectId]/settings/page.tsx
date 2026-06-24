"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";
import { deleteProject, updateProject } from "@/lib/console-client";
import { useProject } from "@/components/console/ProjectContext";
import ProviderConfig from "@/components/projects/ProviderConfig";
import ApiKeyPanel from "@/components/projects/ApiKeyPanel";

export default function ProjectSettingsPage() {
  const { project, refresh } = useProject();
  const router = useRouter();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [webhookUrl, setWebhookUrl] = useState(project.webhookUrl ?? "");
  const [savingInfo, setSavingInfo] = useState(false);

  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const infoDirty =
    name !== project.name ||
    description !== (project.description ?? "") ||
    webhookUrl !== (project.webhookUrl ?? "");

  async function saveInfo() {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSavingInfo(true);
    try {
      await updateProject(project.id, {
        name: name.trim(),
        description: description.trim(),
        webhookUrl: webhookUrl.trim(),
      });
      await refresh();
      toast.success("Project updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingInfo(false);
    }
  }

  async function remove() {
    if (confirmName !== project.name) {
      toast.error("Type the project name to confirm");
      return;
    }
    setDeleting(true);
    try {
      await deleteProject(project.id);
      toast.success("Project deleted");
      router.push("/projects");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Project info */}
      <section className="vc-panel p-6">
        <div className="vc-kicker mb-4">Project info</div>
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="vc-label">Name</span>
            <input className="vc-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="vc-label">Description</span>
            <textarea
              className="vc-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this project powers"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="vc-label">Webhook URL</span>
            <input
              className="vc-input"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-app.dev/api/verix/webhook"
            />
            <p className="text-[11.5px] text-[var(--vc-faint)]">
              Verix will POST execution events here. Delivery is wired up in a later sprint.
            </p>
          </label>
          <div>
            <button
              type="button"
              onClick={saveInfo}
              className="vc-btn vc-btn-primary"
              disabled={savingInfo || !infoDirty}
            >
              {savingInfo ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save changes
            </button>
          </div>
        </div>
      </section>

      <ProviderConfig />

      <ApiKeyPanel projectId={project.id} />

      {/* Danger zone */}
      <section className="rounded-[10px] border border-[rgba(220,80,80,0.35)] bg-[rgba(220,80,80,0.04)] p-6">
        <div className="vc-kicker mb-4" style={{ color: "#ff9a9a" }}>
          Danger zone
        </div>
        <h3 className="mb-2 text-[16px]">Delete this project</h3>
        <p className="mb-5 max-w-[560px] text-[12.5px] leading-relaxed text-[var(--vc-muted)]">
          Permanently deletes the project, its API keys, and provider configuration. This
          cannot be undone. Type{" "}
          <span className="vc-mono text-[var(--vc-text)]">{project.name}</span> to confirm.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="vc-input max-w-[280px]"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={project.name}
          />
          <button
            type="button"
            onClick={remove}
            className="vc-btn vc-btn-danger"
            disabled={deleting || confirmName !== project.name}
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete project
          </button>
        </div>
      </section>
    </div>
  );
}
