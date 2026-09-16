import { WEEKLY_REVIEW_SYSTEM_INSTRUCTION } from "../config";
import type { WeeklyReviewInput } from "../types";

/**
 * Builds the system instruction and user prompt for Weekly Reflective Review synthesis.
 */
export function buildWeeklyReviewPrompt(input: WeeklyReviewInput): {
  systemInstruction: string;
  userPrompt: string;
} {
  const { stats, recentKnowledge, recentTasks, recentMemories } = input;

  const statsStr = JSON.stringify(stats, null, 2);

  const knowledgeStr =
    recentKnowledge && recentKnowledge.length > 0
      ? recentKnowledge
          .map(
            (k, idx) =>
              `${idx + 1}. [${k.title}] ${k.summary || "No summary"} ${
                k.tags && k.tags.length > 0 ? `(Tags: ${k.tags.join(", ")})` : ""
              }`
          )
          .join("\n")
      : "No new knowledge ingested this week.";

  const tasksStr =
    recentTasks && recentTasks.length > 0
      ? recentTasks
          .map(
            (t, idx) =>
              `${idx + 1}. [${t.status?.toUpperCase() || "PENDING"}] ${t.title}${
                t.description ? ` - ${t.description}` : ""
              }`
          )
          .join("\n")
      : "No tasks recorded this week.";

  const memoriesStr =
    recentMemories && recentMemories.length > 0
      ? recentMemories
          .map(
            (m, idx) =>
              `${idx + 1}. [${m.category || "fact"}] ${m.key}: ${m.value}`
          )
          .join("\n")
      : "No new memories formed this week.";

  const userPrompt = `Conduct a comprehensive longitudinal weekly review of the user's personal operating system.

WEEKLY TELEMETRY & STATS:
${statsStr}

RECENTLY INGESTED KNOWLEDGE:
${knowledgeStr}

TASK & INTENTION ACTIVITY:
${tasksStr}

PERSONAL MEMORY LOGS:
${memoriesStr}

SYNTHESIS REQUIREMENTS:
Synthesize this into a structured JSON review with four core sections:
1. "narrative": A rich, cohesive 2-4 paragraph intellectual reflection on the week. Capture themes, intellectual momentum, challenges, and overall cognitive velocity.
2. "keyLearnings": 3-7 distilled, high-signal conceptual insights learned from this week's saved knowledge.
3. "activeIntentions": 3-6 forward-looking commitments, open task loops, or project priorities to carry into the upcoming week.
4. "identityShifts": 2-5 subtle evolutionary shifts observed in habits, focus, preferences, or personal identity based on memories and behavior.

Return ONLY valid JSON matching this schema:
{
  "narrative": "...",
  "keyLearnings": ["..."],
  "activeIntentions": ["..."],
  "identityShifts": ["..."]
}`;

  return {
    systemInstruction: WEEKLY_REVIEW_SYSTEM_INSTRUCTION,
    userPrompt,
  };
}
