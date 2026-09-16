import { NextResponse } from "next/server";
import { getRepository } from "@/db/repository";
import { AiService } from "@/ai/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function generateReviewData() {
  const repo = getRepository();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [dbSummary, knowledgeItems, tasks, memories] = await Promise.all([
    repo.generateWeeklyReview({ startDate: weekAgo, endDate: now }),
    repo.listKnowledge({ limit: 10 }),
    repo.listTasks({ limit: 15 }),
    repo.listMemories({ limit: 15 }),
  ]);

  const keyKnowledge = knowledgeItems.map((k) => ({
    id: k.id,
    title: k.title,
    summary: k.summary,
    mediaType: k.mediaType,
  }));

  const intentionsInMotion = tasks
    .filter((t) => t.status === "pending" || t.status === "in_progress")
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate ? t.dueDate.toISOString() : undefined,
    }));

  const memoryAdjustments = memories.map((m) => ({
    id: m.id,
    key: m.key,
    value: m.value,
    category: m.category,
    confirmedByUser: m.confirmedByUser,
  }));

  let reflectiveSynthesis = "";

  // Attempt deep AI reflection synthesis
  try {
    const aiService = new AiService();
    const aiResult = await aiService.generateReflectiveReview({
      stats: {
        periodStart: weekAgo,
        periodEnd: now,
        itemsIngested: dbSummary.itemsIngested,
        tasksCreated: dbSummary.tasksCreated,
        tasksCompleted: dbSummary.tasksCompleted,
        memoriesFormed: dbSummary.memoriesFormed,
      },
      recentKnowledge: knowledgeItems.map((k) => ({
        id: k.id,
        title: k.title,
        summary: k.summary,
        tags: k.tags,
      })),
      recentTasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        description: t.description,
      })),
      recentMemories: memories.map((m) => ({
        id: m.id,
        category: m.category,
        key: m.key,
        value: m.value,
      })),
    });

    const parts = [aiResult.narrative];
    if (aiResult.keyLearnings && aiResult.keyLearnings.length > 0) {
      parts.push("\n**Key Intellectual Learnings:**\n" + aiResult.keyLearnings.map((l) => `• ${l}`).join("\n"));
    }
    if (aiResult.identityShifts && aiResult.identityShifts.length > 0) {
      parts.push("\n**Identity & Preference Rhythms:**\n" + aiResult.identityShifts.map((s) => `• ${s}`).join("\n"));
    }
    reflectiveSynthesis = parts.join("\n\n");
  } catch (aiErr) {
    logger.warn("[API/Review] AI reflective synthesis unavailable, using deterministic summary", {
      error: String(aiErr),
    });

    const totalIngested = dbSummary.itemsIngested;
    const completedTasks = dbSummary.tasksCompleted;
    const activeCount = intentionsInMotion.length;

    reflectiveSynthesis =
      `During this 7-day period, VYAVASTHA recorded **${totalIngested} captured item${totalIngested !== 1 ? "s" : ""}**, ` +
      `**${completedTasks} completed intention${completedTasks !== 1 ? "s" : ""}**, and currently holds ` +
      `**${activeCount} intention${activeCount !== 1 ? "s" : ""} in motion**.\n\n` +
      `Your intellectual velocity and capture habits remain steady. Continue confirming proposed personal memories ` +
      `to strengthen your identity grounding while keeping your intention queue focused on high-leverage execution.`;
  }

  return {
    periodStart: weekAgo.toISOString(),
    periodEnd: now.toISOString(),
    itemsIngested: dbSummary.itemsIngested,
    tasksCreated: dbSummary.tasksCreated,
    tasksCompleted: dbSummary.tasksCompleted,
    memoriesFormed: dbSummary.memoriesFormed,
    keyKnowledge,
    intentionsInMotion,
    memoryAdjustments,
    reflectiveSynthesis,
  };
}

export async function GET() {
  try {
    const review = await generateReviewData();
    return NextResponse.json(review);
  } catch (error) {
    console.error("[API/Review] GET error:", error);
    return NextResponse.json({ error: "Failed to generate weekly review" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const review = await generateReviewData();
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    console.error("[API/Review] POST error:", error);
    return NextResponse.json({ error: "Failed to generate weekly review" }, { status: 500 });
  }
}
