"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  BookOpen,
  Brain,
  CheckSquare,
  MessageSquare,
  FileText,
  X,
  ArrowRight,
} from "lucide-react";
import { Badge } from "../ui/badge";

interface SearchResults {
  knowledge: Array<{ id: string; title: string; summary: string; mediaType: string }>;
  memories: Array<{ id: string; key: string; value: string; category: string }>;
  tasks: Array<{ id: string; title: string; status: string }>;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({
    knowledge: [],
    memories: [],
    tasks: [],
  });

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ knowledge: [], memories: [], tasks: [] });
      return;
    }
    setLoading(true);
    try {
      const [kRes, mRes, tRes] = await Promise.all([
        fetch(`/api/knowledge?search=${encodeURIComponent(q)}&limit=4`).then((r) => r.json()),
        fetch(`/api/memory?search=${encodeURIComponent(q)}`).then((r) => r.json()),
        fetch(`/api/tasks?search=${encodeURIComponent(q)}`).then((r) => r.json()),
      ]);
      setResults({
        knowledge: kRes.items || [],
        memories: mRes.items || [],
        tasks: tRes.items || [],
      });
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open handled outside or can toggle
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function navigateTo(path: string) {
    onClose();
    router.push(path);
  }

  const hasResults =
    results.knowledge.length > 0 ||
    results.memories.length > 0 ||
    results.tasks.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-canvas/80 backdrop-blur-sm animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xl rounded-lg border border-border-subtle bg-surface shadow-2xl z-10 overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-border-subtle bg-card/60">
          <Search className="w-4 h-4 text-text-tertiary mr-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search knowledge, memories, tasks or navigate..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 text-text-tertiary hover:text-text-primary rounded mr-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[10px] font-mono text-text-tertiary border border-border-subtle px-1.5 py-0.5 rounded bg-surface">
            ESC
          </span>
        </div>

        {/* Search Results / Quick Navigation */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {loading && (
            <div className="py-8 text-center text-xs text-text-tertiary font-mono">
              Searching personal operating system...
            </div>
          )}

          {/* Quick Navigation Commands */}
          {!query && (
            <div>
              <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                Quick Navigation
              </div>
              <div className="space-y-0.5">
                {[
                  { name: "Ask Chat / Personal AI", path: "/chat", icon: MessageSquare, badge: "Doorway" },
                  { name: "Browse Knowledge Library", path: "/library", icon: BookOpen, badge: "Layer A" },
                  { name: "Review Personal Memory", path: "/memory", icon: Brain, badge: "Layer B" },
                  { name: "View Active Tasks & Intentions", path: "/tasks", icon: CheckSquare, badge: "Layer C" },
                  { name: "Weekly Reflective Review", path: "/review", icon: FileText, badge: "Synthesis" },
                ].map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.path}
                      onClick={() => navigateTo(cmd.path)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-card transition-colors text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-primary" />
                        <span>{cmd.name}</span>
                      </div>
                      <Badge variant="neutral" size="sm">{cmd.badge}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dynamic Search Results */}
          {query && !loading && !hasResults && (
            <div className="py-8 text-center text-xs text-text-secondary">
              No matching knowledge items, memories, or tasks found for &quot;{query}&quot;.
            </div>
          )}

          {query && !loading && (
            <>
              {results.knowledge.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-accent-knowledge">
                    Knowledge ({results.knowledge.length})
                  </div>
                  <div className="space-y-1">
                    {results.knowledge.map((k) => (
                      <button
                        key={k.id}
                        onClick={() => navigateTo(`/library?item=${k.id}`)}
                        className="w-full flex items-start gap-3 p-2 rounded text-left hover:bg-card transition-colors group"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-accent-knowledge mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-text-primary truncate group-hover:text-white">
                            {k.title}
                          </div>
                          <div className="text-[11px] text-text-secondary line-clamp-1">
                            {k.summary}
                          </div>
                        </div>
                        <Badge variant="knowledge" size="sm">{k.mediaType}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.memories.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-accent-memory">
                    Memory ({results.memories.length})
                  </div>
                  <div className="space-y-1">
                    {results.memories.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => navigateTo(`/memory`)}
                        className="w-full flex items-start gap-3 p-2 rounded text-left hover:bg-card transition-colors group"
                      >
                        <Brain className="w-3.5 h-3.5 text-accent-memory mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono font-medium text-text-primary truncate">
                            {m.key}
                          </div>
                          <div className="text-[11px] text-text-secondary line-clamp-1">
                            {m.value}
                          </div>
                        </div>
                        <Badge variant="memory" size="sm">{m.category}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.tasks.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-accent-tasks">
                    Tasks ({results.tasks.length})
                  </div>
                  <div className="space-y-1">
                    {results.tasks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => navigateTo(`/tasks`)}
                        className="w-full flex items-center justify-between p-2 rounded text-left hover:bg-card transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CheckSquare className="w-3.5 h-3.5 text-accent-tasks shrink-0" />
                          <span className="text-xs text-text-primary truncate">{t.title}</span>
                        </div>
                        <Badge variant="tasks" size="sm">{t.status}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-border-subtle bg-card/40 flex items-center justify-between text-[11px] text-text-tertiary font-mono">
          <span>Navigate with ↵ Enter</span>
          <span className="flex items-center gap-1">
            <span>Obsidian Workshop Palette</span>
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
