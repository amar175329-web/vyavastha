import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * VYAVASTHA — Database Schema Definition
 *
 * Layer A: Saved Knowledge (knowledge_items)
 * Layer B: Personal Memory (personal_memory_items)
 * Layer C: Tasks / Intentions (task_items)
 * Layer D: Activity History (activity_logs)
 */

export const knowledgeItems = sqliteTable(
  "knowledge_items",
  {
    id: text("id").primaryKey(),
    sourceUrl: text("source_url"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    rawContent: text("raw_content"),
    mediaType: text("media_type").notNull(),
    tags: text("tags").notNull(), // JSON string array
    createdAt: integer("created_at").notNull(), // timestamp in ms
    updatedAt: integer("updated_at").notNull(), // timestamp in ms
  },
  (table) => [
    index("idx_knowledge_media_type").on(table.mediaType),
    index("idx_knowledge_created_at").on(table.createdAt),
  ]
);

export const personalMemoryItems = sqliteTable(
  "personal_memory_items",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    provenanceSourceId: text("provenance_source_id"),
    confidenceScore: real("confidence_score").notNull().default(1.0),
    confirmedByUser: integer("confirmed_by_user").notNull().default(0), // 0 or 1
    createdAt: integer("created_at").notNull(), // timestamp in ms
    updatedAt: integer("updated_at").notNull(), // timestamp in ms
  },
  (table) => [
    index("idx_memory_category").on(table.category),
    index("idx_memory_confirmed").on(table.confirmedByUser),
  ]
);

export const taskItems = sqliteTable(
  "task_items",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("pending"),
    sourceKnowledgeId: text("source_knowledge_id"),
    dueDate: integer("due_date"), // timestamp in ms
    completedAt: integer("completed_at"), // timestamp in ms
    createdAt: integer("created_at").notNull(), // timestamp in ms
    updatedAt: integer("updated_at").notNull(), // timestamp in ms
  },
  (table) => [
    index("idx_tasks_status").on(table.status),
    index("idx_tasks_due_date").on(table.dueDate),
  ]
);

export const activityLogs = sqliteTable(
  "activity_logs",
  {
    id: text("id").primaryKey(),
    channel: text("channel").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(),
    metadata: text("metadata"), // JSON string
    createdAt: integer("created_at").notNull(), // timestamp in ms
  },
  (table) => [
    index("idx_activity_channel").on(table.channel),
    index("idx_activity_event_type").on(table.eventType),
    index("idx_activity_created_at").on(table.createdAt),
  ]
);

export type KnowledgeItemRow = typeof knowledgeItems.$inferSelect;
export type InsertKnowledgeItemRow = typeof knowledgeItems.$inferInsert;

export type PersonalMemoryItemRow = typeof personalMemoryItems.$inferSelect;
export type InsertPersonalMemoryItemRow = typeof personalMemoryItems.$inferInsert;

export type TaskItemRow = typeof taskItems.$inferSelect;
export type InsertTaskItemRow = typeof taskItems.$inferInsert;

export type ActivityLogRow = typeof activityLogs.$inferSelect;
export type InsertActivityLogRow = typeof activityLogs.$inferInsert;
