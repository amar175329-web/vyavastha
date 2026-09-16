import { NextRequest, NextResponse } from "next/server";
import { getRepository, type PersonalMemoryItem } from "@/db/repository";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const search = searchParams.get("search") || undefined;

    const repo = getRepository();
    const items = await repo.listMemories({ category, search });
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("[API/Memory] GET error:", error);
    return NextResponse.json({ error: "Failed to list memories" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, key, value, provenanceSourceId, confidenceScore, confirmedByUser } = body;

    if (!key || typeof key !== "string" || !key.trim()) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    if (!value || typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ error: "Value is required" }, { status: 400 });
    }

    const validCategories: PersonalMemoryItem["category"][] = [
      "preference",
      "identity",
      "project",
      "relationship",
      "fact",
    ];

    const resolvedCategory: PersonalMemoryItem["category"] = validCategories.includes(category)
      ? category
      : "fact";

    const repo = getRepository();
    const item = await repo.createMemory({
      category: resolvedCategory,
      key: key.trim(),
      value: value.trim(),
      provenanceSourceId,
      confidenceScore: typeof confidenceScore === "number" ? confidenceScore : 1.0,
      confirmedByUser: Boolean(confirmedByUser),
    });

    await repo.logActivity({
      channel: "web",
      eventType: "memory_created",
      metadata: { id: item.id, key: item.key, category: item.category },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[API/Memory] POST error:", error);
    return NextResponse.json({ error: "Failed to create memory" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, confirmedByUser, value, key, category, confidenceScore } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Memory ID is required" }, { status: 400 });
    }

    const repo = getRepository();
    const updated = await repo.updateMemory(id, {
      confirmedByUser,
      value,
      key,
      category,
      confidenceScore,
    });

    if (!updated) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    await repo.logActivity({
      channel: "web",
      eventType: "memory_updated",
      metadata: { id, confirmedByUser: updated.confirmedByUser },
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("[API/Memory] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Memory ID is required" }, { status: 400 });
    }

    const repo = getRepository();
    const success = await repo.deleteMemory(id);
    if (!success) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    await repo.logActivity({
      channel: "web",
      eventType: "memory_deleted",
      metadata: { id },
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[API/Memory] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}
