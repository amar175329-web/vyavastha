"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // If already authenticated, redirect to library
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth");
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            router.push("/library");
            return;
          }
        }
      } catch {
        // Stay on login
      } finally {
        setChecking(false);
      }
    }
    checkAuth();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter your master password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        router.push("/library");
        router.refresh();
      } else {
        setError(data.error || "Incorrect master password");
      }
    } catch {
      setError("Failed to connect to authentication gate");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-5 h-5 border-2 border-text-tertiary border-t-accent-knowledge rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-canvas selection:bg-accent-knowledge/30">
      <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface shadow-2xl p-8 relative overflow-hidden">
        {/* Subtle accent hairline */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent-knowledge via-accent-memory to-accent-tasks" />

        {/* Brand Mark */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-lg border border-border-subtle bg-card flex items-center justify-center text-text-primary font-mono font-bold text-lg shadow-inner mb-4">
            V
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-text-primary font-sans">
            VYAVASTHA
          </h1>
          <p className="text-xs text-text-secondary mt-1 font-mono">
            Personal Knowledge & Memory Operating System
          </p>
        </div>

        {/* Master Password Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="masterPassword"
              className="block text-xs font-mono uppercase tracking-wider text-text-tertiary mb-2"
            >
              Master Access Key
            </label>
            <div className="relative">
              <input
                id="masterPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter APP_MASTER_PASSWORD..."
                autoFocus
                className="w-full px-3.5 py-2.5 bg-card border border-border-subtle rounded text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus font-mono"
              />
              <Lock className="w-4 h-4 text-text-tertiary absolute right-3.5 top-3" />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded bg-accent-danger/10 border border-accent-danger/25 text-accent-danger text-xs animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full font-mono text-xs uppercase tracking-wider"
            loading={loading}
            icon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Unlock Workshop
          </Button>
        </form>

        {/* Security / Privacy Footnote */}
        <div className="mt-8 pt-6 border-t border-border-subtle flex items-center justify-center gap-2 text-[11px] text-text-tertiary font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Local master session • Zero telemetry</span>
        </div>
      </div>
    </div>
  );
}
