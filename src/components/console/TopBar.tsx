"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { logout, type ConsoleUser } from "@/lib/console-client";
import ProjectSwitcher from "@/components/console/ProjectSwitcher";

export default function TopBar({ user }: { user: ConsoleUser }) {
  const router = useRouter();

  async function onLogout() {
    try {
      await logout();
    } catch {
      /* even if the call fails, send the user to login */
    }
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="relative z-10 flex h-[60px] items-center justify-between border-b border-[var(--vc-line)] px-5">
      <ProjectSwitcher />

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="vc-label">Signed in</span>
          <span className="text-[13px] text-[var(--vc-muted)]">{user.email}</span>
        </div>
        <button type="button" onClick={onLogout} className="vc-btn" title="Sign out">
          <LogOut size={14} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
