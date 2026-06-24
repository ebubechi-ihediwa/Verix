"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, BookText, Activity } from "lucide-react";
import VerixMark from "@/components/VerixMark";

const NAV = [
  { href: "/projects", label: "Projects", icon: LayoutGrid, enabled: true },
  { href: "#", label: "Activity", icon: Activity, enabled: false },
  { href: "#", label: "Docs", icon: BookText, enabled: false },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="relative z-10 hidden w-[232px] shrink-0 flex-col border-r border-[var(--vc-line)] md:flex">
      <div className="flex h-[60px] items-center border-b border-[var(--vc-line)] px-5">
        <Link href="/projects" className="flex items-center">
          <VerixMark size="sm" inverted />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        <div className="vc-label px-2 pb-2 pt-1">Console</div>
        {NAV.map(({ href, label, icon: Icon, enabled }) => {
          const active = enabled && (pathname === href || pathname.startsWith(`${href}/`));
          if (!enabled) {
            return (
              <span
                key={label}
                className="vc-navitem cursor-default opacity-45"
                title="Coming soon"
              >
                <Icon size={16} />
                {label}
                <span className="ml-auto text-[10px] text-[var(--vc-faint)]">soon</span>
              </span>
            );
          }
          return (
            <Link
              key={label}
              href={href}
              className={`vc-navitem ${active ? "vc-navitem-active" : ""}`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--vc-line)] p-4">
        <div className="vc-chip vc-chip-accent">
          <span className="vc-dot" />
          Testnet
        </div>
      </div>
    </aside>
  );
}
