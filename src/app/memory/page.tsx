"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Brain,
  Plus,
  Search,
  Check,
  CheckCircle2,
  Clock,
  Shield,
  ExternalLink,
  Trash2,
  User,
  Sliders,
  FolderKanban,
  Users,
  Lightbulb,
  X,
} from "lucide-react";
import { AppShell } from "@/components/navigation/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";

interface PersonalMemoryItem {
  id: string;
  category: "preference" | "identity" | "project" | "relationship" | "fact";
  key: string;
  value: string;
  provenanceSourceId?: string;
  confidenceScore: number;
  confirmedByUser: boolean;
  createdAt: string;
  updatedAt: string;
}

const categoryFilters: Array<{
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}> = [
  { label: "All Categories", value: "all" },
  { label: "Preferences", value: "preference", icon: Sliders },
  { label: "Identity", value: "identity", icon: User },
  { label: "Projects", value: "project", icon: FolderKanban },
  { label: "Relationships", value: "relationship", icon: Users },
  { label: "Facts", value: "fact", icon: Lightbulb },
];

export default function MemoryPage() {
  const [memories, setMemories] = useState<PersonalMemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Add Memory Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCategory, setNewCategory] = useState<PersonalMemoryItem["category"]>("identity");
  const [newConfidence, setNewConfidence] = useState(95);
  const [newConfirmed, setNewConfirmed] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/memory?";
      if (activeCategory !== "all") url += `category=${activeCategory}&`;
      if (searchQuery.trim()) url += `search=${encodeURIComponent(searchQuery.trim())}&`;

      const res = await fetch(url);
      const data = await res.json();
      setMemories(data.items || []);
    } catch (err) {
      console.error("Failed to fetch memories", err);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, searchQuery]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  async function handleToggleConfirm(id: string, currentStatus: boolean) {
    try {
      const res = await fetch("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, confirmedByUser: !currentStatus }),
      });

      if (res.ok) {
        setMemories((prev) =>
          prev.map((m) => (m.id === id ? { ...m, confirmedByUser: !currentStatus } : m))
        );
      }
    } catch (err) {
      console.error("Failed to update memory confirmation", err);
    }
  }

  async function handleDeleteMemory(id: string) {
    if (!confirm("Are you sure you want to delete this memory assertion?")) return;
    try {
      const res = await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete memory", err);
    }
  }

  async function handleCreateMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey,
          value: newValue,
          category: newCategory,
          confidenceScore: newConfidence,
          confirmedByUser: newConfirmed,
        }),
      });

      if (res.ok) {
        setAddModalOpen(false);
        setNewKey("");
        setNewValue("");
        setNewCategory("identity");
        setNewConfidence(95);
        setNewConfirmed(true);
        fetchMemories();
      }
    } catch (err) {
      console.error("Failed to create memory", err);
    } finally {
      setSubmitting(false);
    }
  }

  const confirmedCount = memories.filter((m) => m.confirmedByUser).length;
  const proposedCount = memories.filter((m) => !m.confirmedByUser).length;

  return (
    <AppShell
      title="Personal Memory"
      subtitle="Layer B: Identity, Preferences & Provenance Facts"
      onQuickAdd={() => setAddModalOpen(true)}
      actionButton={
        <Button
          variant="memory"
          size="sm"
          onClick={() => setAddModalOpen(true)}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          Add Memory
        </Button>
      }
    >
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
        {/* Memory System Orientation Banner */}
        <div className="p-4 rounded-lg border border-border-subtle bg-surface/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded border border-border-subtle bg-card">
              <Brain className="w-4 h-4 text-accent-memory" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text-primary font-sans">
                Strict Personal Identity Separation
              </h3>
              <p className="text-[11px] text-text-secondary">
                Memories represent internal user assertions and identity facts, not external articles or fleeting bookmarks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{confirmedCount} Confirmed</span>
            </div>
            {proposedCount > 0 && (
              <div className="flex items-center gap-1.5 text-amber-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{proposedCount} Proposed</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {categoryFilters.map((pill) => {
              const Icon = pill.icon;
              const isActive = activeCategory === pill.value;
              return (
                <button
                  key={pill.value}
                  onClick={() => setActiveCategory(pill.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all shrink-0 ${
                    isActive
                      ? "bg-accent-memory/15 text-accent-memory border border-accent-memory/30 font-semibold"
                      : "bg-surface text-text-secondary hover:text-text-primary border border-border-subtle hover:bg-card"
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  <span>{pill.label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search personal memories..."
              className="w-full pl-8 pr-8 py-1.5 bg-surface border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus font-sans"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-text-tertiary hover:text-text-primary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Memory Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-36 rounded-lg border border-border-subtle bg-surface/50 animate-pulse p-5"
              />
            ))}
          </div>
        ) : memories.length === 0 ? (
          <EmptyState
            icon={<Brain className="w-6 h-6 text-accent-memory" />}
            badge="Layer B • Personal Memory"
            title={
              searchQuery || activeCategory !== "all"
                ? "No matching memories"
                : "No personal memories recorded yet"
            }
            description={
              searchQuery || activeCategory !== "all"
                ? "No memories match your query or selected category. Reset filters to see all recorded assertions."
                : "Personal memory tracks identity facts, preferences, work projects, and verified truths. Memories can be proposed automatically during content ingestion or manually declared by you."
            }
            action={
              <Button
                variant="memory"
                size="sm"
                onClick={() => {
                  if (searchQuery || activeCategory !== "all") {
                    setActiveCategory("all");
                    setSearchQuery("");
                  } else {
                    setAddModalOpen(true);
                  }
                }}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                {searchQuery || activeCategory !== "all" ? "Reset Filters" : "Record Your First Memory"}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {memories.map((m) => (
              <div
                key={m.id}
                className="p-5 rounded-lg border border-border-subtle bg-surface hover:border-border-focus transition-all flex flex-col justify-between shadow-sm relative group"
              >
                <div>
                  {/* Top Bar: Category & Confidence */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Badge variant="memory" size="sm">
                      {m.category}
                    </Badge>
                    <span className="text-[11px] font-mono text-text-tertiary">
                      {m.confidenceScore}% confidence
                    </span>
                  </div>

                  {/* Key */}
                  <h4 className="text-xs font-mono font-bold text-text-primary tracking-tight mt-1">
                    {m.key}
                  </h4>

                  {/* Value */}
                  <p className="text-xs text-text-secondary mt-2 leading-relaxed font-sans">
                    {m.value}
                  </p>
                </div>

                {/* Card Footer: Confirmation badge + actions */}
                <div className="mt-4 pt-3 border-t border-border-subtle/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleConfirm(m.id, m.confirmedByUser)}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                        m.confirmedByUser
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
                      }`}
                      title={m.confirmedByUser ? "Click to mark proposed" : "Click to confirm memory"}
                    >
                      {m.confirmedByUser ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Confirmed</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>Confirm</span>
                        </>
                      )}
                    </button>

                    {m.provenanceSourceId && (
                      <Link
                        href={`/library?item=${m.provenanceSourceId}`}
                        className="text-text-tertiary hover:text-accent-tasks p-1 rounded"
                        title="View source knowledge item in library"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteMemory(m.id)}
                    className="text-text-tertiary hover:text-accent-danger p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete memory"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Memory Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Personal Memory Assertion"
        description="Explicitly record a stable fact about yourself, your preferences, relationships, or ongoing projects."
      >
        <form onSubmit={handleCreateMemory} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Category *
            </label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as PersonalMemoryItem["category"])}
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary focus:outline-none focus:border-border-focus font-mono"
            >
              <option value="identity">Identity (who you are, core attributes)</option>
              <option value="preference">Preference (habits, tools, aesthetics)</option>
              <option value="project">Project (active missions & architectures)</option>
              <option value="relationship">Relationship (colleagues, family, mentors)</option>
              <option value="fact">Fact (explicit factual assertions)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Key / Topic *
            </label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g. preferred_database_engine or primary_role"
              required
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Memory Value / Statement *
            </label>
            <textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="e.g. Prefers Turso libSQL for edge computing with strict schema migrations and zero mock state."
              rows={3}
              required
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus resize-none font-sans"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
                Confidence ({newConfidence}%)
              </label>
              <input
                type="range"
                min={50}
                max={100}
                value={newConfidence}
                onChange={(e) => setNewConfidence(parseInt(e.target.value, 10))}
                className="w-full accent-accent-memory cursor-pointer"
              />
            </div>

            <div className="flex items-center pt-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-text-secondary select-none">
                <input
                  type="checkbox"
                  checked={newConfirmed}
                  onChange={(e) => setNewConfirmed(e.target.checked)}
                  className="rounded bg-card border-border-subtle text-accent-memory focus:ring-0 w-3.5 h-3.5"
                />
                <span>Confirmed by User</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="memory"
              size="sm"
              loading={submitting}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Record Memory
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
