/**
 * VYAVASTHA — Repository Layer Abstraction (Phase 6 Foundation)
 *
 * Defines the strict IVyavasthaRepository interface covering the four foundational layers:
 * - Layer A: Saved Knowledge (external media, articles, files, notes)
 * - Layer B: Personal Memory (stable user identity facts with provenance confirmation)
 * - Layer C: Tasks / Intentions (actionable to-dos, explicit confirmation required for completion)
 * - Layer D: Activity History (audit logs, ingestion events, system history)
 *
 * NOTE: Phase 6 specifies the architectural interface contracts ONLY.
 * Real SQL queries and Drizzle schemas are deferred to Phase 7 (Database Schema + Core Persistence).
 * No fake persistence or mock data is permitted.
 */

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
      `[VYAVASTHA] IVyavasthaRepository method '${methodName}' is NOT IMPLEMENTED. Physical schema and persistence are scheduled for Phase 7.`
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
  generateWeeklyReview(options?: { startDate: Date; endDate: Date }): Promise<WeeklyReviewSummary>;
}

/**
 * Unimplemented repository stub enforcing the interface contract in Phase 6.
 * Guarantees zero fake persistence or mock data before Phase 7 schema creation.
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
  async generateWeeklyReview(_options?: { startDate: Date; endDate: Date }): Promise<WeeklyReviewSummary> {
    throw new NotImplementedError("generateWeeklyReview");
  }
}
