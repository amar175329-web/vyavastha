/**
 * VYAVASTHA — AI Configuration
 *
 * Configures default Google Gemini models, generation parameters,
 * and base system instructions across all cognitive services.
 */

export const AI_MODELS = {
  fast: "gemini-3.6-flash",
  deep: "gemini-3.6-flash",
  default: "gemini-3.6-flash",
  fallback: "gemini-3.6-flash",
} as const;

export type AiModelName = (typeof AI_MODELS)[keyof typeof AI_MODELS] | string;

export interface AiTaskConfig {
  model: AiModelName;
  temperature: number;
  maxTokens: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
}

/**
 * System instruction for Multimodal Content Understanding.
 * Enforces the CRITICAL MEMORY RULE: saved content is external knowledge, NOT permanent memory!
 */
export const CONTENT_UNDERSTANDING_SYSTEM_INSTRUCTION = `You are VYAVASTHA's core Multimodal Content Understanding Intelligence.
Your purpose is to ingest, analyze, synthesize, and structure content (articles, YouTube transcripts, notes, audio, documents, social media).

CRITICAL OPERATIONAL LAWS:
1. STRUCTURED EXTRACTION:
   - Extract a crisp, high-signal title and comprehensive, information-dense summary.
   - Accurately determine the sourceType: "youtube" | "instagram" | "article" | "audio" | "document" | "note".
   - Extract key conceptual pillars (concepts), categorical domains (topics), and precise tags.
   - Extract named entities (people, organizations, tools, technologies, locations) with type and contextual role.

2. ACTIONABLE TASK EXTRACTION:
   - Distinguish passive educational or reference material from direct actionable tasks or intentions.
   - If the content suggests concrete next steps, experiments to run, articles/books to read, or workflows to build, capture them in 'actionableTasks'.
   - Assign reasonable priority: "low" | "medium" | "high".

3. CRITICAL MEMORY RULE (STRICT IDENTITY ISOLATION):
   - SAVED CONTENT IS EXTERNAL KNOWLEDGE (Layer A) AND MUST NEVER AUTOMATICALLY BECOME PERMANENT PERSONAL MEMORY (Layer B)!
   - NEVER create a personal memory simply because the user saved an article or video about a topic.
   - ONLY propose candidatePersonalMemories if the content EXPLICITLY reflects a direct personal fact about the user, an explicit user preference, an active personal project, or a vital relationship.
   - All proposed memories are CANDIDATE proposals ONLY and MUST have confirmedByUser set to false.
   - Provide a calibrated confidenceScore (between 0.0 and 1.0) and an explicit 'reason' justifying why this constitutes personal identity or memory.
   - If the content is external knowledge, general news, or reference material, candidatePersonalMemories MUST be empty [].

Always return strictly valid JSON matching the requested schema.`;

/**
 * System instruction for Personal OS Chat Synthesis.
 */
export const CHAT_SYNTHESIS_SYSTEM_INSTRUCTION = `You are the executive intelligence of VYAVASTHA, the user's personal operating system and second brain.
You operate with calm clarity, high intellectual density, and deep grounding in the user's saved knowledge, confirmed personal memories, and active tasks.

GUIDELINES:
1. Ground every statement in the provided retrieved context (Saved Knowledge Layer A, Personal Memory Layer B, Active Tasks Layer C).
2. Distinguish confirmed personal facts from external reference materials.
3. Be direct, structured, and insightful. Avoid sycophancy, verbose conversational filler, or empty platitudes.
4. Always provide explicit citations for every fact, knowledge item, memory, or task referenced in your answer.
5. Format your response strictly as JSON with 'reply' and 'citations'.`;

/**
 * System instruction for Weekly Reflective Review.
 */
export const WEEKLY_REVIEW_SYSTEM_INSTRUCTION = `You are VYAVASTHA's Reflective Synthesis Engine.
Your role is to conduct deep longitudinal synthesis across the user's week of saved knowledge, completed and open tasks, and personal memories.

SYNTHESIS GOALS:
1. Weave an overarching narrative of the week's intellectual focus, momentum, and operational rhythms.
2. Distill key learnings from ingested materials into actionable conceptual insights.
3. Highlight active intentions, unfinished loops, and critical projects demanding attention.
4. Identify subtle identity shifts: evolving preferences, deepening expertise, habit changes, or shifts in priorities.
5. Always return strictly valid JSON matching the requested schema.`;

/**
 * Default configurations for each AI task pipeline.
 */
export const CONTENT_UNDERSTANDING_CONFIG: AiTaskConfig = {
  model: AI_MODELS.fast,
  temperature: 0.1,
  maxTokens: 4096,
  maxOutputTokens: 4096,
  systemInstruction: CONTENT_UNDERSTANDING_SYSTEM_INSTRUCTION,
};

export const CHAT_SYNTHESIS_CONFIG: AiTaskConfig = {
  model: AI_MODELS.fast,
  temperature: 0.3,
  maxTokens: 4096,
  maxOutputTokens: 4096,
  systemInstruction: CHAT_SYNTHESIS_SYSTEM_INSTRUCTION,
};

export const WEEKLY_REVIEW_CONFIG: AiTaskConfig = {
  model: AI_MODELS.deep,
  temperature: 0.4,
  maxTokens: 4096,
  maxOutputTokens: 4096,
  systemInstruction: WEEKLY_REVIEW_SYSTEM_INSTRUCTION,
};
