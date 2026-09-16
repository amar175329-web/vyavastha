import { NextRequest, NextResponse } from "next/server";
import {
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  type PersonalMemoryItem,
} from "../_data/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const search = searchParams.get("search") || undefined;

    const items = listMemories({ category, search });
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

    const item = createMemory({
      category: resolvedCategory,
      key,
      value,
      provenanceSourceId,
      confidenceScore,
      confirmedByUser,
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

    const updated = updateMemory(id, {
      confirmedByUser,
      value,
      key,
      category,
      confidenceScore,
    });

    if (!updated) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

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

    const success = deleteMemory(id);
    if (!success) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[API/Memory] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}
