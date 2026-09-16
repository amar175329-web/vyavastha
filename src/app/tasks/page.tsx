"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Plus,
  Search,
  ExternalLink,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { AppShell } from "@/components/navigation/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";

interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  sourceKnowledgeId?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Quick Inline Add Task input
  const [quickTitle, setQuickTitle] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);

  // Detailed Modal Add Task state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalDesc, setModalDesc] = useState("");
  const [modalDueDate, setModalDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/tasks?";
      if (statusFilter !== "all") url += `status=${statusFilter}&`;
      if (searchQuery.trim()) url += `search=${encodeURIComponent(searchQuery.trim())}&`;

      const res = await fetch(url);
      const data = await res.json();
      setTasks(data.items || []);
    } catch (err) {
      console.error("Failed to fetch tasks", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickTitle.trim() || quickLoading) return;

    setQuickLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: quickTitle }),
      });

      if (res.ok) {
        setQuickTitle("");
        fetchTasks();
      }
    } catch (err) {
      console.error("Failed to create quick task", err);
    } finally {
      setQuickLoading(false);
    }
  }

  async function handleModalCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!modalTitle.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: modalTitle,
          description: modalDesc || undefined,
          dueDate: modalDueDate || undefined,
          status: "pending",
        }),
      });

      if (res.ok) {
        setAddModalOpen(false);
        setModalTitle("");
        setModalDesc("");
        setModalDueDate("");
        fetchTasks();
      }
    } catch (err) {
      console.error("Failed to create task", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, newStatus: TaskItem["status"]) {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (res.ok) {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
        );
      }
    } catch (err) {
      console.error("Failed to update task status", err);
    }
  }

  async function handleDeleteTask(id: string) {
    try {
      const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete task", err);
    }
  }

  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  function renderTaskRow(task: TaskItem) {
    const isExtracted = Boolean(task.sourceKnowledgeId);
    const isCompleted = task.status === "completed";

    return (
      <div
        key={task.id}
        className={`group p-3.5 rounded-lg border border-border-subtle bg-surface hover:bg-card hover:border-border-focus transition-all flex items-start gap-3.5 shadow-sm ${
          isCompleted ? "opacity-60" : ""
        }`}
      >
        {/* Status Checkbox Button */}
        <button
          onClick={() =>
            handleStatusChange(
              task.id,
              isCompleted ? "pending" : "completed"
            )
          }
          className="mt-0.5 text-text-tertiary hover:text-accent-tasks transition-colors shrink-0"
          title={isCompleted ? "Mark as pending" : "Mark as completed"}
        >
          {isCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : task.status === "in_progress" ? (
            <div className="w-4 h-4 rounded-full border-2 border-accent-tasks border-t-transparent animate-spin" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>

        {/* Task Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-medium ${
                isCompleted
                  ? "line-through text-text-tertiary"
                  : "text-text-primary"
              }`}
            >
              {task.title}
            </span>

            {/* Extracted vs Manual pill */}
            {isExtracted ? (
              <Badge variant="knowledge" size="sm">
                Extracted Intention
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                Direct
              </Badge>
            )}

            {/* Due Date */}
            {task.dueDate && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-text-tertiary">
                <Calendar className="w-3 h-3" />
                <span>{new Date(task.dueDate).toLocaleDateString()}</span>
              </span>
            )}
          </div>

          {task.description && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Provenance reference */}
          {task.sourceKnowledgeId && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-text-tertiary">
              <span>Source:</span>
              <Link
                href={`/library?item=${task.sourceKnowledgeId}`}
                className="inline-flex items-center gap-1 text-accent-knowledge hover:underline"
              >
                <span>{task.sourceKnowledgeId}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {task.status !== "in_progress" && !isCompleted && (
            <button
              onClick={() => handleStatusChange(task.id, "in_progress")}
              className="text-[11px] font-mono text-text-tertiary hover:text-accent-tasks px-2 py-1 rounded bg-card border border-border-subtle"
            >
              Start
            </button>
          )}
          {task.status === "in_progress" && (
            <button
              onClick={() => handleStatusChange(task.id, "pending")}
              className="text-[11px] font-mono text-text-tertiary hover:text-text-primary px-2 py-1 rounded bg-card border border-border-subtle"
            >
              Pause
            </button>
          )}
          <button
            onClick={() => handleDeleteTask(task.id)}
            className="p-1 text-text-tertiary hover:text-accent-danger rounded"
            title="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title="Tasks & Intentions"
      subtitle="Layer C: Actionable Intentions & Extracted Todos"
      onQuickAdd={() => setAddModalOpen(true)}
      actionButton={
        <Button
          variant="tasks"
          size="sm"
          onClick={() => setAddModalOpen(true)}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          New Task
        </Button>
      }
    >
      <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-6">
        {/* Intention Ingestion Banner */}
        <div className="p-4 rounded-lg border border-border-subtle bg-surface/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded border border-border-subtle bg-card">
              <CheckSquare className="w-4 h-4 text-accent-tasks" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text-primary font-sans">
                Intentions Require Explicit Human Execution
              </h3>
              <p className="text-[11px] text-text-secondary">
                Actions extracted from your saved articles and YouTube notes remain intentions until you explicitly mark them done.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-text-tertiary">
              {pendingTasks.length + inProgressTasks.length} Active
            </span>
            <span>•</span>
            <span className="text-emerald-400">
              {completedTasks.length} Completed
            </span>
          </div>
        </div>

        {/* Quick Task Input Form */}
        <form onSubmit={handleQuickAdd} className="relative">
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Quick capture a new intention or task... (Press Enter to add)"
            className="w-full pl-4 pr-24 py-2.5 bg-surface border border-border-subtle rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus font-sans shadow-sm"
          />
          <div className="absolute right-2 top-2">
            <Button
              type="submit"
              variant="tasks"
              size="sm"
              disabled={!quickTitle.trim()}
              loading={quickLoading}
            >
              Add Task
            </Button>
          </div>
        </form>

        {/* Filter Pills & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { label: "All Statuses", value: "all" },
              { label: `Pending (${pendingTasks.length})`, value: "pending" },
              { label: `In Progress (${inProgressTasks.length})`, value: "in_progress" },
              { label: `Completed (${completedTasks.length})`, value: "completed" },
            ].map((pill) => {
              const isActive = statusFilter === pill.value;
              return (
                <button
                  key={pill.value}
                  onClick={() => setStatusFilter(pill.value)}
                  className={`px-3 py-1.5 rounded text-xs font-mono transition-all shrink-0 ${
                    isActive
                      ? "bg-accent-tasks/15 text-accent-tasks border border-accent-tasks/30 font-semibold"
                      : "bg-surface text-text-secondary hover:text-text-primary border border-border-subtle hover:bg-card"
                  }`}
                >
                  {pill.label}
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
              placeholder="Search tasks..."
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

        {/* Task List Content */}
        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 rounded-lg border border-border-subtle bg-surface/50 animate-pulse"
              />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<CheckSquare className="w-6 h-6 text-accent-tasks" />}
            badge="Layer C • Intentions & Tasks"
            title={
              searchQuery || statusFilter !== "all"
                ? "No matching tasks"
                : "No active intentions or tasks"
            }
            description={
              searchQuery || statusFilter !== "all"
                ? "No tasks match your search or filter criteria. Try resetting search or select All Statuses."
                : "Layer C tracks actionable items and intentions extracted from your ingested media. You can also capture tasks manually above."
            }
            action={
              <Button
                variant="tasks"
                size="sm"
                onClick={() => {
                  if (searchQuery || statusFilter !== "all") {
                    setStatusFilter("all");
                    setSearchQuery("");
                  } else {
                    setAddModalOpen(true);
                  }
                }}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                {searchQuery || statusFilter !== "all" ? "Reset Filters" : "Create First Task"}
              </Button>
            }
          />
        ) : statusFilter !== "all" ? (
          <div className="space-y-2">
            {tasks.map((task) => renderTaskRow(task))}
          </div>
        ) : (
          /* Grouped by Status: In Progress -> Pending -> Completed */
          <div className="space-y-6">
            {inProgressTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 text-[11px] font-mono uppercase tracking-wider text-accent-tasks font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>In Progress ({inProgressTasks.length})</span>
                </div>
                <div className="space-y-2">
                  {inProgressTasks.map((task) => renderTaskRow(task))}
                </div>
              </div>
            )}

            {pendingTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
                  <Circle className="w-3.5 h-3.5" />
                  <span>Pending Intentions ({pendingTasks.length})</span>
                </div>
                <div className="space-y-2">
                  {pendingTasks.map((task) => renderTaskRow(task))}
                </div>
              </div>
            )}

            {completedTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 text-[11px] font-mono uppercase tracking-wider text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Completed ({completedTasks.length})</span>
                </div>
                <div className="space-y-2">
                  {completedTasks.map((task) => renderTaskRow(task))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detailed Add Task Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Create New Task or Intention"
        description="Add an actionable to-do to Layer C. All tasks require explicit user confirmation to mark complete."
      >
        <form onSubmit={handleModalCreate} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Task Title *
            </label>
            <input
              type="text"
              value={modalTitle}
              onChange={(e) => setModalTitle(e.target.value)}
              placeholder="e.g. Read the Raft consensus paper and draft synthesis"
              required
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus font-sans font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Description / Notes (optional)
            </label>
            <textarea
              value={modalDesc}
              onChange={(e) => setModalDesc(e.target.value)}
              placeholder="Additional context, steps, or prerequisites..."
              rows={3}
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus resize-none font-sans"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
              Due Date (optional)
            </label>
            <input
              type="date"
              value={modalDueDate}
              onChange={(e) => setModalDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-card border border-border-subtle rounded text-xs text-text-primary focus:outline-none focus:border-border-focus font-mono"
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
              variant="tasks"
              size="sm"
              loading={submitting}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Create Task
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
