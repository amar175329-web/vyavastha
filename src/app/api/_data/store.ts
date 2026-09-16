import fs from "node:fs";
import path from "node:path";

export interface KnowledgeItem {
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

export interface PersonalMemoryItem {
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

export interface TaskItem {
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

export interface ActivityLogEntry {
  id: string;
  channel: "telegram" | "web" | "system";
  eventType: string;
  status: "success" | "failure" | "pending";
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface WeeklyReviewSummary {
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

interface DataStoreSchema {
  knowledge: KnowledgeItem[];
  memories: PersonalMemoryItem[];
  tasks: TaskItem[];
  activities: ActivityLogEntry[];
}

const STORE_PATH = path.resolve(process.cwd(), "tmp/vyavastha-data.json");

function ensureStoreDir(): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readStore(): DataStoreSchema {
  try {
    ensureStoreDir();
    if (!fs.existsSync(STORE_PATH)) {
      const initial: DataStoreSchema = {
        knowledge: [],
        memories: [],
        tasks: [],
        activities: [],
      };
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), "utf-8");
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as DataStoreSchema;
    return {
      knowledge: Array.isArray(parsed.knowledge) ? parsed.knowledge : [],
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
    };
  } catch (err) {
    console.error("[Store] Failed to read store file:", err);
    return {
      knowledge: [],
      memories: [],
      tasks: [],
      activities: [],
    };
  }
}

function writeStore(data: DataStoreSchema): void {
  try {
    ensureStoreDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Store] Failed to write store file:", err);
  }
}

// ==================== KNOWLEDGE ====================

export function listKnowledge(filters?: { type?: string; search?: string; limit?: number }): KnowledgeItem[] {
  const store = readStore();
  let items = [...store.knowledge];

  if (filters?.type && filters.type !== "all") {
    items = items.filter((k) => k.mediaType.toLowerCase() === filters.type?.toLowerCase());
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    items = items.filter(
      (k) =>
        k.title.toLowerCase().includes(q) ||
        k.summary.toLowerCase().includes(q) ||
        k.tags.some((t) => t.toLowerCase().includes(q)) ||
        (k.rawContent && k.rawContent.toLowerCase().includes(q))
    );
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (filters?.limit && filters.limit > 0) {
    items = items.slice(0, filters.limit);
  }

  return items;
}

export function getKnowledgeById(id: string): {
  item: KnowledgeItem | null;
  relatedMemories: PersonalMemoryItem[];
  relatedTasks: TaskItem[];
} {
  const store = readStore();
  const item = store.knowledge.find((k) => k.id === id) || null;
  const relatedMemories = store.memories.filter((m) => m.provenanceSourceId === id);
  const relatedTasks = store.tasks.filter((t) => t.sourceKnowledgeId === id);

  return { item, relatedMemories, relatedTasks };
}

export function createKnowledge(data: {
  title: string;
  summary: string;
  mediaType: KnowledgeItem["mediaType"];
  sourceUrl?: string;
  rawContent?: string;
  tags?: string[];
}): KnowledgeItem {
  const store = readStore();
  const now = new Date().toISOString();
  const id = `kn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const item: KnowledgeItem = {
    id,
    title: data.title.trim(),
    summary: data.summary.trim(),
    mediaType: data.mediaType,
    sourceUrl: data.sourceUrl?.trim() || undefined,
    rawContent: data.rawContent?.trim() || undefined,
    tags: Array.isArray(data.tags) ? data.tags.map((t) => t.trim()).filter(Boolean) : [],
    createdAt: now,
    updatedAt: now,
  };

  store.knowledge.unshift(item);
  store.activities.unshift({
    id: `act_${Date.now()}`,
    channel: "web",
    eventType: "knowledge_created",
    status: "success",
    metadata: { knowledgeId: item.id, title: item.title, mediaType: item.mediaType },
    createdAt: now,
  });

  writeStore(store);
  return item;
}

export function deleteKnowledge(id: string): boolean {
  const store = readStore();
  const index = store.knowledge.findIndex((k) => k.id === id);
  if (index === -1) return false;

  store.knowledge.splice(index, 1);
  writeStore(store);
  return true;
}

// ==================== PERSONAL MEMORY ====================

export function listMemories(filters?: { category?: string; search?: string }): PersonalMemoryItem[] {
  const store = readStore();
  let items = [...store.memories];

  if (filters?.category && filters.category !== "all") {
    items = items.filter((m) => m.category.toLowerCase() === filters.category?.toLowerCase());
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    items = items.filter(
      (m) =>
        m.key.toLowerCase().includes(q) ||
        m.value.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
    );
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

export function createMemory(data: {
  category: PersonalMemoryItem["category"];
  key: string;
  value: string;
  provenanceSourceId?: string;
  confidenceScore?: number;
  confirmedByUser?: boolean;
}): PersonalMemoryItem {
  const store = readStore();
  const now = new Date().toISOString();
  const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const item: PersonalMemoryItem = {
    id,
    category: data.category,
    key: data.key.trim(),
    value: data.value.trim(),
    provenanceSourceId: data.provenanceSourceId || undefined,
    confidenceScore: typeof data.confidenceScore === "number" ? Math.min(100, Math.max(0, data.confidenceScore)) : 95,
    confirmedByUser: data.confirmedByUser ?? true,
    createdAt: now,
    updatedAt: now,
  };

  store.memories.unshift(item);
  store.activities.unshift({
    id: `act_${Date.now()}`,
    channel: "web",
    eventType: "memory_created",
    status: "success",
    metadata: { memoryId: item.id, key: item.key, category: item.category },
    createdAt: now,
  });

  writeStore(store);
  return item;
}

export function updateMemory(
  id: string,
  data: Partial<Pick<PersonalMemoryItem, "confirmedByUser" | "value" | "key" | "category" | "confidenceScore">>
): PersonalMemoryItem | null {
  const store = readStore();
  const item = store.memories.find((m) => m.id === id);
  if (!item) return null;

  if (data.confirmedByUser !== undefined) item.confirmedByUser = data.confirmedByUser;
  if (data.value !== undefined) item.value = data.value.trim();
  if (data.key !== undefined) item.key = data.key.trim();
  if (data.category !== undefined) item.category = data.category;
  if (data.confidenceScore !== undefined) item.confidenceScore = data.confidenceScore;
  item.updatedAt = new Date().toISOString();

  writeStore(store);
  return item;
}

export function deleteMemory(id: string): boolean {
  const store = readStore();
  const index = store.memories.findIndex((m) => m.id === id);
  if (index === -1) return false;

  store.memories.splice(index, 1);
  writeStore(store);
  return true;
}

// ==================== TASKS / INTENTIONS ====================

export function listTasks(filters?: { status?: string; search?: string }): TaskItem[] {
  const store = readStore();
  let items = [...store.tasks];

  if (filters?.status && filters.status !== "all") {
    items = items.filter((t) => t.status === filters.status);
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    items = items.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }

  // Sort: pending & in_progress first, then newest
  items.sort((a, b) => {
    const order: Record<string, number> = { pending: 1, in_progress: 2, completed: 3, cancelled: 4 };
    const aOrder = order[a.status] ?? 99;
    const bOrder = order[b.status] ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return items;
}

export function createTask(data: {
  title: string;
  description?: string;
  status?: TaskItem["status"];
  sourceKnowledgeId?: string;
  dueDate?: string;
}): TaskItem {
  const store = readStore();
  const now = new Date().toISOString();
  const id = `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const item: TaskItem = {
    id,
    title: data.title.trim(),
    description: data.description?.trim() || undefined,
    status: data.status || "pending",
    sourceKnowledgeId: data.sourceKnowledgeId || undefined,
    dueDate: data.dueDate || undefined,
    createdAt: now,
    updatedAt: now,
  };

  store.tasks.unshift(item);
  store.activities.unshift({
    id: `act_${Date.now()}`,
    channel: "web",
    eventType: "task_created",
    status: "success",
    metadata: { taskId: item.id, title: item.title, isExtracted: Boolean(item.sourceKnowledgeId) },
    createdAt: now,
  });

  writeStore(store);
  return item;
}

export function updateTask(
  id: string,
  data: Partial<Pick<TaskItem, "status" | "title" | "description" | "dueDate">>
): TaskItem | null {
  const store = readStore();
  const item = store.tasks.find((t) => t.id === id);
  if (!item) return null;

  if (data.status !== undefined) {
    item.status = data.status;
    if (data.status === "completed") {
      item.completedAt = new Date().toISOString();
    } else {
      item.completedAt = undefined;
    }
  }
  if (data.title !== undefined) item.title = data.title.trim();
  if (data.description !== undefined) item.description = data.description?.trim() || undefined;
  if (data.dueDate !== undefined) item.dueDate = data.dueDate || undefined;
  item.updatedAt = new Date().toISOString();

  writeStore(store);
  return item;
}

export function deleteTask(id: string): boolean {
  const store = readStore();
  const index = store.tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;

  store.tasks.splice(index, 1);
  writeStore(store);
  return true;
}

// ==================== WEEKLY REVIEW ====================

export function getWeeklyReviewData(startDate?: Date, endDate?: Date): WeeklyReviewSummary {
  const store = readStore();
  const end = endDate || new Date();
  const start = startDate || new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const recentKnowledge = store.knowledge.filter(
    (k) => k.createdAt >= startIso && k.createdAt <= endIso
  );
  const recentTasksCreated = store.tasks.filter(
    (t) => t.createdAt >= startIso && t.createdAt <= endIso
  );
  const recentTasksCompleted = store.tasks.filter(
    (t) => t.completedAt && t.completedAt >= startIso && t.completedAt <= endIso
  );
  const recentMemories = store.memories.filter(
    (m) => m.createdAt >= startIso && m.createdAt <= endIso
  );

  // Active intentions (pending or in_progress)
  const activeIntentions = store.tasks
    .filter((t) => t.status === "pending" || t.status === "in_progress")
    .map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate }));

  // Key knowledge absorbed
  const keyKnowledge = (recentKnowledge.length > 0 ? recentKnowledge : store.knowledge.slice(0, 5)).map((k) => ({
    id: k.id,
    title: k.title,
    summary: k.summary,
    mediaType: k.mediaType,
  }));

  // Memory adjustments
  const memoryAdjustments = (recentMemories.length > 0 ? recentMemories : store.memories.slice(0, 5)).map((m) => ({
    id: m.id,
    key: m.key,
    value: m.value,
    category: m.category,
    confirmedByUser: m.confirmedByUser,
  }));

  let synthesis = "";
  if (store.knowledge.length === 0 && store.tasks.length === 0 && store.memories.length === 0) {
    synthesis = "Your personal operating system is quiet. Ingest articles, YouTube videos, or personal notes to begin tracking weekly themes and intentions.";
  } else {
    const parts: string[] = [];
    if (recentKnowledge.length > 0) {
      parts.push(`Absorbed ${recentKnowledge.length} new source(s) across ${new Set(recentKnowledge.map(k => k.mediaType)).size} formats.`);
    } else {
      parts.push("No new knowledge items ingested in this 7-day period.");
    }

    if (recentTasksCompleted.length > 0) {
      parts.push(`Executed ${recentTasksCompleted.length} task(s) to completion with ${activeIntentions.length} remaining in motion.`);
    } else if (activeIntentions.length > 0) {
      parts.push(`${activeIntentions.length} active intention(s) are currently in motion.`);
    } else {
      parts.push("Zero pending tasks.");
    }

    if (recentMemories.length > 0) {
      parts.push(`Formed ${recentMemories.length} personal memory assertion(s).`);
    }

    synthesis = parts.join(" ");
  }

  return {
    periodStart: start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    periodEnd: end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    itemsIngested: recentKnowledge.length,
    tasksCreated: recentTasksCreated.length,
    tasksCompleted: recentTasksCompleted.length,
    memoriesFormed: recentMemories.length,
    keyKnowledge,
    intentionsInMotion: activeIntentions,
    memoryAdjustments,
    reflectiveSynthesis: synthesis,
  };
}

// ==================== SEARCH ====================

export function searchAll(query: string): {
  knowledge: KnowledgeItem[];
  memories: PersonalMemoryItem[];
  tasks: TaskItem[];
} {
  const store = readStore();
  const q = query.toLowerCase().trim();
  if (!q) {
    return {
      knowledge: store.knowledge.slice(0, 5),
      memories: store.memories.slice(0, 5),
      tasks: store.tasks.slice(0, 5),
    };
  }

  const knowledge = store.knowledge
    .filter(
      (k) =>
        k.title.toLowerCase().includes(q) ||
        k.summary.toLowerCase().includes(q) ||
        k.tags.some((t) => t.toLowerCase().includes(q))
    )
    .slice(0, 6);

  const memories = store.memories
    .filter(
      (m) =>
        m.key.toLowerCase().includes(q) ||
        m.value.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
    )
    .slice(0, 6);

  const tasks = store.tasks
    .filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    )
    .slice(0, 6);

  return { knowledge, memories, tasks };
}
