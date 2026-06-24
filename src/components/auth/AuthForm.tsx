"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { login, signup } from "@/lib/console-client";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (isSignup) {
        await signup(email.trim(), password, displayName.trim() || undefined);
        toast.success("Account created");
      } else {
        await login(email.trim(), password);
        toast.success("Signed in");
      }
      router.push("/projects");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="vc-kicker mb-6">{isSignup ? "Create account" : "Sign in"}</div>
      <h1 className="text-[34px] mb-2">
        {isSignup ? (
          <>
            Build on <span className="vc-gradient-text italic">verified</span> execution.
          </>
        ) : (
          <>Welcome back.</>
        )}
      </h1>
      <p className="text-[13.5px] text-[var(--vc-muted)] mb-8 leading-relaxed">
        {isSignup
          ? "One account, many projects. Configure your AI provider and ship verified Stellar DeFi agents."
          : "Sign in to your Verix developer console."}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {isSignup && (
          <label className="flex flex-col gap-2">
            <span className="vc-label">Name (optional)</span>
            <input
              className="vc-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
            />
          </label>
        )}
        <label className="flex flex-col gap-2">
          <span className="vc-label">Email</span>
          <input
            className="vc-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.dev"
            autoComplete="email"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="vc-label">Password</span>
          <input
            className="vc-input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignup ? "At least 8 characters" : "••••••••"}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
        </label>

        <button type="submit" className="vc-btn vc-btn-primary mt-2 w-full" disabled={submitting}>
          {submitting ? "Working…" : isSignup ? "Create account" : "Sign in"}
          {!submitting && <ArrowRight size={15} />}
        </button>
      </form>

      <p className="text-[12.5px] text-[var(--vc-faint)] mt-7">
        {isSignup ? "Already have an account? " : "New to Verix? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="text-[var(--vc-accent-2)] hover:underline"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
