import { z } from "zod";

/**
 * Supported source media types for knowledge ingestion in VYAVASTHA.
 */
export const SourceTypeEnum = z.enum([
  "youtube",
  "instagram",
  "article",
  "audio",
  "document",
  "note",
]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

/**
 * Supported categories for candidate personal memories (Layer B).
 */
export const MemoryCategoryEnum = z.enum([
  "preference",
  "identity",
  "project",
  "relationship",
  "fact",
]);
export type MemoryCategory = z.infer<typeof MemoryCategoryEnum>;

/**
 * Task priorities for actionable items extracted from ingested content.
 */
export const TaskPriorityEnum = z.enum(["low", "medium", "high"]);
export type TaskPriority = z.infer<typeof TaskPriorityEnum>;

/**
 * Extracted named entity schema.
 */
export const EntitySchema = z.object({
  name: z.string().min(1, "Entity name cannot be empty"),
  type: z.string().min(1, "Entity type cannot be empty"),
  context: z.string().optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

/**
 * Extracted actionable task schema.
 */
export const ActionableTaskSchema = z.object({
  title: z.string().min(1, "Task title cannot be empty"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: TaskPriorityEnum.default("medium").optional(),
});
export type ActionableTask = z.infer<typeof ActionableTaskSchema>;

/**
 * Candidate personal memory schema.
 *
 * CRITICAL MEMORY RULE:
 * Saved content must NOT automatically become permanent personal memory!
 * Candidate personal memories proposed by AI must be marked `confirmedByUser: false`
 * with a confidence score and provenance reference, requiring explicit user confirmation.
 */
export const CandidatePersonalMemorySchema = z.object({
  category: MemoryCategoryEnum,
  key: z.string().min(1, "Memory key cannot be empty"),
  value: z.string().min(1, "Memory value cannot be empty"),
  confidenceScore: z.number().min(0).max(1),
  reason: z.string().min(1, "Reason for proposing candidate memory is required"),
  confirmedByUser: z.boolean().default(false),
  provenanceSourceId: z.string().optional(),
  provenance: z.string().optional(),
});
export type CandidatePersonalMemory = z.infer<typeof CandidatePersonalMemorySchema>;

/**
 * Comprehensive Content Understanding Schema for Gemini Multimodal Analysis.
 */
export const ContentUnderstandingResultSchema = z.object({
  title: z.string().min(1, "Title is required"),
  summary: z.string().min(1, "Summary is required"),
  sourceType: SourceTypeEnum,
  sourceUrl: z.string().url().optional().or(z.string().optional()),
  concepts: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  entities: z.array(EntitySchema).default([]),
  actionableTasks: z.array(ActionableTaskSchema).default([]),
  candidatePersonalMemories: z.array(CandidatePersonalMemorySchema).default([]),
});
export type ContentUnderstandingResult = z.infer<typeof ContentUnderstandingResultSchema>;

/**
 * Input for content understanding analysis.
 */
export interface ContentUnderstandingInput {
  text: string;
  url?: string;
  mediaType?: SourceType | string;
  metadata?: Record<string, unknown>;
}

/**
 * Citation schema for Chat Synthesis.
 */
export const CitationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

/**
 * Chat synthesis response schema.
 */
export const ChatSynthesisResponseSchema = z.object({
  reply: z.string().min(1, "Reply cannot be empty"),
  citations: z.array(CitationSchema).default([]),
});
export type ChatSynthesisResponse = z.infer<typeof ChatSynthesisResponseSchema>;

/**
 * Chat history message entry.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Retrieved context bundle for Chat Synthesis across Layers A, B, and C.
 */
export interface RetrievedChatContext {
  knowledge: Array<{
    id: string;
    title: string;
    summary?: string;
    snippet?: string;
    sourceUrl?: string;
    mediaType?: string;
    [key: string]: unknown;
  }>;
  memories: Array<{
    id: string;
    category?: string;
    key: string;
    value: string;
    confidenceScore?: number;
    confirmedByUser?: boolean;
    [key: string]: unknown;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description?: string;
    status?: string;
    dueDate?: string | Date;
    [key: string]: unknown;
  }>;
}

/**
 * Input for chat synthesis.
 */
export interface ChatSynthesisInput {
  query: string;
  conversationHistory: ChatMessage[];
  retrievedContext: RetrievedChatContext;
}

/**
 * Weekly review result schema.
 */
export const WeeklyReviewResultSchema = z.object({
  narrative: z.string().min(1, "Weekly narrative is required"),
  keyLearnings: z.array(z.string()).default([]),
  activeIntentions: z.array(z.string()).default([]),
  identityShifts: z.array(z.string()).default([]),
});
export type WeeklyReviewResult = z.infer<typeof WeeklyReviewResultSchema>;

/**
 * Input for weekly review synthesis.
 */
export interface WeeklyReviewInput {
  stats: {
    periodStart?: string | Date;
    periodEnd?: string | Date;
    itemsIngested?: number;
    tasksCreated?: number;
    tasksCompleted?: number;
    memoriesFormed?: number;
    [key: string]: unknown;
  };
  recentKnowledge: Array<{
    id: string;
    title: string;
    summary?: string;
    tags?: string[];
    [key: string]: unknown;
  }>;
  recentTasks: Array<{
    id: string;
    title: string;
    status?: string;
    description?: string;
    [key: string]: unknown;
  }>;
  recentMemories: Array<{
    id: string;
    category?: string;
    key: string;
    value: string;
    [key: string]: unknown;
  }>;
}
