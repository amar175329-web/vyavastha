import { NextRequest, NextResponse } from "next/server";
import { getRepository, type KnowledgeItem } from "@/db/repository";
import { processUnifiedIngestion } from "@/ingestion/unified";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined;

    const repo = getRepository();
    const items = await repo.listKnowledge({ type, search, limit, offset });
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("[API/Knowledge] GET error:", error);
    return NextResponse.json({ error: "Failed to list knowledge items" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, summary, mediaType, sourceUrl, rawContent, tags, payload, type } = body;

    const repo = getRepository();

    // If ingestion request format or raw URL is provided without complete manual fields
    if (payload || (!title && sourceUrl)) {
      const targetPayload = payload || sourceUrl;
      const targetType = type || (sourceUrl ? "url" : "text");
      const ingestResult = await processUnifiedIngestion({
        type: targetType,
        payload: targetPayload,
        source: "web",
      });
      return NextResponse.json({ item: ingestResult.knowledgeItem }, { status: 201 });
    }

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

    const item = await repo.createKnowledge({
      title: title.trim(),
      summary: summary.trim(),
      mediaType: resolvedType,
      sourceUrl,
      rawContent,
      tags: Array.isArray(tags) ? tags : [],
    });

    await repo.logActivity({
      channel: "web",
      eventType: "knowledge_created",
      metadata: { id: item.id, title: item.title, mediaType: item.mediaType },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[API/Knowledge] POST error:", error);
    return NextResponse.json({ error: "Failed to create knowledge item" }, { status: 500 });
  }
}
