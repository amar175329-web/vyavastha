import { describe, expect, test } from "bun:test";
import { Logger, redact, redactString, type LogEntry } from "../../src/lib/logger";

describe("Structured Logger & Secret Redaction (src/lib/logger.ts)", () => {
  test("outputs valid JSON with required metadata", () => {
    let recordedEntry: LogEntry | null = null;
    let recordedJson = "";

    const testLogger = new Logger((entry, formatted) => {
      recordedEntry = entry;
      recordedJson = formatted;
    });

    testLogger.info("System startup", { module: "core", version: "0.1.0" });

    expect(recordedEntry).not.toBeNull();
    const entry = recordedEntry as unknown as LogEntry;
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("System startup");
    expect(entry.context?.module).toBe("core");

    const parsed = JSON.parse(recordedJson);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("System startup");
    expect(parsed.timestamp).toBeDefined();
  });

  test("redacts sensitive keys in context objects", () => {
    let recordedJson = "";
    const testLogger = new Logger((_, formatted) => {
      recordedJson = formatted;
    });

    testLogger.info("User session created", {
      username: "admin",
      password: "SuperSecretPassword123",
      api_key: "fc-1234567890abcdef",
      authToken: "turso-auth-token-xyz",
    });

    expect(recordedJson).not.toContain("SuperSecretPassword123");
    expect(recordedJson).not.toContain("fc-1234567890abcdef");
    expect(recordedJson).not.toContain("turso-auth-token-xyz");

    const parsed = JSON.parse(recordedJson);
    expect(parsed.context.password).toBe("[REDACTED]");
    expect(parsed.context.api_key).toBe("[REDACTED]");
    expect(parsed.context.authToken).toBe("[REDACTED]");
    expect(parsed.context.username).toBe("admin");
  });

  test("redacts Telegram bot token patterns in messages and strings", () => {
    const rawMsg = "Connecting with token 9999999999:TESTpatternToken1234567890abcdefABCDEF to Telegram gateway";
    const cleaned = redactString(rawMsg);

    expect(cleaned).not.toContain("TESTpatternToken1234567890abcdefABCDEF");
    expect(cleaned).toContain("[REDACTED_TELEGRAM_TOKEN]");
  });

  test("redacts Bearer authentication tokens", () => {
    const rawAuth = "Authorization header Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const cleaned = redactString(rawAuth);

    expect(cleaned).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(cleaned).toContain("Bearer [REDACTED_TOKEN]");
  });

  test("deeply redacts nested structures and error objects", () => {
    const nestedData = {
      user: {
        id: "123",
        credentials: {
          session_secret: "raw_secret_here",
          activeTokens: ["tok_1234567890", "tok_0987654321"],
        },
      },
    };

    const redacted = redact(nestedData) as any;
    expect(redacted.user.credentials.session_secret).toBe("[REDACTED]");
  });

  test("captures and logs errors safely without leaking sensitive stack tokens", () => {
    let recordedEntry: LogEntry | null = null;
    const testLogger = new Logger((entry) => {
      recordedEntry = entry;
    });

    const errorWithToken = new Error("Failed to authenticate with token 9999999999:TESTpatternToken1234567890abcdefABCDEF");
    testLogger.error("Authentication error occurred", errorWithToken);

    expect(recordedEntry).not.toBeNull();
    const entry = recordedEntry as unknown as LogEntry;
    expect(entry.error?.message).not.toContain("TESTpatternToken1234567890abcdefABCDEF");
    expect(entry.error?.message).toContain("[REDACTED_TELEGRAM_TOKEN]");
  });
});
