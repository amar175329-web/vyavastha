import { NextResponse } from "next/server";
import { getWeeklyReviewData } from "../_data/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const review = getWeeklyReviewData();
    return NextResponse.json(review);
  } catch (error) {
    console.error("[API/Review] GET error:", error);
    return NextResponse.json({ error: "Failed to generate weekly review" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const review = getWeeklyReviewData();
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    console.error("[API/Review] POST error:", error);
    return NextResponse.json({ error: "Failed to generate weekly review" }, { status: 500 });
  }
}
