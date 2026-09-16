/**
 * VYAVASTHA — Telegram Webhook Handler
 *
 * Next.js Route Handler for receiving real-time Telegram updates.
 * Validates optional secret token headers, enforces owner authentication,
 * and delegates update processing to the Telegram Update Router.
 */

import { NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/bot/router";
import type { TelegramUpdate } from "@/bot/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Health & diagnostic inspection endpoint for Telegram webhook connectivity.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    subsystem: "telegram-webhook",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Ingestion handler for incoming Telegram Bot API webhook updates.
 */
export async function POST(request: Request) {
  // 1. Optional Webhook Secret Token Verification
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (configuredSecret) {
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== configuredSecret) {
      logger.warn("[WEBHOOK] Unauthorized webhook invocation — secret mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 2. Parse payload
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch (err) {
    logger.warn("[WEBHOOK] Received invalid JSON payload", { error: String(err) });
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!update || typeof update !== "object" || typeof update.update_id !== "number") {
    logger.warn("[WEBHOOK] Payload does not match TelegramUpdate schema");
    return NextResponse.json({ error: "Malformed update payload" }, { status: 400 });
  }

  // 3. Process update through router
  try {
    const result = await handleTelegramUpdate(update);
    return NextResponse.json({
      ok: true,
      action: result.action,
      status: result.status,
    });
  } catch (err) {
    logger.error("[WEBHOOK] Unhandled error during Telegram update processing", err, {
      updateId: update.update_id,
    });
    // Return HTTP 200 to prevent Telegram from continuously retrying problematic updates
    return NextResponse.json({
      ok: true,
      error: "Internal processing error",
    });
  }
}
