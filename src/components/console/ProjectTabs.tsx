"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { seg: "", label: "Overview" },
  { seg: "agents", label: "Agents" },
  { seg: "receipts", label: "Receipts" },
  { seg: "verifications", label: "Verifications" },
  { seg: "settings", label: "Settings" },
];

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="flex items-center gap-7 border-b border-[var(--vc-line)]">
      {TABS.map(({ seg, label }) => {
        const href = seg ? `${base}/${seg}` : base;
        const active = seg ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
        return (
          <Link key={label} href={href} className={`vc-tab ${active ? "vc-tab-active" : ""}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
