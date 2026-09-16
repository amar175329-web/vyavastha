import { NextRequest, NextResponse } from "next/server";
import { listKnowledge, createKnowledge, type KnowledgeItem } from "../_data/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;

    const items = listKnowledge({ type, search, limit });
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("[API/Knowledge] GET error:", error);
    return NextResponse.json({ error: "Failed to list knowledge items" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, summary, mediaType, sourceUrl, rawContent, tags } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!summary || typeof summary !== "string" || !summary.trim()) {
      return NextResponse.json({ error: "Summary is required" }, { status: 400 });
    }

    const validMediaTypes: KnowledgeItem["mediaType"][] = [
      "article",
      "youtube",
      "instagram",
      "note",
      "document",
      "audio",
    ];

    const resolvedType: KnowledgeItem["mediaType"] = validMediaTypes.includes(mediaType)
      ? mediaType
      : "note";

    const item = createKnowledge({
      title,
      summary,
      mediaType: resolvedType,
      sourceUrl,
      rawContent,
      tags,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[API/Knowledge] POST error:", error);
    return NextResponse.json({ error: "Failed to create knowledge item" }, { status: 500 });
  }
}
