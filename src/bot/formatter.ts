/**
 * VYAVASTHA — Telegram Response Formatter
 *
 * Formats responses in clean, distraction-free, human-authored Markdown.
 * Provides consistent presentation for knowledge ingestion, commands, and alerts.
 */

import type { TaskItem, PersonalMemoryItem, WeeklyReviewSummary } from "../db/repository";
import type { IngestionProcessResult } from "./types";

/**
 * Formats the confirmation response when content is ingested into Knowledge.
 */
export function formatKnowledgeSaved(result: IngestionProcessResult): string {
  const lines: string[] = ["✦ **Saved to Knowledge**", ""];

  if (result.title) {
    lines.push(`📌 **${result.title}**`);
  }

  const badges: string[] = [];
  if (result.mediaType) {
    badges.push(`Type: \`${result.mediaType}\``);
  }
  if (result.tags && result.tags.length > 0) {
    badges.push(`Tags: ${result.tags.map((t) => `#${t}`).join(" ")}`);
  }
  if (badges.length > 0) {
    lines.push(badges.join(" · "));
  }

  if (result.sourceUrl) {
    lines.push(`🔗 [Source Link](${result.sourceUrl})`);
  }

  if (result.summary) {
    lines.push("");
    lines.push(result.summary.trim());
  }

  if (result.tasks && result.tasks.length > 0) {
    lines.push("");
    lines.push(`✅ **Extracted Tasks (${result.tasks.length})**`);
    for (const task of result.tasks) {
      lines.push(`• [ ] ${task.title}${task.description ? ` — _${task.description}_` : ""}`);
    }
  }

  if (result.memories && result.memories.length > 0) {
    lines.push("");
    lines.push(`🧠 **Proposed Candidate Memories (${result.memories.length})**`);
    for (const memory of result.memories) {
      const categoryTag = memory.category ? `[${memory.category}] ` : "";
      lines.push(`• ${categoryTag}${memory.key}: "${memory.value}"`);
    }
  }

  if (result.warning) {
    lines.push("");
    lines.push(`⚠️ _Note: ${result.warning}_`);
  }

  return lines.join("\n");
}

/**
 * Formats the greeting and operational status for the /start command.
 */
export function formatStartMessage(): string {
  return [
    "✦ **VYAVASTHA OS** · Personal Cognitive Operating System",
    "",
    "Welcome back. System is active and listening on your personal ingestion channel.",
    "",
    "**Quick Navigation:**",
    "• `/status` — System health, database connection & disk safety",
    "• `/tasks` — Pending intentions & actionable items",
    "• `/memory` — Confirmed personal memory & preferences",
    "• `/review` — Weekly activity & ingestion recap",
    "",
    "**Input Channels:**",
    "Send any web article, YouTube video, Instagram reel/post, photo, voice note, document, or plain text note. Vyavastha will normalize, index, and organize it automatically.",
  ].join("\n");
}

/**
 * Formats system status diagnostics for the /status command.
 */
export function formatStatusMessage(info: {
  dbConnected: boolean;
  dbLatencyMs: number;
  dbName: string;
  diskHealthy: boolean;
  availableMb: number;
  requiredMb: number;
  knowledgeCount?: number;
  tasksCount?: number;
  memoriesCount?: number;
}): string {
  const dbStatus = info.dbConnected
    ? `Connected (\`${info.dbLatencyMs}ms\`)`
    : "⚠️ Unreachable";

  const diskStatus = info.diskHealthy
    ? `Healthy (\`${info.availableMb} MB\` available / min \`${info.requiredMb} MB\`)`
    : `⚠️ Low Headroom (\`${info.availableMb} MB\` remaining)`;

  const countsLine = [
    `Knowledge: \`${info.knowledgeCount ?? "Ready"}\``,
    `Tasks: \`${info.tasksCount ?? "Ready"}\``,
    `Memories: \`${info.memoriesCount ?? "Ready"}\``,
  ].join(" · ");

  return [
    "✦ **Vyavastha OS · System Health**",
    "",
    `• **Turso Database**: ${dbStatus}`,
    `• **Disk Headroom**: ${diskStatus}`,
    `• **Repository**: ${countsLine}`,
    "• **Telegram Ingestion**: Active (Thin Entry Layer)",
  ].join("\n");
}

/**
 * Formats recent pending tasks for the /tasks command.
 */
export function formatTasksMessage(tasks: TaskItem[]): string {
  if (!tasks || tasks.length === 0) {
    return [
      "✦ **Pending Tasks**",
      "",
      "No pending tasks found. Everything is caught up!",
    ].join("\n");
  }

  const lines: string[] = [
    `✦ **Pending Tasks (${tasks.length})**`,
    "",
  ];

  for (const task of tasks) {
    const due = task.dueDate ? ` (due ${task.dueDate.toISOString().slice(0, 10)})` : "";
    lines.push(`• [ ] **${task.title}**${due}`);
    if (task.description) {
      lines.push(`  _${task.description}_`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats confirmed personal memories for the /memory command.
 */
export function formatMemoriesMessage(memories: PersonalMemoryItem[]): string {
  if (!memories || memories.length === 0) {
    return [
      "✦ **Personal Memory**",
      "",
      "No confirmed personal memories recorded yet.",
    ].join("\n");
  }

  const lines: string[] = [
    `✦ **Confirmed Personal Memories (${memories.length})**`,
    "",
  ];

  const grouped: Record<string, PersonalMemoryItem[]> = {};
  for (const item of memories) {
    const cat = item.category || "fact";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  for (const [category, items] of Object.entries(grouped)) {
    lines.push(`**${category.toUpperCase()}**`);
    for (const mem of items) {
      lines.push(`• ${mem.key}: _${mem.value}_`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Formats the weekly activity recap for the /review command.
 */
export function formatWeeklyReviewMessage(review: WeeklyReviewSummary): string {
  const start = review.periodStart.toISOString().slice(0, 10);
  const end = review.periodEnd.toISOString().slice(0, 10);

  return [
    "✦ **Weekly Activity Review**",
    `_${start} — ${end}_`,
    "",
    `📥 **Items Ingested**: \`${review.itemsIngested}\``,
    `📝 **Tasks Created**: \`${review.tasksCreated}\``,
    `✅ **Tasks Completed**: \`${review.tasksCompleted}\``,
    `🧠 **Memories Formed**: \`${review.memoriesFormed}\``,
  ].join("\n");
}
