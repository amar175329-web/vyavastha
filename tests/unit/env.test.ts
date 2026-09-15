import { describe, expect, test } from "bun:test";
import { validateEnv, getEnv } from "../../src/lib/env";

describe("Environment Validator (src/lib/env.ts)", () => {
  const validMockEnv = {
    DATABASE_PROVIDER: "turso",
    TURSO_DATABASE_URL: "libsql://vyavastha-mock.turso.io",
    TURSO_AUTH_TOKEN: "mock_turso_auth_token_value_12345678",
    TELEGRAM_BOT_TOKEN: "123456789:ABCDEF_mock_telegram_bot_token_34chars",
    ALLOWED_TELEGRAM_USER_ID: "987654321",
    TELEGRAM_CHAT_ID: "987654321",
    GEMINI_API_KEY: "AIzaSyMockGeminiKey_1234567890abcdef",
    FIRECRAWL_API_KEY: "fc-mock_key_1234567890",
    APP_MASTER_PASSWORD: "SuperSecureMasterPassword123!",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
    PORT: "3000",
  };

  test("validates a complete valid environment configuration", () => {
    const parsed = validateEnv(validMockEnv);
    expect(parsed.DATABASE_PROVIDER).toBe("turso");
    expect(parsed.TURSO_DATABASE_URL).toBe(validMockEnv.TURSO_DATABASE_URL);
    expect(parsed.ALLOWED_TELEGRAM_USER_ID).toBe("987654321");
    expect(parsed.PORT).toBe("3000");
  });

  test("fails when required variable is missing", () => {
    const invalidEnv = { ...validMockEnv, TURSO_DATABASE_URL: "" };
    expect(() => validateEnv(invalidEnv)).toThrow("TURSO_DATABASE_URL");
  });

  test("fails when ALLOWED_TELEGRAM_USER_ID is not numeric", () => {
    const invalidEnv = { ...validMockEnv, ALLOWED_TELEGRAM_USER_ID: "not-a-number" };
    expect(() => validateEnv(invalidEnv)).toThrow("ALLOWED_TELEGRAM_USER_ID must be a numeric string");
  });

  test("fails when APP_MASTER_PASSWORD is too short", () => {
    const invalidEnv = { ...validMockEnv, APP_MASTER_PASSWORD: "short" };
    expect(() => validateEnv(invalidEnv)).toThrow("APP_MASTER_PASSWORD must be at least 8 characters");
  });

  test("never leaks secret values in error messages", () => {
    const sensitiveSecret = "SuperSecretLeakedVal999!";
    const invalidEnv = {
      ...validMockEnv,
      APP_MASTER_PASSWORD: "short", // this fails
      SESSION_SECRET: sensitiveSecret, // this is valid, must not be exposed in the error
    };

    try {
      validateEnv(invalidEnv);
      expect(true).toBe(false); // Should not reach here
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      expect(errorMsg).not.toContain(sensitiveSecret);
      expect(errorMsg).toContain("APP_MASTER_PASSWORD");
    }
  });

  test("successfully loads and validates real environment configuration", () => {
    const env = getEnv();
    expect(env.DATABASE_PROVIDER).toBe("turso");
    expect(env.TURSO_DATABASE_URL.length).toBeGreaterThan(5);
    expect(env.ALLOWED_TELEGRAM_USER_ID).toMatch(/^\d+$/);
  });
});
