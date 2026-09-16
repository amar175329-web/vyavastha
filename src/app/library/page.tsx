"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Plus,
  Search,
  ExternalLink,
  Video,
  FileText,
  Bookmark,
  Camera,
  StickyNote,
  Trash2,
  Calendar,
  Tag,
  CheckSquare,
  Brain,
  X,
} from "lucide-react";
import { AppShell } from "@/components/navigation/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SlideOver } from "@/components/ui/slide-over";
import { EmptyState } from "@/components/ui/empty-state";

interface KnowledgeItem {
  id: string;
  sourceUrl?: string;
  title: string;
  summary: string;
  rawContent?: string;
  mediaType: "youtube" | "instagram" | "article" | "audio" | "document" | "note";
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ItemDetailResponse {
  item: KnowledgeItem;
  relatedMemories: Array<{ id: string; key: string; value: string; category: string }>;
  relatedTasks: Array<{ id: string; title: string; status: string }>;
}

const filterPills: Array<{ label: string; value: string; icon?: React.ComponentType<{ className?: string }> }> = [
  { label: "All Items", value: "all" },
  { label: "Articles", value: "article", icon: FileText },
  { label: "YouTube", value: "youtube", icon: Video },
  { label: "Notes", value: "note", icon: StickyNote },
  { label: "Documents", value: "document", icon: Bookmark },
  { label: "Instagram", value: "instagram", icon: Camera },
];

function LibraryContent() {
  const searchParams = useSearchParams();
  const initialItemId = searchParams.get("item");

  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Slide-over detail drawer state
  const [selectedItem, setSelectedItem] = useState<ItemDetailResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Add Knowledge modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newType, setNewType] = useState<KnowledgeItem["mediaType"]>("article");
  const [newUrl, setNewUrl] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/knowledge?";
      if (activeFilter !== "all") url += `type=${activeFilter}&`;
      if (searchQuery.trim()) url += `search=${encodeURIComponent(searchQuery.trim())}&`;

      const res = await fetch(url);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error("Failed to fetch knowledge items", err);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, searchQuery]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Load specific item if query param was passed
  useEffect(() => {
    if (initialItemId) {
      loadItemDetail(initialItemId);
    }
  }, [initialItemId]);

  async function loadItemDetail(id: string) {
    setDrawerLoading(true);
    try {
      const res = await fetch(`/api/knowledge/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedItem(data);
      }
    } catch (err) {
      console.error("Failed to load item detail", err);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function handleCreateKnowledge(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newSummary.trim()) return;

    setSubmitting(true);
    try {
      const tagsArray = newTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          summary: newSummary,
          mediaType: newType,
          sourceUrl: newUrl || undefined,
          rawContent: newContent || undefined,
          tags: tagsArray,
        }),
      });

      if (res.ok) {
        setAddModalOpen(false);
        // Reset form
        setNewTitle("");
        setNewSummary("");
        setNewUrl("");
        setNewContent("");
        setNewTags("");
        fetchItems();
      }
    } catch (err) {
      console.error("Failed to create knowledge item", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteItem(id: string) {
    if (!confirm("Are you sure you want to remove this knowledge item?")) return;
    try {
      const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedItem(null);
        fetchItems();
      }
    } catch (err) {
      console.error("Failed to delete item", err);
    }
  }

  function getMediaIcon(type: KnowledgeItem["mediaType"]) {
    switch (type) {
      case "youtube":
        return <Video className="w-3.5 h-3.5 text-red-400" />;
      case "article":
        return <FileText className="w-3.5 h-3.5 text-accent-knowledge" />;
      case "instagram":
        return <Camera className="w-3.5 h-3.5 text-pink-400" />;
      case "note":
        return <StickyNote className="w-3.5 h-3.5 text-amber-300" />;
      case "document":
        return <Bookmark className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <BookOpen className="w-3.5 h-3.5 text-text-tertiary" />;
    }
  }

  function timeAgo(dateStr: string) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  return (
    <AppShell
      title="Library"
      subtitle="Layer A: Saved Knowledge & External Artifacts"
      onQuickAdd={() => setAddModalOpen(true)}
      actionButton={
        <Button
          variant="knowledge"
          size="sm"
          onClick={() => setAddModalOpen(true)}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          Add Knowledge
        </Button>
      }
    >
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
        {/* Filter Bar & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {filterPills.map((pill) => {
              const Icon = pill.icon;
              const isActive = activeFilter === pill.value;
              return (
                <button
                  key={pill.value}
                  onClick={() => setActiveFilter(pill.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all shrink-0 ${
                    isActive
                      ? "bg-accent-knowledge/15 text-accent-knowledge border border-accent-knowledge/30 font-semibold"
                      : "bg-surface text-text-secondary hover:text-text-primary border border-border-subtle hover:bg-card"
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  <span>{pill.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search library..."
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

        {/* Content Area */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-44 rounded-lg border border-border-subtle bg-surface/50 animate-pulse p-5"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-6 h-6 text-accent-knowledge" />}
            badge="Layer A • Saved Knowledge"
            title={
              searchQuery || activeFilter !== "all"
                ? "No matching knowledge items"
                : "No knowledge items captured yet"
            }
            description={
              searchQuery || activeFilter !== "all"
                ? "No saved articles, YouTube links, or notes match your current filters. Try resetting search or select All Items."
                : "Your personal library holds external articles, YouTube transcripts, documents, Instagram posts, and notes. Capture your first piece of knowledge to begin."
            }
            action={
              <Button
                variant="knowledge"
                size="sm"
                onClick={() => {
                  if (searchQuery || activeFilter !== "all") {
                    setActiveFilter("all");
                    setSearchQuery("");
                  } else {
                    setAddModalOpen(true);
                  }
                }}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                {searchQuery || activeFilter !== "all" ? "Reset Filters" : "Add Your First Note or URL"}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => loadItemDetail(item.id)}
                className="group p-5 rounded-lg border border-border-subtle bg-surface hover:bg-card hover:border-border-focus transition-all cursor-pointer flex flex-col justify-between shadow-sm relative overflow-hidden"
              >
                <div>
                  {/* Card Header: Media Type & Time */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      {getMediaIcon(item.mediaType)}
                      <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                        {item.mediaType}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-text-tertiary">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>

                  {/* Title */}
                  <h4 className="text-sm font-semibold text-text-primary group-hover:text-white transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </h4>

                  {/* Summary */}
                  <p className="text-xs text-text-secondary mt-2 line-clamp-3 leading-relaxed">
                    {item.summary}
                  </p>
                </div>

                {/* Tags & Metadata */}
                <div className="mt-4 pt-3 border-t border-border-subtle/60 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1 items-center max-w-[80%] overflow-hidden">
                    {item.tags.length > 0 ? (
                      item.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="neutral" size="sm">
                          #{tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[10px] font-mono text-text-tertiary">No tags</span>
                    )}
                    {item.tags.length > 3 && (
                      <span className="text-[10px] font-mono text-text-tertiary">
                        +{item.tags.length - 3}
                      </span>
                    )}
                  </div>

                  {item.sourceUrl && (
                    <ExternalLink className="w-3 h-3 text-text-tertiary group-hover:text-text-secondary shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Item Detail Slide-Over Drawer */}
      <SlideOver
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.item.title || "Knowledge Detail"}
        subtitle={selectedItem ? `${selectedItem.item.mediaType.toUpperCase()} • Captured ${new Date(selectedItem.item.createdAt).toLocaleDateString()}` : ""}
        width="lg"
      >
        {selectedItem && (
          <div className="space-y-6">
            {/* Header info & Actions */}
            <div className="flex items-center justify-between">
              <Badge variant="knowledge" size="md">
                {selectedItem.item.mediaType.toUpperCase()}
              </Badge>
              <button
                onClick={() => handleDeleteItem(selectedItem.item.id)}
                className="text-text-tertiary hover:text-accent-danger p-1.5 rounded hover:bg-card transition-colors flex items-center gap-1 text-xs"
                title="Delete item"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>

            {/* Source URL if available */}
            {selectedItem.item.sourceUrl && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
                  Source Provenance URL
                </div>
                <a
                  href={selectedItem.item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-tasks hover:underline font-mono break-all"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>{selectedItem.item.sourceUrl}</span>
                </a>
              </div>
            )}

            {/* Summary */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
                Executive Synthesis
              </div>
              <div className="p-3.5 rounded-lg border border-border-subtle bg-card text-xs text-text-primary leading-relaxed">
                {selectedItem.item.summary}
              </div>
            </div>

            {/* Raw Content if available */}
            {selectedItem.item.rawContent && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
                  Full Captured Text / Transcript
                </div>
                <div className="p-3.5 rounded-lg border border-border-subtle bg-card/60 text-xs text-text-secondary leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap font-sans">
                  {selectedItem.item.rawContent}
                </div>
              </div>
            )}

            {/* Tags */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary mb-1.5">
                Extracted Topics & Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.item.tags.length > 0 ? (
                  selectedItem.item.tags.map((tag) => (
                    <Badge key={tag} variant="neutral" size="sm">
                      #{tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-text-tertiary">No tags extracted</span>
                )}
              </div>
            </div>

            {/* Related Extracted Memories */}
            {selectedItem.relatedMemories.length > 0 && (
              <div className="pt-4 border-t border-border-subtle">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-accent-memory mb-2">
                  <Brain className="w-3.5 h-3.5" />
                  <span>Derived Memories ({selectedItem.relatedMemories.length})</span>
                </div>
                <div className="space-y-1.5">
                  {selectedItem.relatedMemories.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded border border-border-subtle bg-card text-xs"
                    >
                      <div className="font-mono font-medium text-text-primary">{m.key}</div>
                      <div className="text-text-secondary text-[11px] mt-0.5">{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Tasks */}
            {selectedItem.relatedTasks.length > 0 && (
              <div className="pt-4 border-t border-border-subtle">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-accent-tasks mb-2">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Extracted Intentions ({selectedItem.relatedTasks.length})</span>
                </div>
                <div className="space-y-1.5">
                  {selectedItem.relatedTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded border border-border-subtle bg-card text-xs flex items-center justify-between"
                    >
                      <span className="text-text-primary">{t.title}</span>
                      <Badge variant="tasks" size="sm">
                        {t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ID & Metadata */}
            <div className="pt-4 border-t border-border-subtle text-[11px] font-mono text-text-tertiary">
              Item ID: <span className="text-text-secondary">{selectedItem.item.id}</span>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Add Knowledge Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Knowledge Item"
        description="Ingest an external article, YouTube video, document, or save a personal note into Layer A."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateKnowledge} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
                Media Format
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as KnowledgeItem["mediaType"])}
                className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary focus:outline-none focus:border-border-focus font-mono"
              >
                <option value="article">Article / Web Page</option>
                <option value="youtube">YouTube Video</option>
                <option value="note">Personal Note</option>
                <option value="document">Document / PDF</option>
                <option value="instagram">Instagram Post</option>
                <option value="audio">Audio / Podcast</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
                Source URL (optional)
              </label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/..."
                className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Title *
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Distributed Consensus in Modern Databases"
              required
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus font-sans font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Executive Summary *
            </label>
            <textarea
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              placeholder="Synthesize the core insights, arguments, or takeaways..."
              rows={3}
              required
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus resize-none font-sans"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Raw Content / Notes (optional)
            </label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Paste raw markdown, article excerpts, transcript, or personal scratchpad notes..."
              rows={4}
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus resize-none font-sans"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="architecture, databases, systems"
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus font-mono"
            />
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
              variant="knowledge"
              size="sm"
              loading={submitting}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Save to Library
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-canvas">
          <div className="w-5 h-5 border-2 border-text-tertiary border-t-accent-knowledge rounded-full animate-spin" />
        </div>
      }
    >
      <LibraryContent />
    </Suspense>
  );
}
