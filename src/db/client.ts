import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getEnv } from "../lib/env";
import { logger } from "../lib/logger";

let clientInstance: Client | null = null;

/**
 * Gets or creates the singleton Turso libSQL client.
 * Connects exclusively to the configured VYAVASTHA database.
 */
export function getLibsqlClient(): Client {
  if (!clientInstance) {
    const env = getEnv();
    clientInstance = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });
    logger.debug("[DB] Turso libSQL client initialized");
  }
  return clientInstance;
}

/**
 * Singleton Drizzle ORM database instance.
 */
export function getDb() {
  return drizzle(getLibsqlClient());
}

export interface DatabasePingResult {
  ok: boolean;
  latencyMs: number;
  database: string;
  error?: string;
}

/**
 * Probes live Turso database connectivity using a lightweight query.
 * Measures round-trip latency and returns truthful status without leaking credentials.
 */
export async function pingDatabase(): Promise<DatabasePingResult> {
  const start = performance.now();
  try {
    const client = getLibsqlClient();
    const res = await client.execute("SELECT 1 as alive;");
    const latencyMs = Math.round(performance.now() - start);

    const isAlive = res.rows.length > 0 && res.rows[0].alive === 1;
    if (isAlive) {
      return {
        ok: true,
        latencyMs,
        database: "vyavastha-db",
      };
    }

    return {
      ok: false,
      latencyMs,
      database: "vyavastha-db",
      error: "Unexpected ping response from database",
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[DB] Turso connectivity probe failed", err);

    return {
      ok: false,
      latencyMs,
      database: "vyavastha-db",
      error: message,
    };
  }
}
