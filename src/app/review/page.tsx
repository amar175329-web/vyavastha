"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Calendar,
  BookOpen,
  Brain,
  CheckSquare,
  Sparkles,
  RefreshCw,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/navigation/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface WeeklyReviewSummary {
  periodStart: string;
  periodEnd: string;
  itemsIngested: number;
  tasksCreated: number;
  tasksCompleted: number;
  memoriesFormed: number;
  keyKnowledge: Array<{ id: string; title: string; summary: string; mediaType: string }>;
  intentionsInMotion: Array<{ id: string; title: string; status: string; dueDate?: string }>;
  memoryAdjustments: Array<{ id: string; key: string; value: string; category: string; confirmedByUser: boolean }>;
  reflectiveSynthesis: string;
}

export default function ReviewPage() {
  const [review, setReview] = useState<WeeklyReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function fetchReview() {
    setLoading(true);
    try {
      const res = await fetch("/api/review");
      if (res.ok) {
        const data = await res.json();
        setReview(data);
      }
    } catch (err) {
      console.error("Failed to load review", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReview();
  }, []);

  async function handleGenerateReview() {
    setGenerating(true);
    try {
      const res = await fetch("/api/review", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReview(data.review);
      }
    } catch (err) {
      console.error("Failed to generate review", err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <AppShell
      title="Weekly Review"
      subtitle="Reflective Synthesis & Activity Document"
      actionButton={
        <Button
          variant="secondary"
          size="sm"
          onClick={handleGenerateReview}
          loading={generating}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Generate Review
        </Button>
      }
    >
      <div className="max-w-4xl mx-auto p-6 md:p-8 space-y-8">
        {loading ? (
          <div className="space-y-6 pt-4">
            <div className="h-28 rounded-lg border border-border-subtle bg-surface/50 animate-pulse" />
            <div className="h-64 rounded-lg border border-border-subtle bg-surface/50 animate-pulse" />
          </div>
        ) : review ? (
          <>
            {/* Header Document Banner */}
            <div className="p-6 md:p-8 rounded-lg border border-border-subtle bg-surface shadow-sm relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
                <div>
                  <div className="inline-flex items-center gap-2 text-[11px] font-mono tracking-wider uppercase text-text-tertiary mb-2">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      Weekly Review • {review.periodStart} – {review.periodEnd}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-text-primary">
                    Seven-Day Operating Synthesis
                  </h2>
                  <p className="text-xs text-text-secondary mt-1">
                    A reflective personal document tracking what you absorbed, intentions in motion, and identity evolution.
                  </p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateReview}
                  loading={generating}
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Regenerate
                </Button>
              </div>

              {/* Truthful Metric Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
                <div className="p-3.5 rounded border border-border-subtle bg-card/60">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                    Items Ingested
                  </div>
                  <div className="text-xl font-mono font-bold text-accent-knowledge mt-1">
                    {review.itemsIngested}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">External Knowledge</div>
                </div>

                <div className="p-3.5 rounded border border-border-subtle bg-card/60">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                    Tasks Created
                  </div>
                  <div className="text-xl font-mono font-bold text-accent-tasks mt-1">
                    {review.tasksCreated}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">New Intentions</div>
                </div>

                <div className="p-3.5 rounded border border-border-subtle bg-card/60">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                    Tasks Completed
                  </div>
                  <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
                    {review.tasksCompleted}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">Explicitly Executed</div>
                </div>

                <div className="p-3.5 rounded border border-border-subtle bg-card/60">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                    Memories Formed
                  </div>
                  <div className="text-xl font-mono font-bold text-accent-memory mt-1">
                    {review.memoriesFormed}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">Identity & Facts</div>
                </div>
              </div>
            </div>

            {/* Narrative Synthesis Section */}
            <div className="p-6 rounded-lg border border-border-subtle bg-surface/70 space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Reflective Synthesis</span>
              </div>
              <p className="text-sm text-text-primary leading-relaxed font-serif italic">
                &ldquo;{review.reflectiveSynthesis}&rdquo;
              </p>
            </div>

            {/* Key Knowledge Absorbed */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-accent-knowledge" />
                  <h3 className="text-sm font-semibold text-text-primary font-sans">
                    Key Knowledge Absorbed
                  </h3>
                </div>
                <Link
                  href="/library"
                  className="text-xs text-text-tertiary hover:text-text-primary inline-flex items-center gap-1 font-mono"
                >
                  <span>Open Library</span>
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>

              {review.keyKnowledge.length === 0 ? (
                <div className="p-6 rounded-lg border border-dashed border-border-subtle bg-surface/30 text-center text-xs text-text-tertiary">
                  No external articles, transcripts, or notes were ingested in this period.
                </div>
              ) : (
                <div className="space-y-3">
                  {review.keyKnowledge.map((k) => (
                    <div
                      key={k.id}
                      className="p-4 rounded-lg border border-border-subtle bg-surface flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="knowledge" size="sm">
                            {k.mediaType}
                          </Badge>
                          <span className="text-xs font-semibold text-text-primary">
                            {k.title}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                          {k.summary}
                        </p>
                      </div>
                      <Link
                        href={`/library?item=${k.id}`}
                        className="text-[11px] font-mono text-accent-tasks hover:underline shrink-0 inline-flex items-center gap-1"
                      >
                        <span>View</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Intentions in Motion */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-accent-tasks" />
                  <h3 className="text-sm font-semibold text-text-primary font-sans">
                    Intentions in Motion
                  </h3>
                </div>
                <Link
                  href="/tasks"
                  className="text-xs text-text-tertiary hover:text-text-primary inline-flex items-center gap-1 font-mono"
                >
                  <span>Open Tasks</span>
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>

              {review.intentionsInMotion.length === 0 ? (
                <div className="p-6 rounded-lg border border-dashed border-border-subtle bg-surface/30 text-center text-xs text-text-tertiary">
                  No active intentions or pending tasks. Your slate is clear.
                </div>
              ) : (
                <div className="space-y-2">
                  {review.intentionsInMotion.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-lg border border-border-subtle bg-surface flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-text-primary font-medium">{t.title}</span>
                      <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                        {t.dueDate && (
                          <span className="text-text-tertiary">
                            Due {new Date(t.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        <Badge variant="tasks" size="sm">
                          {t.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Memory Adjustments */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-accent-memory" />
                  <h3 className="text-sm font-semibold text-text-primary font-sans">
                    Personal Memory Adjustments
                  </h3>
                </div>
                <Link
                  href="/memory"
                  className="text-xs text-text-tertiary hover:text-text-primary inline-flex items-center gap-1 font-mono"
                >
                  <span>Open Memory</span>
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>

              {review.memoryAdjustments.length === 0 ? (
                <div className="p-6 rounded-lg border border-dashed border-border-subtle bg-surface/30 text-center text-xs text-text-tertiary">
                  Zero identity adjustments or memory assertions recorded in this cycle.
                </div>
              ) : (
                <div className="space-y-2">
                  {review.memoryAdjustments.map((m) => (
                    <div
                      key={m.id}
                      className="p-3.5 rounded-lg border border-border-subtle bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-text-primary">{m.key}</span>
                          <Badge variant="memory" size="sm">
                            {m.category}
                          </Badge>
                        </div>
                        <p className="text-text-secondary mt-1">{m.value}</p>
                      </div>
                      <Badge
                        variant={m.confirmedByUser ? "success" : "warning"}
                        size="sm"
                        className="shrink-0 self-start sm:self-center"
                      >
                        {m.confirmedByUser ? "Confirmed" : "Proposed"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document Signature Footnote */}
            <div className="pt-6 border-t border-border-subtle flex items-center justify-between text-[11px] font-mono text-text-tertiary">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Truthful Personal Accounting • Obsidian Workshop</span>
              </div>
              <span>VYAVASTHA v0.1.0</span>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-text-secondary text-sm">
            Failed to load weekly review.
          </div>
        )}
      </div>
    </AppShell>
  );
}
