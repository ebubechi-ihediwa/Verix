import type { LucideIcon } from "lucide-react";

/**
 * Placeholder for project tabs whose real implementation lands in later sprints
 * (Agents, Receipts, Verifications). Keeps the navigation complete and the
 * dark-console styling consistent without faking data.
 */
export default function TabPlaceholder({
  icon: Icon,
  title,
  description,
  sprint,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  sprint: string;
}) {
  return (
    <div className="vc-panel flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--vc-line)] text-[var(--vc-accent-2)]">
        <Icon size={20} />
      </div>
      <div>
        <h2 className="mb-2 text-[19px]">{title}</h2>
        <p className="mx-auto max-w-[400px] text-[13px] leading-relaxed text-[var(--vc-muted)]">
          {description}
        </p>
      </div>
      <span className="vc-chip vc-chip-accent">{sprint}</span>
    </div>
  );
}
