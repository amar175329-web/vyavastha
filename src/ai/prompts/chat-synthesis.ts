import { CHAT_SYNTHESIS_SYSTEM_INSTRUCTION } from "../config";
import type { ChatSynthesisInput } from "../types";

/**
 * Builds the system instruction and user prompt for Grounded Chat Synthesis.
 */
export function buildChatSynthesisPrompt(input: ChatSynthesisInput): {
  systemInstruction: string;
  userPrompt: string;
} {
  const { query, conversationHistory, retrievedContext } = input;

  // Format retrieved knowledge (Layer A)
  const knowledgeStr =
    retrievedContext.knowledge && retrievedContext.knowledge.length > 0
      ? retrievedContext.knowledge
          .map(
            (k, idx) =>
              `[K${idx + 1}] ID: ${k.id} | Title: "${k.title}"${
                k.sourceUrl ? ` | URL: ${k.sourceUrl}` : ""
              }\nSummary: ${k.summary || k.snippet || "No summary provided"}`
          )
          .join("\n\n")
      : "None retrieved.";

  // Format personal memory (Layer B)
  const memoriesStr =
    retrievedContext.memories && retrievedContext.memories.length > 0
      ? retrievedContext.memories
          .map(
            (m, idx) =>
              `[M${idx + 1}] ID: ${m.id} | Key: "${m.key}" | Value: "${m.value}"${
                m.category ? ` | Category: ${m.category}` : ""
              }${m.confirmedByUser ? " (Confirmed by User)" : " (Provisional Candidate)"}`
          )
          .join("\n")
      : "None retrieved.";

  // Format tasks (Layer C)
  const tasksStr =
    retrievedContext.tasks && retrievedContext.tasks.length > 0
      ? retrievedContext.tasks
          .map(
            (t, idx) =>
              `[T${idx + 1}] ID: ${t.id} | Title: "${t.title}" | Status: ${t.status || "pending"}${
                t.dueDate ? ` | Due: ${t.dueDate}` : ""
              }${t.description ? `\nDescription: ${t.description}` : ""}`
          )
          .join("\n\n")
      : "None retrieved.";

  // Format dialogue history
  const historyStr =
    conversationHistory && conversationHistory.length > 0
      ? conversationHistory
          .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
          .join("\n")
      : "No prior conversation.";

  const userPrompt = `You are answering a query within VYAVASTHA Personal OS.

RETRIEVED CONTEXT:
--- LAYER A: SAVED KNOWLEDGE ---
${knowledgeStr}

--- LAYER B: PERSONAL MEMORIES ---
${memoriesStr}

--- LAYER C: TASKS & INTENTIONS ---
${tasksStr}

--- CONVERSATION HISTORY ---
${historyStr}

--- USER QUERY ---
${query}

INSTRUCTIONS:
1. Synthesize a comprehensive, executive response grounded firmly in the retrieved context.
2. If the user asks about their identity, preferences, or personal facts, prioritize Layer B (Personal Memories).
3. If the user asks about external subjects, articles, or resources, prioritize Layer A (Saved Knowledge).
4. If the user asks about to-dos, deadlines, or actionable commitments, prioritize Layer C (Tasks).
5. If the retrieved context does not contain sufficient information to answer truthfully, state clearly what is missing without inventing fake facts.
6. Provide citations for all items used in formulating your answer. Each citation must have:
   - "id": The exact ID of the referenced item.
   - "type": "knowledge" | "memory" | "task".
   - "title": The title, key, or concise name of the item.
7. Return strictly valid JSON matching:
{
  "reply": "Your clear, direct, and structured response in markdown",
  "citations": [
    { "id": "...", "type": "knowledge", "title": "..." }
  ]
}`;

  return {
    systemInstruction: CHAT_SYNTHESIS_SYSTEM_INSTRUCTION,
    userPrompt,
  };
}
