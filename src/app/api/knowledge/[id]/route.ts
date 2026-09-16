import { NextRequest, NextResponse } from "next/server";
import { getKnowledgeById, deleteKnowledge } from "../../_data/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const data = getKnowledgeById(id);

    if (!data.item) {
      return NextResponse.json({ error: "Knowledge item not found" }, { status: 404 });
    }

    return NextResponse.json(data);
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
    const success = deleteKnowledge(id);

    if (!success) {
      return NextResponse.json({ error: "Knowledge item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[API/Knowledge/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete knowledge item" }, { status: 500 });
  }
}
