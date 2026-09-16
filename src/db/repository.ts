/**
 * VYAVASTHA — Repository Layer Persistence
 *
 * Implements IVyavasthaRepository using Drizzle ORM and Turso libSQL.
 * Handles the four foundational layers:
 * - Layer A: Saved Knowledge (knowledge_items)
 * - Layer B: Personal Memory (personal_memory_items)
 * - Layer C: Tasks / Intentions (task_items)
 * - Layer D: Activity History (activity_logs)
 */

import { eq, desc, and, gte, lte, like, or, count } from "drizzle-orm";
import { getDb } from "./client";
import {
  knowledgeItems,
  personalMemoryItems,
  taskItems,
  activityLogs,
} from "./schema";

export interface KnowledgeItem {
  id: string;
  sourceUrl?: string;
  title: string;
  summary: string;
  rawContent?: string;
  mediaType: "youtube" | "instagram" | "article" | "audio" | "document" | "note";
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonalMemoryItem {
  id: string;
  category: "preference" | "identity" | "project" | "relationship" | "fact";
  key: string;
  value: string;
  provenanceSourceId?: string;
  confidenceScore: number;
  confirmedByUser: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  sourceKnowledgeId?: string;
  dueDate?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityLogEntry {
  id: string;
  channel: "telegram" | "web" | "system";
  eventType: string;
  status: "success" | "failure" | "pending";
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface SearchQuery {
  query: string;
  layers?: Array<"knowledge" | "memory" | "tasks">;
  mode?: "hybrid" | "lexical" | "semantic";
  limit?: number;
}

export interface SearchResult {
  items: Array<{
    id: string;
    layer: "knowledge" | "memory" | "tasks";
    title: string;
    snippet: string;
    score: number;
  }>;
  totalCount: number;
  latencyMs: number;
}

export interface WeeklyReviewSummary {
  periodStart: Date;
  periodEnd: Date;
  itemsIngested: number;
  tasksCreated: number;
  tasksCompleted: number;
  memoriesFormed: number;
}

export class NotImplementedError extends Error {
  constructor(methodName: string) {
    super(
      `[VYAVASTHA] IVyavasthaRepository method '${methodName}' is NOT IMPLEMENTED.`
    );
    this.name = "NotImplementedError";
  }
}

/**
 * Core interface contract for VYAVASTHA data access.
 */
export interface IVyavasthaRepository {
  // Layer A: Saved Knowledge
  createKnowledge(item: Partial<KnowledgeItem>): Promise<KnowledgeItem>;
  getKnowledgeById(id: string): Promise<KnowledgeItem | null>;
  listKnowledge(options?: { limit?: number; offset?: number }): Promise<KnowledgeItem[]>;

  // Layer B: Personal Memory
  createMemory(item: Partial<PersonalMemoryItem>): Promise<PersonalMemoryItem>;
  getMemoryById(id: string): Promise<PersonalMemoryItem | null>;
  listMemories(options?: { category?: string }): Promise<PersonalMemoryItem[]>;

  // Layer C: Tasks / Intentions
  createTask(item: Partial<TaskItem>): Promise<TaskItem>;
  getTaskById(id: string): Promise<TaskItem | null>;
  listTasks(options?: { status?: string }): Promise<TaskItem[]>;
  updateTaskStatus(id: string, status: TaskItem["status"]): Promise<TaskItem>;

  // Layer D: Activity History
  logActivity(entry: Partial<ActivityLogEntry>): Promise<ActivityLogEntry>;
  listActivities(options?: { limit?: number }): Promise<ActivityLogEntry[]>;

  // Retrieval & Review
  search(query: SearchQuery): Promise<SearchResult>;
  generateWeeklyReview(options?: { startDate?: Date; endDate?: Date }): Promise<WeeklyReviewSummary>;
}

function safeJsonParse<T>(jsonStr: string | null | undefined, fallback: T): T {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

/**
 * Production Drizzle repository implementation backed by Turso libSQL.
 */
export class DrizzleVyavasthaRepository implements IVyavasthaRepository {
  private readonly db;

  constructor(db = getDb()) {
    this.db = db;
  }

  // --- Layer A: Saved Knowledge ---

  async createKnowledge(item: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
    const id = item.id || crypto.randomUUID();
    const now = Date.now();
    const createdAtMs = item.createdAt instanceof Date ? item.createdAt.getTime() : now;
    const updatedAtMs = item.updatedAt instanceof Date ? item.updatedAt.getTime() : now;

    const row = {
      id,
      sourceUrl: item.sourceUrl ?? null,
      title: item.title || "Untitled",
      summary: item.summary || "",
      rawContent: item.rawContent ?? null,
      mediaType: item.mediaType || "note",
      tags: JSON.stringify(item.tags ?? []),
      createdAt: createdAtMs,
      updatedAt: updatedAtMs,
    };

    await this.db.insert(knowledgeItems).values(row);

    return {
      id: row.id,
      sourceUrl: row.sourceUrl ?? undefined,
      title: row.title,
      summary: row.summary,
      rawContent: row.rawContent ?? undefined,
      mediaType: row.mediaType as KnowledgeItem["mediaType"],
      tags: safeJsonParse<string[]>(row.tags, []),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async getKnowledgeById(id: string): Promise<KnowledgeItem | null> {
    const rows = await this.db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];

    return {
      id: row.id,
      sourceUrl: row.sourceUrl ?? undefined,
      title: row.title,
      summary: row.summary,
      rawContent: row.rawContent ?? undefined,
      mediaType: row.mediaType as KnowledgeItem["mediaType"],
      tags: safeJsonParse<string[]>(row.tags, []),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async listKnowledge(options?: { limit?: number; offset?: number }): Promise<KnowledgeItem[]> {
    let query = this.db
      .select()
      .from(knowledgeItems)
      .orderBy(desc(knowledgeItems.createdAt));

    if (options?.limit !== undefined) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options?.offset !== undefined) {
      query = query.offset(options.offset) as typeof query;
    }

    const rows = await query;
    return rows.map((row) => ({
      id: row.id,
      sourceUrl: row.sourceUrl ?? undefined,
      title: row.title,
      summary: row.summary,
      rawContent: row.rawContent ?? undefined,
      mediaType: row.mediaType as KnowledgeItem["mediaType"],
      tags: safeJsonParse<string[]>(row.tags, []),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  // --- Layer B: Personal Memory ---

  async createMemory(item: Partial<PersonalMemoryItem>): Promise<PersonalMemoryItem> {
    const id = item.id || crypto.randomUUID();
    const now = Date.now();
    const createdAtMs = item.createdAt instanceof Date ? item.createdAt.getTime() : now;
    const updatedAtMs = item.updatedAt instanceof Date ? item.updatedAt.getTime() : now;

    const row = {
      id,
      category: item.category || "fact",
      key: item.key || "",
      value: item.value || "",
      provenanceSourceId: item.provenanceSourceId ?? null,
      confidenceScore: item.confidenceScore ?? 1.0,
      confirmedByUser: item.confirmedByUser ? 1 : 0,
      createdAt: createdAtMs,
      updatedAt: updatedAtMs,
    };

    await this.db.insert(personalMemoryItems).values(row);

    return {
      id: row.id,
      category: row.category as PersonalMemoryItem["category"],
      key: row.key,
      value: row.value,
      provenanceSourceId: row.provenanceSourceId ?? undefined,
      confidenceScore: row.confidenceScore,
      confirmedByUser: Boolean(row.confirmedByUser === 1),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async getMemoryById(id: string): Promise<PersonalMemoryItem | null> {
    const rows = await this.db
      .select()
      .from(personalMemoryItems)
      .where(eq(personalMemoryItems.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];

    return {
      id: row.id,
      category: row.category as PersonalMemoryItem["category"],
      key: row.key,
      value: row.value,
      provenanceSourceId: row.provenanceSourceId ?? undefined,
      confidenceScore: row.confidenceScore,
      confirmedByUser: Boolean(row.confirmedByUser === 1),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async listMemories(options?: { category?: string }): Promise<PersonalMemoryItem[]> {
    let query = this.db
      .select()
      .from(personalMemoryItems)
      .orderBy(desc(personalMemoryItems.createdAt));

    if (options?.category) {
      query = query.where(eq(personalMemoryItems.category, options.category)) as typeof query;
    }

    const rows = await query;
    return rows.map((row) => ({
      id: row.id,
      category: row.category as PersonalMemoryItem["category"],
      key: row.key,
      value: row.value,
      provenanceSourceId: row.provenanceSourceId ?? undefined,
      confidenceScore: row.confidenceScore,
      confirmedByUser: Boolean(row.confirmedByUser === 1),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  // --- Layer C: Tasks / Intentions ---

  async createTask(item: Partial<TaskItem>): Promise<TaskItem> {
    const id = item.id || crypto.randomUUID();
    const now = Date.now();
    const createdAtMs = item.createdAt instanceof Date ? item.createdAt.getTime() : now;
    const updatedAtMs = item.updatedAt instanceof Date ? item.updatedAt.getTime() : now;
    const dueDateMs = item.dueDate instanceof Date ? item.dueDate.getTime() : null;
    const completedAtMs = item.completedAt instanceof Date ? item.completedAt.getTime() : null;

    const row = {
      id,
      title: item.title || "Untitled Task",
      description: item.description ?? null,
      status: item.status || "pending",
      sourceKnowledgeId: item.sourceKnowledgeId ?? null,
      dueDate: dueDateMs,
      completedAt: completedAtMs,
      createdAt: createdAtMs,
      updatedAt: updatedAtMs,
    };

    await this.db.insert(taskItems).values(row);

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as TaskItem["status"],
      sourceKnowledgeId: row.sourceKnowledgeId ?? undefined,
      dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async getTaskById(id: string): Promise<TaskItem | null> {
    const rows = await this.db
      .select()
      .from(taskItems)
      .where(eq(taskItems.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as TaskItem["status"],
      sourceKnowledgeId: row.sourceKnowledgeId ?? undefined,
      dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async listTasks(options?: { status?: string }): Promise<TaskItem[]> {
    let query = this.db
      .select()
      .from(taskItems)
      .orderBy(desc(taskItems.createdAt));

    if (options?.status) {
      query = query.where(eq(taskItems.status, options.status)) as typeof query;
    }

    const rows = await query;
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as TaskItem["status"],
      sourceKnowledgeId: row.sourceKnowledgeId ?? undefined,
      dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  async updateTaskStatus(id: string, status: TaskItem["status"]): Promise<TaskItem> {
    const now = Date.now();
    const updateData: {
      status: string;
      updatedAt: number;
      completedAt: number | null;
    } = {
      status,
      updatedAt: now,
      completedAt: status === "completed" ? now : null,
    };

    await this.db
      .update(taskItems)
      .set(updateData)
      .where(eq(taskItems.id, id));

    const updated = await this.getTaskById(id);
    if (!updated) {
      throw new Error(`[DB] Task with id '${id}' not found after update`);
    }
    return updated;
  }

  // --- Layer D: Activity History ---

  async logActivity(entry: Partial<ActivityLogEntry>): Promise<ActivityLogEntry> {
    const id = entry.id || crypto.randomUUID();
    const now = Date.now();
    const createdAtMs = entry.createdAt instanceof Date ? entry.createdAt.getTime() : now;

    const row = {
      id,
      channel: entry.channel || "system",
      eventType: entry.eventType || "general",
      status: entry.status || "success",
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      createdAt: createdAtMs,
    };

    await this.db.insert(activityLogs).values(row);

    return {
      id: row.id,
      channel: row.channel as ActivityLogEntry["channel"],
      eventType: row.eventType,
      status: row.status as ActivityLogEntry["status"],
      metadata: entry.metadata,
      createdAt: new Date(row.createdAt),
    };
  }

  async listActivities(options?: { limit?: number }): Promise<ActivityLogEntry[]> {
    const limit = options?.limit ?? 50;
    const rows = await this.db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      channel: row.channel as ActivityLogEntry["channel"],
      eventType: row.eventType,
      status: row.status as ActivityLogEntry["status"],
      metadata: safeJsonParse<Record<string, unknown> | undefined>(row.metadata, undefined),
      createdAt: new Date(row.createdAt),
    }));
  }

  // --- Retrieval & Review ---

  async search(query: SearchQuery): Promise<SearchResult> {
    const start = performance.now();
    const limit = query.limit ?? 20;
    const rawTerm = query.query.trim();
    const searchPattern = `%${rawTerm}%`;
    const requestedLayers = query.layers ?? ["knowledge", "memory", "tasks"];

    const searchResults: SearchResult["items"] = [];

    if (rawTerm.length > 0) {
      if (requestedLayers.includes("knowledge")) {
        const kRows = await this.db
          .select()
          .from(knowledgeItems)
          .where(
            or(
              like(knowledgeItems.title, searchPattern),
              like(knowledgeItems.summary, searchPattern),
              like(knowledgeItems.rawContent, searchPattern),
              like(knowledgeItems.tags, searchPattern)
            )
          )
          .limit(limit);

        for (const r of kRows) {
          const titleMatch = r.title.toLowerCase().includes(rawTerm.toLowerCase());
          searchResults.push({
            id: r.id,
            layer: "knowledge",
            title: r.title,
            snippet: r.summary || r.title,
            score: titleMatch ? 1.0 : 0.8,
          });
        }
      }

      if (requestedLayers.includes("memory")) {
        const mRows = await this.db
          .select()
          .from(personalMemoryItems)
          .where(
            or(
              like(personalMemoryItems.key, searchPattern),
              like(personalMemoryItems.value, searchPattern),
              like(personalMemoryItems.category, searchPattern)
            )
          )
          .limit(limit);

        for (const r of mRows) {
          searchResults.push({
            id: r.id,
            layer: "memory",
            title: `${r.category}: ${r.key}`,
            snippet: r.value,
            score: r.confidenceScore ?? 1.0,
          });
        }
      }

      if (requestedLayers.includes("tasks")) {
        const tRows = await this.db
          .select()
          .from(taskItems)
          .where(
            or(
              like(taskItems.title, searchPattern),
              like(taskItems.description, searchPattern)
            )
          )
          .limit(limit);

        for (const r of tRows) {
          searchResults.push({
            id: r.id,
            layer: "tasks",
            title: r.title,
            snippet: r.description || `Status: ${r.status}`,
            score: r.status === "completed" ? 0.7 : 0.9,
          });
        }
      }
    }

    searchResults.sort((a, b) => b.score - a.score);
    const paginated = searchResults.slice(0, limit);
    const latencyMs = Math.round(performance.now() - start);

    return {
      items: paginated,
      totalCount: searchResults.length,
      latencyMs,
    };
  }

  async generateWeeklyReview(options?: { startDate?: Date; endDate?: Date }): Promise<WeeklyReviewSummary> {
    const periodEnd = options?.endDate ?? new Date();
    const periodStart = options?.startDate ?? new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const startMs = periodStart.getTime();
    const endMs = periodEnd.getTime();

    const [kCountRes] = await this.db
      .select({ count: count() })
      .from(knowledgeItems)
      .where(and(gte(knowledgeItems.createdAt, startMs), lte(knowledgeItems.createdAt, endMs)));

    const [tCreatedRes] = await this.db
      .select({ count: count() })
      .from(taskItems)
      .where(and(gte(taskItems.createdAt, startMs), lte(taskItems.createdAt, endMs)));

    const [tCompletedRes] = await this.db
      .select({ count: count() })
      .from(taskItems)
      .where(and(gte(taskItems.completedAt, startMs), lte(taskItems.completedAt, endMs)));

    const [mCountRes] = await this.db
      .select({ count: count() })
      .from(personalMemoryItems)
      .where(and(gte(personalMemoryItems.createdAt, startMs), lte(personalMemoryItems.createdAt, endMs)));

    return {
      periodStart,
      periodEnd,
      itemsIngested: kCountRes?.count ?? 0,
      tasksCreated: tCreatedRes?.count ?? 0,
      tasksCompleted: tCompletedRes?.count ?? 0,
      memoriesFormed: mCountRes?.count ?? 0,
    };
  }
}

/**
 * Unimplemented repository stub enforcing the interface contract when persistence is disabled.
 * Preserved for backwards compatibility with existing unit tests.
 */
export class UnimplementedVyavasthaRepository implements IVyavasthaRepository {
  async createKnowledge(_item: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
    throw new NotImplementedError("createKnowledge");
  }
  async getKnowledgeById(_id: string): Promise<KnowledgeItem | null> {
    throw new NotImplementedError("getKnowledgeById");
  }
  async listKnowledge(_options?: { limit?: number; offset?: number }): Promise<KnowledgeItem[]> {
    throw new NotImplementedError("listKnowledge");
  }

  async createMemory(_item: Partial<PersonalMemoryItem>): Promise<PersonalMemoryItem> {
    throw new NotImplementedError("createMemory");
  }
  async getMemoryById(_id: string): Promise<PersonalMemoryItem | null> {
    throw new NotImplementedError("getMemoryById");
  }
  async listMemories(_options?: { category?: string }): Promise<PersonalMemoryItem[]> {
    throw new NotImplementedError("listMemories");
  }

  async createTask(_item: Partial<TaskItem>): Promise<TaskItem> {
    throw new NotImplementedError("createTask");
  }
  async getTaskById(_id: string): Promise<TaskItem | null> {
    throw new NotImplementedError("getTaskById");
  }
  async listTasks(_options?: { status?: string }): Promise<TaskItem[]> {
    throw new NotImplementedError("listTasks");
  }
  async updateTaskStatus(_id: string, _status: TaskItem["status"]): Promise<TaskItem> {
    throw new NotImplementedError("updateTaskStatus");
  }

  async logActivity(_entry: Partial<ActivityLogEntry>): Promise<ActivityLogEntry> {
    throw new NotImplementedError("logActivity");
  }
  async listActivities(_options?: { limit?: number }): Promise<ActivityLogEntry[]> {
    throw new NotImplementedError("listActivities");
  }

  async search(_query: SearchQuery): Promise<SearchResult> {
    throw new NotImplementedError("search");
  }
  async generateWeeklyReview(_options?: { startDate?: Date; endDate?: Date }): Promise<WeeklyReviewSummary> {
    throw new NotImplementedError("generateWeeklyReview");
  }
}

let repositoryInstance: IVyavasthaRepository | null = null;

/**
 * Returns the singleton instance of the Vyavastha repository.
 */
export function getRepository(): IVyavasthaRepository {
  if (!repositoryInstance) {
    repositoryInstance = new DrizzleVyavasthaRepository();
  }
  return repositoryInstance;
}
