/**
 * VYAVASTHA — Unified Ingestion Service
 *
 * Coordinates full end-to-end ingestion across all channels (Web, Telegram, API):
 * 1. Extraction via modality-specific extractors (web, text, youtube, instagram, image)
 * 2. Optional AI deep content understanding & structuring
 * 3. Atomic persistence to Turso DB via IVyavasthaRepository
 *    - Layer A: Knowledge item
 *    - Layer B: Candidate personal memories (strictly unconfirmed: confirmedByUser: false)
 *    - Layer C: Actionable intentions / tasks
 *    - Layer D: Activity audit log
 */

import { ingest } from "./pipeline";
import {
  getRepository,
  type IVyavasthaRepository,
  type KnowledgeItem,
  type PersonalMemoryItem,
  type TaskItem,
} from "../db/repository";
import { AiService } from "../ai/service";
import { logger } from "../lib/logger";
import type { IngestionRequest } from "./types";
import type { IngestionProcessResult } from "../bot/types";

export interface UnifiedIngestionOutput extends IngestionProcessResult {
  knowledgeItem: KnowledgeItem;
  persistedMemories: PersonalMemoryItem[];
  persistedTasks: TaskItem[];
}

export async function processUnifiedIngestion(
  request: IngestionRequest,
  customRepo?: IVyavasthaRepository
): Promise<UnifiedIngestionOutput> {
  const repo = customRepo || getRepository();
  const aiService = new AiService();

  // 1. Execute extraction and AI understanding
  const result = await ingest(request, {
    understandingService: {
      understand: async (extraction) => {
        try {
          return await aiService.understandContent({
            text: extraction.rawText,
            url: extraction.sourceUrl,
            mediaType: extraction.mediaType,
            metadata: extraction.metadata,
          });
        } catch (err) {
          logger.warn("[INGESTION] AI understanding encountered an error or rate limit", {
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      },
    },
  });

  const extraction = result.extraction;
  const understanding = result.understanding as
    | {
        title?: string;
        summary?: string;
        tags?: string[];
        candidatePersonalMemories?: Array<{
          key: string;
          value: string;
          category?: "preference" | "identity" | "project" | "relationship" | "fact";
          confidenceScore?: number;
        }>;
        actionableTasks?: Array<{
          title: string;
          context?: string;
          priority?: "low" | "medium" | "high";
        }>;
      }
    | null
    | undefined;

  // Resolve metadata fields
  const title = (
    understanding?.title?.trim() ||
    extraction.title?.trim() ||
    "Captured Knowledge"
  ).slice(0, 200);

  const summary = (
    understanding?.summary?.trim() ||
    extraction.rawText?.slice(0, 400)?.trim() ||
    title
  );

  const tags =
    Array.isArray(understanding?.tags) && understanding.tags.length > 0
      ? understanding.tags
      : [extraction.mediaType, request.source];

  // 2. Persist knowledge item to Turso (Layer A)
  let knowledgeItem: KnowledgeItem;
  try {
    knowledgeItem = await repo.createKnowledge({
      title,
      summary,
      rawContent: extraction.rawText,
      mediaType: (extraction.mediaType as KnowledgeItem["mediaType"]) || "note",
      sourceUrl: extraction.sourceUrl,
      tags,
    });
  } catch (err) {
    logger.error("[INGESTION] Failed to persist knowledge item to repository", err);
    throw err;
  }

  const persistedMemories: PersonalMemoryItem[] = [];
  const persistedTasks: TaskItem[] = [];

  // 3. Persist candidate personal memories (Layer B - CRITICAL MEMORY RULE)
  if (Array.isArray(understanding?.candidatePersonalMemories)) {
    for (const cand of understanding.candidatePersonalMemories) {
      if (cand.key && cand.value) {
        try {
          const mem = await repo.createMemory({
            key: cand.key,
            value: cand.value,
            category: cand.category || "fact",
            provenanceSourceId: knowledgeItem.id,
            confidenceScore:
              typeof cand.confidenceScore === "number" ? cand.confidenceScore : 0.7,
            confirmedByUser: false, // Rule: never auto-confirm
          });
          persistedMemories.push(mem);
        } catch (memErr) {
          logger.warn("[INGESTION] Could not save candidate memory", {
            error: String(memErr),
          });
        }
      }
    }
  }

  // 4. Persist actionable tasks (Layer C)
  if (Array.isArray(understanding?.actionableTasks)) {
    for (const task of understanding.actionableTasks) {
      if (task.title) {
        try {
          const t = await repo.createTask({
            title: task.title,
            description: task.context || `Derived from: ${knowledgeItem.title}`,
            status: "pending",
            sourceKnowledgeId: knowledgeItem.id,
          });
          persistedTasks.push(t);
        } catch (taskErr) {
          logger.warn("[INGESTION] Could not save derived task", {
            error: String(taskErr),
          });
        }
      }
    }
  }

  // 5. Audit Log (Layer D)
  try {
    await repo.logActivity({
      channel: request.source === "telegram" ? "telegram" : "web",
      eventType: "content_ingested",
      status: "success",
      metadata: {
        knowledgeId: knowledgeItem.id,
        title: knowledgeItem.title,
        mediaType: knowledgeItem.mediaType,
        memoriesCount: persistedMemories.length,
        tasksCount: persistedTasks.length,
      },
    });
  } catch (logErr) {
    logger.debug("[INGESTION] Non-critical activity log warning", {
      error: String(logErr),
    });
  }

  return {
    id: knowledgeItem.id,
    title: knowledgeItem.title,
    summary: knowledgeItem.summary,
    mediaType: knowledgeItem.mediaType,
    sourceUrl: knowledgeItem.sourceUrl,
    tags: knowledgeItem.tags,
    tasks: persistedTasks.map((t) => ({
      title: t.title,
      description: t.description,
    })),
    memories: persistedMemories.map((m) => ({
      key: m.key,
      value: m.value,
      category: m.category,
    })),
    warning: extraction.warning,
    knowledgeItem,
    persistedMemories,
    persistedTasks,
  };
}
