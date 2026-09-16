import { CONTENT_UNDERSTANDING_SYSTEM_INSTRUCTION } from "../config";
import type { ContentUnderstandingInput } from "../types";

/**
 * Builds the system instruction and user prompt for Multimodal Content Understanding.
 */
export function buildContentUnderstandingPrompt(input: ContentUnderstandingInput): {
  systemInstruction: string;
  userPrompt: string;
} {
  const metadataStr = input.metadata && Object.keys(input.metadata).length > 0
    ? `\nMETADATA:\n${JSON.stringify(input.metadata, null, 2)}`
    : "";

  const urlStr = input.url ? `\nSOURCE URL: ${input.url}` : "";
  const mediaTypeStr = input.mediaType ? `\nHINTED MEDIA TYPE: ${input.mediaType}` : "";

  const userPrompt = `Analyze the following ingested content and produce a structured knowledge extraction matching the JSON schema below.

INPUT DETAILS:${urlStr}${mediaTypeStr}${metadataStr}

RAW CONTENT:
"""
${input.text.trim()}
"""

EXTRACTION REQUIREMENTS:
1. "title": Crisp, descriptive title summarizing the subject.
2. "summary": Information-dense, executive summary capturing core arguments, data points, and conclusions.
3. "sourceType": Classify accurately as one of: "youtube" | "instagram" | "article" | "audio" | "document" | "note".
4. "sourceUrl": The original URL if available (or omit if null).
5. "concepts": 3-7 core mental models, principles, or technical concepts discussed.
6. "topics": High-level subject domains (e.g. "Artificial Intelligence", "Distributed Systems", "Health", "Investing").
7. "tags": 4-10 lowercase search-optimized tags (e.g. ["gemini", "rest-api", "rag"]).
8. "entities": Named entities with their type (e.g. Person, Company, Product, Framework, City) and concise context.
9. "actionableTasks": Direct actionable to-dos, experiments, workflows to implement, or follow-ups explicitly or strongly implied by the content. If none exist, return [].
   - "title": Imperative task name (e.g. "Review Gemini 2.0 Flash REST docs").
   - "description": Contextual instructions.
   - "priority": "low" | "medium" | "high".
   - "dueDate": Optional ISO date string if a deadline is mentioned.
10. "candidatePersonalMemories":
    *** CRITICAL MEMORY RULE ***
    - SAVED CONTENT IS EXTERNAL KNOWLEDGE (Layer A) AND MUST NEVER AUTOMATICALLY BECOME PERMANENT PERSONAL MEMORY (Layer B)!
    - Do NOT create memories simply because the user read, saved, or bookmarked an article or video.
    - ONLY propose a candidate memory if the text directly records an explicit user preference ("I prefer dark mode"), identity attribute ("I am a senior backend engineer"), personal project ("Working on project Vyavastha"), relationship ("Meeting with partner Alice"), or immutable fact about the user.
    - If the content is purely external knowledge, tutorials, or third-party media, you MUST return an empty array [].
    - For any candidate memory proposed:
      - "category": "preference" | "identity" | "project" | "relationship" | "fact"
      - "key": Normalized snake_case key (e.g. "favorite_programming_language", "active_project_vyavastha")
      - "value": The extracted fact
      - "confidenceScore": Calibrated confidence between 0.0 and 1.0
      - "reason": Clear rationale why this is a personal memory rather than general knowledge
      - "confirmedByUser": MUST BE false (all candidates require explicit user confirmation)

Return ONLY valid JSON matching this structure.`;

  return {
    systemInstruction: CONTENT_UNDERSTANDING_SYSTEM_INSTRUCTION,
    userPrompt,
  };
}
