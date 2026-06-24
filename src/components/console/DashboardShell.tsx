"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, type ConsoleUser } from "@/lib/console-client";
import Sidebar from "@/components/console/Sidebar";
import TopBar from "@/components/console/TopBar";

/**
 * Authenticated console shell. Gates on the session: redirects unauthenticated
 * users to /login. Renders the sidebar + top bar around the routed content.
 */
export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<ConsoleUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    getMe()
      .then((u) => {
        if (!active) return;
        if (!u) {
          router.replace("/login");
          return;
        }
        setUser(u);
        setChecking(false);
      })
      .catch(() => {
        if (active) router.replace("/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (checking || !user) {
    return (
      <div className="vc-root flex items-center justify-center">
        <div className="vc-mesh" aria-hidden />
        <div className="relative z-10 flex items-center gap-3 text-[13px] text-[var(--vc-muted)]">
          <span className="vc-dot animate-pulse-subtle text-[var(--vc-accent-2)]" />
          Authenticating…
        </div>
      </div>
    );
  }

  return (
    <div className="vc-root flex">
      <div className="vc-mesh" aria-hidden />
      <Sidebar />
      <div className="relative z-10 flex min-h-screen flex-1 flex-col">
        <TopBar user={user} />
        <main className="flex-1 px-6 py-8 sm:px-10">{children}</main>
      </div>
    </div>
  );
}
