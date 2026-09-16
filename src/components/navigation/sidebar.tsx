"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  BookOpen,
  Brain,
  CheckSquare,
  FileText,
  LogOut,
  Database,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badgeKey?: "knowledge" | "memory" | "tasks";
}

const navItems: NavItem[] = [
  {
    name: "Chat",
    href: "/chat",
    icon: MessageSquare,
    accentColor: "text-amber-400 group-hover:text-amber-300",
  },
  {
    name: "Library",
    href: "/library",
    icon: BookOpen,
    accentColor: "text-accent-knowledge group-hover:text-amber-300",
    badgeKey: "knowledge",
  },
  {
    name: "Memory",
    href: "/memory",
    icon: Brain,
    accentColor: "text-accent-memory group-hover:text-purple-300",
    badgeKey: "memory",
  },
  {
    name: "Tasks",
    href: "/tasks",
    icon: CheckSquare,
    accentColor: "text-accent-tasks group-hover:text-cyan-300",
    badgeKey: "tasks",
  },
  {
    name: "Review",
    href: "/review",
    icon: FileText,
    accentColor: "text-emerald-400 group-hover:text-emerald-300",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [dbStatus, setDbStatus] = useState<{ ok: boolean; latencyMs?: number }>({
    ok: true,
  });

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          setDbStatus({
            ok: data.database?.status === "connected",
            latencyMs: data.database?.latencyMs,
          });
        }
      } catch {
        setDbStatus({ ok: false });
      }
    }
    checkHealth();
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth", { method: "DELETE" });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  }

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-border-subtle bg-surface select-none h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-border-subtle">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded border border-border-subtle bg-card flex items-center justify-center text-text-primary font-mono font-bold text-sm shadow-sm group-hover:border-border-focus transition-colors">
            V
          </div>
          <div className="flex flex-col">
            <span className="font-mono font-semibold tracking-wider text-sm text-text-primary group-hover:text-white transition-colors">
              VYAVASTHA
            </span>
            <span className="text-[10px] font-mono tracking-widest text-text-tertiary uppercase">
              Personal OS
            </span>
          </div>
        </Link>

        {/* Database Status Indicator */}
        <div className="mt-4 flex items-center gap-2 px-2.5 py-1.5 rounded border border-border-subtle bg-card text-[11px] font-mono text-text-secondary">
          <Database className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="flex-1 truncate">Turso libSQL</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              dbStatus.ok ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-accent-danger"
            }`}
          />
          <span className="text-[10px] text-text-tertiary">
            {dbStatus.latencyMs !== undefined ? `${dbStatus.latencyMs}ms` : "Live"}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
          Workshop Layers
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center justify-between px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                isActive
                  ? "bg-card text-text-primary border border-border-focus shadow-sm"
                  : "text-text-secondary hover:text-text-primary hover:bg-card/50 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? item.accentColor : "text-text-tertiary group-hover:text-text-secondary"
                  }`}
                />
                <span>{item.name}</span>
              </div>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-text-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / System Session */}
      <div className="p-4 border-t border-border-subtle bg-surface/50">
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-text-primary">Obsidian Workshop</span>
            <span className="text-[10px] font-mono text-text-tertiary">v0.1.0 • Private</span>
          </div>
          <button
            onClick={handleLogout}
            title="Lock session / Logout"
            className="p-1.5 rounded border border-border-subtle bg-card hover:bg-card/80 hover:text-accent-danger transition-colors text-text-tertiary"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
