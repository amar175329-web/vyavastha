import { describe, expect, test, afterAll } from "bun:test";
import { getRepository, DrizzleVyavasthaRepository } from "../../src/db/repository";
import { getDb, pingDatabase } from "../../src/db/client";
import { knowledgeItems, personalMemoryItems, taskItems, activityLogs } from "../../src/db/schema";
import { like } from "drizzle-orm";

describe("Database Integration & Drizzle Persistence (tests/integration/db.test.ts)", () => {
  const runId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const repo = getRepository();
  const db = getDb();

  // Unique ID generators with prefix for guaranteed teardown isolation
  const prefixId = (suffix: string) => `${runId}_${suffix}`;

  afterAll(async () => {
    // Guaranteed cleanup of all integration test artifacts
    const pattern = `${runId}%`;
    await db.delete(knowledgeItems).where(like(knowledgeItems.id, pattern));
    await db.delete(personalMemoryItems).where(like(personalMemoryItems.id, pattern));
    await db.delete(taskItems).where(like(taskItems.id, pattern));
    await db.delete(activityLogs).where(like(activityLogs.id, pattern));
  });

  test("connects to live Turso vyavastha-db with valid ping", async () => {
    const ping = await pingDatabase();
    expect(ping.ok).toBe(true);
    expect(ping.database).toBe("vyavastha-db");
    expect(ping.latencyMs).toBeGreaterThan(0);
  });

  test("getRepository returns a singleton DrizzleVyavasthaRepository instance", () => {
    expect(repo).toBeDefined();
    expect(repo instanceof DrizzleVyavasthaRepository).toBe(true);
    expect(getRepository()).toBe(repo);
  });

  describe("Layer A: Knowledge Items CRUD", () => {
    const kId = prefixId("k1");

    test("createKnowledge persists knowledge item with full serialization", async () => {
      const created = await repo.createKnowledge({
        id: kId,
        sourceUrl: "https://example.com/article/ai-systems",
        title: "Test Architecture of Autonomous Agents",
        summary: "Comprehensive synthesis on cognitive architectures and data flow.",
        rawContent: "Detailed markdown content discussing LLM orchestration and vector search.",
        mediaType: "article",
        tags: ["ai", "architecture", "agents"],
        createdAt: new Date("2026-09-10T10:00:00Z"),
        updatedAt: new Date("2026-09-10T10:00:00Z"),
      });

      expect(created.id).toBe(kId);
      expect(created.title).toBe("Test Architecture of Autonomous Agents");
      expect(created.summary).toContain("Comprehensive synthesis");
      expect(created.mediaType).toBe("article");
      expect(created.tags).toEqual(["ai", "architecture", "agents"]);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
      expect(created.sourceUrl).toBe("https://example.com/article/ai-systems");
    });

    test("getKnowledgeById retrieves persisted knowledge item", async () => {
      const fetched = await repo.getKnowledgeById(kId);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(kId);
      expect(fetched?.title).toBe("Test Architecture of Autonomous Agents");
      expect(fetched?.tags).toEqual(["ai", "architecture", "agents"]);
      expect(fetched?.createdAt.toISOString()).toBe(new Date("2026-09-10T10:00:00Z").toISOString());
    });

    test("getKnowledgeById returns null for nonexistent id", async () => {
      const nonExistent = await repo.getKnowledgeById(prefixId("nonexistent"));
      expect(nonExistent).toBeNull();
    });

    test("listKnowledge retrieves ordered list and respects limit", async () => {
      // Create a second item
      const kId2 = prefixId("k2");
      await repo.createKnowledge({
        id: kId2,
        title: "Second Knowledge Item",
        summary: "Second summary text",
        mediaType: "note",
        tags: ["note"],
        createdAt: new Date("2026-09-11T12:00:00Z"),
      });

      const list = await repo.listKnowledge({ limit: 10 });
      expect(list.length).toBeGreaterThanOrEqual(2);

      const foundIds = list.map((item) => item.id);
      expect(foundIds).toContain(kId);
      expect(foundIds).toContain(kId2);
    });
  });

  describe("Layer B: Personal Memory Items CRUD", () => {
    const memId = prefixId("mem1");

    test("createMemory persists memory with boolean and confidence score", async () => {
      const created = await repo.createMemory({
        id: memId,
        category: "preference",
        key: "preferred_programming_language",
        value: "TypeScript and Rust",
        confidenceScore: 0.95,
        confirmedByUser: true,
        provenanceSourceId: prefixId("k1"),
        createdAt: new Date("2026-09-12T09:00:00Z"),
      });

      expect(created.id).toBe(memId);
      expect(created.category).toBe("preference");
      expect(created.key).toBe("preferred_programming_language");
      expect(created.value).toBe("TypeScript and Rust");
      expect(created.confidenceScore).toBe(0.95);
      expect(created.confirmedByUser).toBe(true);
      expect(created.provenanceSourceId).toBe(prefixId("k1"));
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    test("getMemoryById retrieves memory item accurately", async () => {
      const fetched = await repo.getMemoryById(memId);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(memId);
      expect(fetched?.confirmedByUser).toBe(true);
      expect(fetched?.confidenceScore).toBe(0.95);
    });

    test("listMemories filters by category", async () => {
      const memId2 = prefixId("mem2");
      await repo.createMemory({
        id: memId2,
        category: "project",
        key: "active_initiative",
        value: "VYAVASTHA Second Brain Architecture",
        confidenceScore: 1.0,
        confirmedByUser: false,
      });

      const preferences = await repo.listMemories({ category: "preference" });
      const projects = await repo.listMemories({ category: "project" });

      const prefIds = preferences.map((m) => m.id);
      const projIds = projects.map((m) => m.id);

      expect(prefIds).toContain(memId);
      expect(prefIds).not.toContain(memId2);

      expect(projIds).toContain(memId2);
      expect(projIds).not.toContain(memId);
    });
  });

  describe("Layer C: Tasks / Intentions CRUD & State Transitions", () => {
    const taskId = prefixId("task1");

    test("createTask persists task with pending status and due date", async () => {
      const dueDate = new Date("2026-09-20T18:00:00Z");
      const created = await repo.createTask({
        id: taskId,
        title: "Implement Turso Database Persistence Layer",
        description: "Author schema, generate migrations, and implement Drizzle repository.",
        status: "pending",
        sourceKnowledgeId: prefixId("k1"),
        dueDate,
        createdAt: new Date("2026-09-12T10:00:00Z"),
      });

      expect(created.id).toBe(taskId);
      expect(created.title).toBe("Implement Turso Database Persistence Layer");
      expect(created.status).toBe("pending");
      expect(created.dueDate).toBeInstanceOf(Date);
      expect(created.dueDate?.toISOString()).toBe(dueDate.toISOString());
      expect(created.completedAt).toBeUndefined();
    });

    test("getTaskById retrieves task by id", async () => {
      const fetched = await repo.getTaskById(taskId);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(taskId);
      expect(fetched?.status).toBe("pending");
    });

    test("listTasks filters by status", async () => {
      const taskId2 = prefixId("task2");
      await repo.createTask({
        id: taskId2,
        title: "Already completed task",
        status: "completed",
        completedAt: new Date("2026-09-13T14:00:00Z"),
        createdAt: new Date("2026-09-13T10:00:00Z"),
      });

      const pendingTasks = await repo.listTasks({ status: "pending" });
      const pendingIds = pendingTasks.map((t) => t.id);

      expect(pendingIds).toContain(taskId);
      expect(pendingIds).not.toContain(taskId2);
    });

    test("updateTaskStatus transitions status to completed and sets completedAt", async () => {
      const updated = await repo.updateTaskStatus(taskId, "completed");
      expect(updated.id).toBe(taskId);
      expect(updated.status).toBe("completed");
      expect(updated.completedAt).toBeInstanceOf(Date);

      // Verify persistence via fresh get
      const refetched = await repo.getTaskById(taskId);
      expect(refetched?.status).toBe("completed");
      expect(refetched?.completedAt).toBeInstanceOf(Date);
    });

    test("updateTaskStatus clears completedAt when reverting from completed to pending", async () => {
      const reverted = await repo.updateTaskStatus(taskId, "pending");
      expect(reverted.id).toBe(taskId);
      expect(reverted.status).toBe("pending");
      expect(reverted.completedAt).toBeUndefined();
    });
  });

  describe("Layer D: Activity History Logging", () => {
    const actId = prefixId("act1");

    test("logActivity persists log entry with structured metadata", async () => {
      const entry = await repo.logActivity({
        id: actId,
        channel: "telegram",
        eventType: "knowledge_ingested",
        status: "success",
        metadata: {
          knowledgeId: prefixId("k1"),
          source: "telegram_bot",
          processingTimeMs: 142,
        },
      });

      expect(entry.id).toBe(actId);
      expect(entry.channel).toBe("telegram");
      expect(entry.eventType).toBe("knowledge_ingested");
      expect(entry.status).toBe("success");
      expect(entry.metadata).toEqual({
        knowledgeId: prefixId("k1"),
        source: "telegram_bot",
        processingTimeMs: 142,
      });
      expect(entry.createdAt).toBeInstanceOf(Date);
    });

    test("listActivities retrieves recent entries with parsed metadata", async () => {
      const logs = await repo.listActivities({ limit: 10 });
      expect(logs.length).toBeGreaterThanOrEqual(1);

      const matched = logs.find((l) => l.id === actId);
      expect(matched).toBeDefined();
      expect(matched?.metadata?.processingTimeMs).toBe(142);
    });
  });

  describe("Search & Multi-Column Lexical Retrieval", () => {
    test("search locates items across knowledge, memory, and task layers", async () => {
      const result = await repo.search({
        query: "Autonomous Agents",
        layers: ["knowledge", "memory", "tasks"],
        limit: 10,
      });

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.items.length).toBeGreaterThanOrEqual(1);

      const knowledgeHit = result.items.find((i) => i.id === prefixId("k1"));
      expect(knowledgeHit).toBeDefined();
      expect(knowledgeHit?.layer).toBe("knowledge");
      expect(knowledgeHit?.title).toContain("Autonomous Agents");
    });

    test("search respects layer filters", async () => {
      // Search for language in tasks layer only (should return 0 hits since memory has it)
      const tasksOnly = await repo.search({
        query: "TypeScript",
        layers: ["tasks"],
      });

      const memoryHitInTasks = tasksOnly.items.find((i) => i.id === prefixId("mem1"));
      expect(memoryHitInTasks).toBeUndefined();

      // Search memory layer
      const memoryOnly = await repo.search({
        query: "TypeScript",
        layers: ["memory"],
      });
      const memoryHit = memoryOnly.items.find((i) => i.id === prefixId("mem1"));
      expect(memoryHit).toBeDefined();
      expect(memoryHit?.layer).toBe("memory");
    });
  });

  describe("Weekly Review Aggregation", () => {
    test("generateWeeklyReview aggregates counts within date range accurately", async () => {
      const periodStart = new Date("2026-09-09T00:00:00Z");
      const periodEnd = new Date("2026-09-14T23:59:59Z");

      const summary = await repo.generateWeeklyReview({
        startDate: periodStart,
        endDate: periodEnd,
      });

      expect(summary.periodStart).toEqual(periodStart);
      expect(summary.periodEnd).toEqual(periodEnd);
      expect(summary.itemsIngested).toBeGreaterThanOrEqual(2); // k1 and k2 created in window
      expect(summary.memoriesFormed).toBeGreaterThanOrEqual(1); // mem1 created in window
      expect(summary.tasksCreated).toBeGreaterThanOrEqual(2); // task1 and task2 created in window
      expect(summary.tasksCompleted).toBeGreaterThanOrEqual(1); // task2 completed in window
    });
  });
});
