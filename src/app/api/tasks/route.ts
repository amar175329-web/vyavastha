import { NextRequest, NextResponse } from "next/server";
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  type TaskItem,
} from "../_data/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;

    const items = listTasks({ status, search });
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("[API/Tasks] GET error:", error);
    return NextResponse.json({ error: "Failed to list tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, status, sourceKnowledgeId, dueDate } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const validStatuses: TaskItem["status"][] = ["pending", "in_progress", "completed", "cancelled"];
    const resolvedStatus: TaskItem["status"] = validStatuses.includes(status) ? status : "pending";

    const item = createTask({
      title,
      description,
      status: resolvedStatus,
      sourceKnowledgeId,
      dueDate,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[API/Tasks] POST error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, title, description, dueDate } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const updated = updateTask(id, {
      status,
      title,
      description,
      dueDate,
    });

    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("[API/Tasks] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const success = deleteTask(id);
    if (!success) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[API/Tasks] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
