import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/db/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const repo = getRepository();
    const item = await repo.getKnowledgeById(id);

    if (!item) {
      return NextResponse.json({ error: "Knowledge item not found" }, { status: 404 });
    }

    const [allMemories, allTasks] = await Promise.all([
      repo.listMemories(),
      repo.listTasks(),
    ]);

    const relatedMemories = allMemories
      .filter((m) => m.provenanceSourceId === id)
      .map((m) => ({ id: m.id, key: m.key, value: m.value, category: m.category }));

    const relatedTasks = allTasks
      .filter((t) => t.sourceKnowledgeId === id)
      .map((t) => ({ id: t.id, title: t.title, status: t.status }));

    return NextResponse.json({
      item,
      relatedMemories,
      relatedTasks,
    });
  } catch (error) {
    console.error("[API/Knowledge/[id]] GET error:", error);
    return NextResponse.json({ error: "Failed to retrieve knowledge item" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const repo = getRepository();
    const success = await repo.deleteKnowledge(id);

    if (!success) {
      return NextResponse.json({ error: "Knowledge item not found" }, { status: 404 });
    }

    await repo.logActivity({
      channel: "web",
      eventType: "knowledge_deleted",
      metadata: { id },
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[API/Knowledge/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete knowledge item" }, { status: 500 });
  }
}
