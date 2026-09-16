"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  BookOpen,
  Brain,
  CheckSquare,
  FileText,
  ArrowRight,
  Database,
  Plus,
  Compass,
} from "lucide-react";
import { AppShell } from "@/components/navigation/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SystemStats {
  knowledgeCount: number;
  memoryCount: number;
  pendingTasksCount: number;
  completedTasksCount: number;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<SystemStats>({
    knowledgeCount: 0,
    memoryCount: 0,
    pendingTasksCount: 0,
    completedTasksCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [kRes, mRes, tRes] = await Promise.all([
          fetch("/api/knowledge").then((r) => r.json()),
          fetch("/api/memory").then((r) => r.json()),
          fetch("/api/tasks").then((r) => r.json()),
        ]);

        const tasks = tRes.items || [];
        setStats({
          knowledgeCount: kRes.count || 0,
          memoryCount: mRes.count || 0,
          pendingTasksCount: tasks.filter((t: { status: string }) => t.status === "pending" || t.status === "in_progress").length,
          completedTasksCount: tasks.filter((t: { status: string }) => t.status === "completed").length,
        });
      } catch (err) {
        console.error("Failed to load dashboard stats", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const doorways = [
    {
      title: "Chat Doorway",
      subtitle: "Conversational synthesis & multi-layer retrieval",
      description: "Ask questions, query your synthesized notes, and retrieve source citations with exact provenance.",
      href: "/chat",
      icon: MessageSquare,
      accent: "text-amber-400",
      borderHover: "hover:border-accent-knowledge/40",
      tag: "Query",
    },
    {
      title: "Library",
      subtitle: "Layer A: Saved Knowledge",
      description: "External articles, YouTube transcripts, raw notes, documents, and Instagram saves with full metadata.",
      href: "/library",
      icon: BookOpen,
      accent: "text-accent-knowledge",
      borderHover: "hover:border-accent-knowledge/40",
      tag: `${stats.knowledgeCount} Items`,
    },
    {
      title: "Personal Memory",
      subtitle: "Layer B: Identity & Preferences",
      description: "Stable identity facts, behavioral preferences, and verified beliefs separated from external knowledge.",
      href: "/memory",
      icon: Brain,
      accent: "text-accent-memory",
      borderHover: "hover:border-accent-memory/40",
      tag: `${stats.memoryCount} Memories`,
    },
    {
      title: "Tasks & Intentions",
      subtitle: "Layer C: Actionable Todos",
      description: "Intentions extracted from ingested content alongside manual tasks, requiring explicit user completion.",
      href: "/tasks",
      icon: CheckSquare,
      accent: "text-accent-tasks",
      borderHover: "hover:border-accent-tasks/40",
      tag: `${stats.pendingTasksCount} Pending`,
    },
    {
      title: "Weekly Review",
      subtitle: "Reflective Synthesis Document",
      description: "A thoughtful, chronological reflection of what was absorbed, intentions set in motion, and identity evolution.",
      href: "/review",
      icon: FileText,
      accent: "text-emerald-400",
      borderHover: "hover:border-emerald-500/40",
      tag: "Weekly",
    },
  ];

  return (
    <AppShell title="Workshop Overview" subtitle="Personal Knowledge & Memory Operating System">
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-8">
        {/* Banner Section */}
        <div className="p-6 rounded-lg border border-border-subtle bg-surface/80 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-mono tracking-wider uppercase text-emerald-400">
                  Obsidian Workshop • Active
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-text-primary">
                VYAVASTHA Personal Operating System
              </h2>
              <p className="text-xs text-text-secondary mt-1 max-w-xl">
                A restrained, private personal OS strictly distinguishing external saved knowledge from internal memory assertions and actionable intentions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/chat">
                <Button variant="primary" size="sm" icon={<MessageSquare className="w-3.5 h-3.5" />}>
                  Enter Chat
                </Button>
              </Link>
              <Link href="/library">
                <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
                  Add Knowledge
                </Button>
              </Link>
            </div>
          </div>

          {/* Metric Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-border-subtle">
            <div className="p-3 rounded border border-border-subtle bg-card/60">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                Saved Knowledge
              </div>
              <div className="text-lg font-mono font-bold text-accent-knowledge mt-0.5">
                {loading ? "..." : stats.knowledgeCount}
              </div>
              <div className="text-[10px] text-text-tertiary mt-0.5">External Media & Notes</div>
            </div>

            <div className="p-3 rounded border border-border-subtle bg-card/60">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                Personal Memory
              </div>
              <div className="text-lg font-mono font-bold text-accent-memory mt-0.5">
                {loading ? "..." : stats.memoryCount}
              </div>
              <div className="text-[10px] text-text-tertiary mt-0.5">Identity & Facts</div>
            </div>

            <div className="p-3 rounded border border-border-subtle bg-card/60">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                Active Intentions
              </div>
              <div className="text-lg font-mono font-bold text-accent-tasks mt-0.5">
                {loading ? "..." : stats.pendingTasksCount}
              </div>
              <div className="text-[10px] text-text-tertiary mt-0.5">Pending & In Progress</div>
            </div>

            <div className="p-3 rounded border border-border-subtle bg-card/60">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                Tasks Completed
              </div>
              <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
                {loading ? "..." : stats.completedTasksCount}
              </div>
              <div className="text-[10px] text-text-tertiary mt-0.5">Explicit User Action</div>
            </div>
          </div>
        </div>

        {/* Doorway Cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
              Workshop Doorways
            </h3>
            <span className="text-[11px] font-mono text-text-tertiary">
              5 Dedicated Surfaces
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {doorways.map((d) => {
              const Icon = d.icon;
              return (
                <Link
                  key={d.href}
                  href={d.href}
                  className={`group p-5 rounded-lg border border-border-subtle bg-surface hover:bg-card/90 transition-all flex flex-col justify-between ${d.borderHover} shadow-sm`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 rounded border border-border-subtle bg-card">
                        <Icon className={`w-4 h-4 ${d.accent}`} />
                      </div>
                      <Badge variant="neutral" size="sm">
                        {d.tag}
                      </Badge>
                    </div>
                    <h4 className="text-sm font-semibold text-text-primary group-hover:text-white transition-colors">
                      {d.title}
                    </h4>
                    <p className="text-[11px] font-mono text-text-tertiary mt-0.5">
                      {d.subtitle}
                    </p>
                    <p className="text-xs text-text-secondary mt-2.5 line-clamp-2 leading-relaxed">
                      {d.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border-subtle/60 flex items-center justify-between text-xs text-text-tertiary group-hover:text-text-primary transition-colors">
                    <span className="font-mono text-[11px]">Enter doorway</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Architectural Principles Footnote */}
        <div className="p-5 rounded-lg border border-border-subtle bg-surface/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-text-secondary">
          <div className="flex items-center gap-3">
            <Compass className="w-4 h-4 text-text-tertiary shrink-0" />
            <div>
              <span className="font-semibold text-text-primary">Strict Layer Separation: </span>
              External knowledge is never conflated with personal identity assertions or actionable tasks.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] text-text-tertiary">
            <Database className="w-3.5 h-3.5" />
            <span>Turso libSQL</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
