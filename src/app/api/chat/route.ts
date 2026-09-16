import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/db/repository";
import { ChatRetriever } from "@/search/chat-retriever";
import { AiService } from "@/ai/service";
import { logger } from "@/lib/logger";
import type { RetrievedChatContext } from "@/ai/types";

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

    const query = message.trim();
    const repo = getRepository();
    const retriever = new ChatRetriever(repo);

    // Retrieve across Layers A, B, and C
    const retrieval = await retriever.retrieve(query);
    const hasItems = retrieval.items.length > 0;

    let responseText = "";
    let citations: Citation[] = [];

    // Map retrieved search items to default citations
    const defaultCitations: Citation[] = retrieval.items.slice(0, 5).map((item) => ({
      id: item.id,
      type: (item.layer === "knowledge" ? "knowledge" : item.layer === "memory" ? "memory" : "task") as Citation["type"],
      title: item.title,
      snippet: item.snippet,
      url: item.sourceUrl,
    }));

    if (!hasItems) {
      // Unrelated query or empty repository: DO NOT FABRICATE
      const [allK, allM, allT] = await Promise.all([
        repo.listKnowledge({ limit: 1 }),
        repo.listMemories({ limit: 1 }),
        repo.listTasks({ limit: 1 }),
      ]);

      const totalCount = allK.length + allM.length + allT.length;
      if (totalCount === 0) {
        responseText =
          "Your personal VYAVASTHA workshop is currently empty.\n\n" +
          "You can capture notes, save articles, or ingest URLs from the **Library** or via the **Telegram bot** to begin querying your second brain.";
      } else {
        responseText =
          `I searched your personal knowledge base, memories, and active tasks for **"${query}"**, but found no relevant records.\n\n` +
          "To preserve strict provenance and prevent hallucinations, I only provide answers grounded in your verified data. Try searching for other keywords, or capture this information into your Library.";
      }
      citations = [];
    } else {
      // Grounded AI synthesis with graceful fallback
      try {
        const aiService = new AiService();
        const structuredContext: RetrievedChatContext = {
          knowledge: retrieval.grouped.knowledge.map((k) => ({
            id: k.id,
            title: k.title,
            summary: k.snippet,
            snippet: k.snippet,
            sourceUrl: k.sourceUrl,
            mediaType: k.mediaType,
          })),
          memories: retrieval.grouped.memory.map((m) => ({
            id: m.id,
            category: m.category,
            key: m.title,
            value: m.snippet,
          })),
          tasks: retrieval.grouped.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.snippet,
            status: t.status,
          })),
        };

        const aiResponse = await aiService.synthesizeChatResponse({
          query,
          conversationHistory: [],
          retrievedContext: structuredContext,
        });

        responseText = aiResponse.reply;

        if (Array.isArray(aiResponse.citations) && aiResponse.citations.length > 0) {
          citations = aiResponse.citations.map((c) => {
            const found = retrieval.items.find((item) => item.id === c.id);
            const resolvedType: Citation["type"] =
              c.type === "memory" ? "memory" : c.type === "task" || c.type === "tasks" ? "task" : "knowledge";
            return {
              id: c.id,
              type: resolvedType,
              title: c.title,
              snippet: found ? found.snippet : c.title,
              url: found?.sourceUrl,
            };
          });
        } else {
          citations = defaultCitations;
        }
      } catch (aiErr) {
        logger.warn("[API/Chat] AI synthesis unavailable, falling back to grounded search summary", {
          error: String(aiErr),
        });

        // Fallback grounded answer built directly from retrieval
        const sections: string[] = [];

        if (retrieval.grouped.knowledge.length > 0) {
          sections.push(
            `### Saved Knowledge:\n` +
              retrieval.grouped.knowledge
                .map((k) => `• **${k.title}**: ${k.snippet}`)
                .join("\n\n")
          );
        }

        if (retrieval.grouped.memory.length > 0) {
          sections.push(
            `### Personal Memory:\n` +
              retrieval.grouped.memory.map((m) => `• **${m.title}**: ${m.snippet}`).join("\n")
          );
        }

        if (retrieval.grouped.tasks.length > 0) {
          sections.push(
            `### Active Intentions / Tasks:\n` +
              retrieval.grouped.tasks.map((t) => `• **${t.title}**: ${t.snippet}`).join("\n")
          );
        }

        responseText = sections.join("\n\n");
        citations = defaultCitations;
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
