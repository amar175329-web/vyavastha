import { z } from "zod";

/**
 * Type-safe environment schema for VYAVASTHA.
 * Enforces strict validation of all required infrastructure credentials on startup.
 * NEVER print or log secret values in error messages or exceptions.
 */
export const envSchema = z.object({
  // Database Configuration (Turso / libSQL)
  DATABASE_PROVIDER: z.enum(["turso"]).default("turso"),
  TURSO_DATABASE_URL: z.string().min(1, "TURSO_DATABASE_URL is required"),
  TURSO_AUTH_TOKEN: z.string().min(1, "TURSO_AUTH_TOKEN is required"),

  // Ingestion & Telegram Bot (@VyavasthaMemoryBot)
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  ALLOWED_TELEGRAM_USER_ID: z.string().regex(/^\d+$/, "ALLOWED_TELEGRAM_USER_ID must be a numeric string"),
  TELEGRAM_CHAT_ID: z.string().regex(/^-?\d+$/, "TELEGRAM_CHAT_ID must be a numeric string"),

  // AI & Multimodal Intelligence (Google Gemini)
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),

  // Web Scraping & Fallback Extraction (Firecrawl)
  FIRECRAWL_API_KEY: z.string().min(1, "FIRECRAWL_API_KEY is required"),

  // Web Application Security & Master Access
  APP_MASTER_PASSWORD: z.string().min(8, "APP_MASTER_PASSWORD must be at least 8 characters"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),

  // Runtime Environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.string().regex(/^\d+$/).default("3000"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Validates a dictionary of environment variables safely.
 * Throws a sanitized Error containing only the names of invalid/missing keys.
 * Secret values are NEVER included in the exception message.
 */
export function validateEnv(rawEnv: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => {
        const fieldName = issue.path.join(".");
        return `${fieldName}: ${issue.message}`;
      })
      .join("; ");

    throw new Error(`[VYAVASTHA] Environment validation failed: ${errorDetails}`);
  }

  return result.data;
}

/**
 * Retrieves the validated environment configuration.
 * Caches the result in memory after the first successful validation.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv(process.env);
  }
  return cachedEnv;
}

/**
 * Clears cached environment in testing environments.
 */
export function resetEnvCache(): void {
  cachedEnv = null;
}
