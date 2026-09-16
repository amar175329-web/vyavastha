import { NextRequest, NextResponse } from "next/server";
import { searchAll, listKnowledge, listMemories, listTasks } from "../_data/store";

export const dynamic = "force-dynamic";

export interface Citation {
  id: string;
  type: "knowledge" | "memory" | "task";
  title: string;
  snippet: string;
  url?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const q = message.trim();
    const lower = q.toLowerCase();

    // Special queries: tasks, memory, recent knowledge
    const citations: Citation[] = [];
    let responseText = "";

    if (lower.includes("task") || lower.includes("todo") || lower.includes("intention") || lower.includes("pending")) {
      const allTasks = listTasks();
      const pendingTasks = allTasks.filter((t) => t.status === "pending" || t.status === "in_progress");

      if (pendingTasks.length === 0) {
        responseText = "You currently have no pending tasks or intentions. All tracked items are either completed or your task list is clear.";
      } else {
        responseText = `You have **${pendingTasks.length} active intention${pendingTasks.length > 1 ? "s" : ""}** in motion:\n\n` +
          pendingTasks.map((t, idx) => {
            const due = t.dueDate ? ` *(due ${new Date(t.dueDate).toLocaleDateString()})*` : "";
            const statusBadge = t.status === "in_progress" ? " `[in progress]`" : "";
            return `${idx + 1}. **${t.title}**${statusBadge}${due}${t.description ? ` — ${t.description}` : ""}`;
          }).join("\n");

        for (const t of pendingTasks.slice(0, 4)) {
          citations.push({
            id: t.id,
            type: "task",
            title: t.title,
            snippet: t.description || `Task status: ${t.status}`,
          });
        }
      }
    } else if (lower.includes("memory") || lower.includes("preference") || lower.includes("identity") || lower.includes("who am i")) {
      const allMemories = listMemories();

      if (allMemories.length === 0) {
        responseText = "No personal memory assertions have been recorded yet. As you ingest notes or confirm facts in the Memory workshop, your identity and preference profile will appear here.";
      } else {
        responseText = `Here are your confirmed and recorded personal memory assertions:\n\n` +
          allMemories.map((m) => {
            const badge = m.confirmedByUser ? "✓ Confirmed" : "Proposed";
            return `• **${m.key}**: ${m.value} *(${m.category}, ${badge})*`;
          }).join("\n");

        for (const m of allMemories.slice(0, 4)) {
          citations.push({
            id: m.id,
            type: "memory",
            title: m.key,
            snippet: m.value,
          });
        }
      }
    } else {
      // General semantic / lexical lookup
      const searchResults = searchAll(q);

      if (
        searchResults.knowledge.length === 0 &&
        searchResults.memories.length === 0 &&
        searchResults.tasks.length === 0
      ) {
        const totalKnowledge = listKnowledge();
        if (totalKnowledge.length === 0) {
          responseText = `I searched your personal knowledge base, but your library is currently empty.\n\nYou can ingest articles, YouTube videos, Instagram posts, or write raw notes in the **Library** (` + "`/library`" + `) to begin querying your personal knowledge.`;
        } else {
          responseText = `I searched your personal knowledge library for "${q}", but found no direct matches across your ${totalKnowledge.length} saved item(s) or memory records.\n\nTry searching for broader keywords, or check your **Library** tab directly.`;
        }
      } else {
        const sections: string[] = [];

        if (searchResults.knowledge.length > 0) {
          sections.push(
            `### From Your Saved Knowledge:\n` +
              searchResults.knowledge
                .map((k) => `• **${k.title}** (${k.mediaType}): ${k.summary}`)
                .join("\n\n")
          );

          for (const k of searchResults.knowledge) {
            citations.push({
              id: k.id,
              type: "knowledge",
              title: k.title,
              snippet: k.summary,
              url: k.sourceUrl,
            });
          }
        }

        if (searchResults.memories.length > 0) {
          sections.push(
            `### From Your Personal Memory:\n` +
              searchResults.memories.map((m) => `• **${m.key}**: ${m.value}`).join("\n")
          );

          for (const m of searchResults.memories) {
            citations.push({
              id: m.id,
              type: "memory",
              title: m.key,
              snippet: m.value,
            });
          }
        }

        if (searchResults.tasks.length > 0) {
          sections.push(
            `### Related Intentions:\n` +
              searchResults.tasks.map((t) => `• [${t.status}] **${t.title}**`).join("\n")
          );

          for (const t of searchResults.tasks) {
            citations.push({
              id: t.id,
              type: "task",
              title: t.title,
              snippet: t.description || `Status: ${t.status}`,
            });
          }
        }

        responseText = sections.join("\n\n");
      }
    }

    return NextResponse.json({
      response: responseText,
      citations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API/Chat] POST error:", error);
    return NextResponse.json({ error: "Failed to process chat message" }, { status: 500 });
  }
}
