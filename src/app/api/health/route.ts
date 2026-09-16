import { NextResponse } from "next/server";
import { pingDatabase } from "@/db/client";
import { checkDiskHeadroom } from "@/lib/disk";

export const dynamic = "force-dynamic";

/**
 * Health check endpoint for VYAVASTHA.
 * Verifies core application status, live Turso database ping, and disk safety headroom.
 * Truthful reporting: Un-tested or deferred subsystems (Telegram daemon, Gemini, extractors)
 * are marked explicitly as NOT IMPLEMENTED / NOT TESTED rather than faking a connected state.
 */
export async function GET() {
  const [dbPing, diskCheck] = await Promise.all([
    pingDatabase(),
    checkDiskHeadroom(),
  ]);

  const isHealthy = dbPing.ok;

  const responseBody = {
    status: isHealthy ? "ok" : "degraded",
    phase: "Phase 6 Foundation",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      provider: "turso",
      name: dbPing.database,
      status: dbPing.ok ? "connected" : "unreachable",
      latencyMs: dbPing.latencyMs,
      ...(dbPing.error ? { error: dbPing.error } : {}),
    },
    disk: {
      status: diskCheck.ok ? "healthy" : "warning",
      availableMb: diskCheck.availableMb,
      requiredHeadroomMb: diskCheck.requiredMb,
      ...(diskCheck.reason ? { reason: diskCheck.reason } : {}),
    },
    subsystems: {
      telegramBot: "configured_not_started", // Polling worker scheduled for Phase 10
      geminiPerception: "configured_not_invoked", // Scheduled for Phase 8
      firecrawlExtractor: "configured_not_invoked", // Scheduled for Phase 9
      hybridSearch: "not_implemented", // Scheduled for Phase 11
    },
  };

  return NextResponse.json(responseBody, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
