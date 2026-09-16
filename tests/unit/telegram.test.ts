import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  validateTelegramSender,
  getUnauthorizedMessage,
  UNAUTHORIZED_REJECTION_MESSAGE,
} from "../../src/bot/auth";
import { TelegramClient, TelegramApiError, type TelegramFetchFn } from "../../src/bot/client";
import {
  formatKnowledgeSaved,
  formatMemoriesMessage,
  formatStartMessage,
  formatStatusMessage,
  formatTasksMessage,
  formatWeeklyReviewMessage,
} from "../../src/bot/formatter";
import {
  TelegramRouter,
  extractUrlFromMessage,
  detectUrlSubtype,
} from "../../src/bot/router";
import type { TelegramMessage, TelegramUpdate } from "../../src/bot/types";
import type { IngestionRequest } from "../../src/ingestion/types";
import { GET as webhookGET, POST as webhookPOST } from "../../src/app/api/telegram/webhook/route";

const TEST_USER_ID = process.env.ALLOWED_TELEGRAM_USER_ID || "8543209299";
const TEST_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8543209299";
const TEST_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456";

describe("Telegram Owner Authentication (src/bot/auth.ts)", () => {
  const authConfig = {
    allowedUserId: TEST_USER_ID,
    allowedChatId: TEST_CHAT_ID,
  };

  test("accepts matching user ID and chat ID as strings", () => {
    const isValid = validateTelegramSender(TEST_USER_ID, TEST_CHAT_ID, authConfig);
    expect(isValid).toBe(true);
  });

  test("accepts matching user ID and chat ID as numbers", () => {
    const isValid = validateTelegramSender(Number(TEST_USER_ID), Number(TEST_CHAT_ID), authConfig);
    expect(isValid).toBe(true);
  });

  test("rejects mismatched user ID with audit log", () => {
    const isValid = validateTelegramSender("111222333", TEST_CHAT_ID, authConfig);
    expect(isValid).toBe(false);
  });

  test("rejects mismatched chat ID with audit log", () => {
    const isValid = validateTelegramSender(TEST_USER_ID, "-100999999", authConfig);
    expect(isValid).toBe(false);
  });

  test("rejects missing, null, or undefined identifiers", () => {
    expect(validateTelegramSender(undefined, TEST_CHAT_ID, authConfig)).toBe(false);
    expect(validateTelegramSender(TEST_USER_ID, null, authConfig)).toBe(false);
    expect(validateTelegramSender(undefined, undefined, authConfig)).toBe(false);
  });

  test("provides clean standardized unauthorized rejection message", () => {
    const msg = getUnauthorizedMessage();
    expect(msg).toContain("Access Denied");
    expect(msg).toContain("single-user");
    expect(msg).toBe(UNAUTHORIZED_REJECTION_MESSAGE);
  });
});

describe("Telegram API Client (src/bot/client.ts)", () => {
  test("sendMessage dispatches formatted JSON payload to correct endpoint", async () => {
    let capturedUrl = "";
    let capturedBody: unknown = null;

    const mockFetch: TelegramFetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            message_id: 42,
            chat: { id: Number(TEST_CHAT_ID), type: "private" },
            date: Math.floor(Date.now() / 1000),
            text: "Hello World",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const client = new TelegramClient({
      token: TEST_TOKEN,
      fetchFn: mockFetch,
    });

    const res = await client.sendMessage(TEST_CHAT_ID, "Hello World", { parse_mode: "Markdown" });
    expect(res.message_id).toBe(42);
    expect(capturedUrl).toContain(`/bot${TEST_TOKEN}/sendMessage`);
    expect((capturedBody as Record<string, unknown>).chat_id).toBe(TEST_CHAT_ID);
    expect((capturedBody as Record<string, unknown>).text).toBe("Hello World");
    expect((capturedBody as Record<string, unknown>).parse_mode).toBe("Markdown");
  });

  test("sendChatAction sends typing notification", async () => {
    let capturedBody: unknown = null;
    const mockFetch: TelegramFetchFn = async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    };

    const client = new TelegramClient({ token: TEST_TOKEN, fetchFn: mockFetch });
    const res = await client.sendChatAction(TEST_CHAT_ID, "typing");
    expect(res).toBe(true);
    expect((capturedBody as Record<string, unknown>).action).toBe("typing");
  });

  test("getFile retrieves file metadata from Telegram API", async () => {
    const mockFetch: TelegramFetchFn = (async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            file_id: "photo_file_123",
            file_unique_id: "uniq_123",
            file_size: 4096,
            file_path: "photos/file_0.jpg",
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const client = new TelegramClient({ token: TEST_TOKEN, fetchFn: mockFetch });
    const file = await client.getFile("photo_file_123");
    expect(file.file_id).toBe("photo_file_123");
    expect(file.file_path).toBe("photos/file_0.jpg");
    expect(client.getFileUrl(file.file_path!)).toContain("photos/file_0.jpg");
  });

  test("webhook management methods execute properly", async () => {
    const mockFetch = (async () => {
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new TelegramClient({ token: TEST_TOKEN, fetchFn: mockFetch });
    expect(await client.setWebhook("https://vyavastha.org/api/telegram/webhook")).toBe(true);
    expect(await client.deleteWebhook()).toBe(true);
  });

  test("strictly redacts bot token from exception messages on API failure", async () => {
    const customSecretToken = "998877665:XYZabcSecretTokenNotInMemory12345";
    const mockFetch = (async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: 401,
          description: `Unauthorized: token ${customSecretToken} is revoked`,
        }),
        { status: 401 }
      );
    }) as unknown as typeof fetch;

    const client = new TelegramClient({ token: customSecretToken, fetchFn: mockFetch });

    try {
      await client.sendMessage(TEST_CHAT_ID, "Test fail");
      expect(true).toBe(false); // Should throw
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TelegramApiError);
      const apiErr = err as TelegramApiError;
      expect(apiErr.message).not.toContain(customSecretToken);
      expect(apiErr.message).toContain("[REDACTED_TELEGRAM_TOKEN]");
      expect(apiErr.description).not.toContain(customSecretToken);
    }
  });
});

describe("Response Formatter (src/bot/formatter.ts)", () => {
  test("formatKnowledgeSaved produces elegant markdown with badges, tasks, and memories", () => {
    const formatted = formatKnowledgeSaved({
      id: "ing_123",
      title: "Building Autonomous Systems",
      summary: "An overview of agentic loops and single-user OS architectures.",
      mediaType: "article",
      sourceUrl: "https://example.com/essay",
      tags: ["ai", "architecture"],
      tasks: [{ title: "Refactor router test suite", description: "Unit tests in bun" }],
      memories: [{ key: "preferred_agent_architecture", value: "Thin entry layer", category: "project" }],
      warning: "Extracted without reader mode fallback",
    });

    expect(formatted).toContain("✦ **Saved to Knowledge**");
    expect(formatted).toContain("Building Autonomous Systems");
    expect(formatted).toContain("Type: `article`");
    expect(formatted).toContain("#ai #architecture");
    expect(formatted).toContain("https://example.com/essay");
    expect(formatted).toContain("Extracted Tasks (1)");
    expect(formatted).toContain("Refactor router test suite");
    expect(formatted).toContain("Proposed Candidate Memories (1)");
    expect(formatted).toContain("preferred_agent_architecture");
    expect(formatted).toContain("⚠️ _Note: Extracted without reader mode fallback_");
  });

  test("formatStartMessage outputs operational overview and guide", () => {
    const start = formatStartMessage();
    expect(start).toContain("VYAVASTHA OS");
    expect(start).toContain("/status");
    expect(start).toContain("/tasks");
    expect(start).toContain("/memory");
    expect(start).toContain("/review");
  });

  test("formatStatusMessage details DB ping and disk space", () => {
    const status = formatStatusMessage({
      dbConnected: true,
      dbLatencyMs: 25,
      dbName: "vyavastha-db",
      diskHealthy: true,
      availableMb: 1200,
      requiredMb: 500,
      knowledgeCount: 42,
      tasksCount: 7,
      memoriesCount: 15,
    });

    expect(status).toContain("Vyavastha OS · System Health");
    expect(status).toContain("Connected (`25ms`)");
    expect(status).toContain("1200 MB");
    expect(status).toContain("42");
  });

  test("formatTasksMessage formats task lists and empty states cleanly", () => {
    const empty = formatTasksMessage([]);
    expect(empty).toContain("No pending tasks found");

    const tasks = formatTasksMessage([
      {
        id: "t1",
        title: "Test Telegram bot",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    expect(tasks).toContain("Pending Tasks (1)");
    expect(tasks).toContain("Test Telegram bot");
  });

  test("formatMemoriesMessage groups memories by category and handles empty state", () => {
    const empty = formatMemoriesMessage([]);
    expect(empty).toContain("No confirmed personal memories recorded yet");

    const memories = formatMemoriesMessage([
      {
        id: "m1",
        category: "preference",
        key: "theme",
        value: "dark",
        confidenceScore: 1.0,
        confirmedByUser: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    expect(memories).toContain("PREFERENCE");
    expect(memories).toContain("theme: _dark_");
  });

  test("formatWeeklyReviewMessage formats weekly metrics", () => {
    const review = formatWeeklyReviewMessage({
      periodStart: new Date("2026-09-08"),
      periodEnd: new Date("2026-09-15"),
      itemsIngested: 12,
      tasksCreated: 5,
      tasksCompleted: 4,
      memoriesFormed: 2,
    });
    expect(review).toContain("Weekly Activity Review");
    expect(review).toContain("Items Ingested");
    expect(review).toContain("`12`");
    expect(review).toContain("Tasks Completed");
    expect(review).toContain("`4`");
  });
});

describe("Message Routing & Update Handling (src/bot/router.ts)", () => {
  function createMockClient() {
    const sentMessages: Array<{ chatId: number | string; text: string }> = [];
    const client = new TelegramClient({
      token: TEST_TOKEN,
      fetchFn: (async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes("getFile")) {
          return new Response(
            JSON.stringify({
              ok: true,
              result: {
                file_id: "test_file_id",
                file_unique_id: "uniq_1",
                file_size: 1024,
                file_path: "photos/test.jpg",
              },
            }),
            { status: 200 }
          );
        }
        if (urlStr.includes("sendChatAction")) {
          return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
        }
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.text !== undefined) {
          sentMessages.push({ chatId: body.chat_id, text: body.text });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              message_id: sentMessages.length,
              chat: { id: body.chat_id, type: "private" },
              date: Math.floor(Date.now() / 1000),
              text: body.text,
            },
          }),
          { status: 200 }
        );
      }) as typeof fetch,
    });

    return { client, sentMessages };
  }

  function createAuthorizedUpdate(text?: string, extraMessageProps?: Partial<TelegramMessage>): TelegramUpdate {
    return {
      update_id: 1001,
      message: {
        message_id: 1,
        from: { id: Number(TEST_USER_ID), is_bot: false, first_name: "Owner" },
        chat: { id: Number(TEST_CHAT_ID), type: "private" },
        date: Math.floor(Date.now() / 1000),
        text,
        ...extraMessageProps,
      },
    };
  }

  test("detects and extracts URLs from messages and captions", () => {
    expect(detectUrlSubtype("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(detectUrlSubtype("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(detectUrlSubtype("https://www.instagram.com/p/C-xyz123/")).toBe("instagram");
    expect(detectUrlSubtype("https://paulgraham.com/foundermode.html")).toBe("article");

    const messageWithEntity: TelegramMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: 123456,
      text: "Read this: https://example.com/great-post awesome!",
      entities: [{ type: "url", offset: 11, length: 30 }],
    };
    expect(extractUrlFromMessage(messageWithEntity)).toBe("https://example.com/great-post");
  });

  test("strictly rejects unauthorized sender with audit message", async () => {
    const { client, sentMessages } = createMockClient();
    const router = new TelegramRouter({ client });

    const unauthorizedUpdate: TelegramUpdate = {
      update_id: 1002,
      message: {
        message_id: 2,
        from: { id: 999999999, is_bot: false, first_name: "Intruder" },
        chat: { id: 999999999, type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: "/start",
      },
    };

    const result = await router.handleUpdate(unauthorizedUpdate);
    expect(result.action).toBe("rejected");
    expect(result.status).toBe("rejected");
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain("Access Denied");
  });

  test("routes /start command and replies with system intro", async () => {
    const { client, sentMessages } = createMockClient();
    const router = new TelegramRouter({ client });

    const update = createAuthorizedUpdate("/start");
    const result = await router.handleUpdate(update);

    expect(result.action).toBe("command");
    expect(result.command).toBe("/start");
    expect(result.status).toBe("success");
    expect(sentMessages[0].text).toContain("VYAVASTHA OS");
  });

  test("routes /status command and queries health diagnostics", async () => {
    const { client, sentMessages } = createMockClient();
    const router = new TelegramRouter({ client });

    const update = createAuthorizedUpdate("/status");
    const result = await router.handleUpdate(update);

    expect(result.action).toBe("command");
    expect(result.command).toBe("/status");
    expect(result.status).toBe("success");
    expect(sentMessages[0].text).toContain("Vyavastha OS · System Health");
  });

  test("routes /tasks, /memory, and /review commands", async () => {
    const { client, sentMessages } = createMockClient();
    const router = new TelegramRouter({ client });

    await router.handleUpdate(createAuthorizedUpdate("/tasks"));
    expect(sentMessages[0].text).toContain("Pending Tasks");

    await router.handleUpdate(createAuthorizedUpdate("/memory"));
    expect(sentMessages[1].text).toContain("Personal Memory");

    await router.handleUpdate(createAuthorizedUpdate("/review"));
    expect(sentMessages[2].text).toContain("Weekly Activity Review");
  });

  test("routes web URLs to shared ingestion pipeline", async () => {
    const { client, sentMessages } = createMockClient();
    let receivedRequest: IngestionRequest | null = null;

    const router = new TelegramRouter({
      client,
      ingestionProcessor: async (req) => {
        receivedRequest = req;
        return {
          id: "url_1",
          title: "Founder Mode",
          summary: "Paul Graham essay on founder management.",
          mediaType: "article",
          sourceUrl: req.payload,
          tasks: [{ title: "Read essay by Sunday" }],
        };
      },
    });

    const update = createAuthorizedUpdate("Check this out: https://paulgraham.com/foundermode.html");
    const result = await router.handleUpdate(update);

    expect(result.action).toBe("ingestion");
    expect(result.ingestionType).toBe("url");
    expect(receivedRequest).not.toBeNull();
    expect(receivedRequest!.type).toBe("url");
    expect(receivedRequest!.source).toBe("telegram");
    expect(receivedRequest!.payload).toBe("https://paulgraham.com/foundermode.html");
    expect(sentMessages[0].text).toContain("✦ **Saved to Knowledge**");
    expect(sentMessages[0].text).toContain("Founder Mode");
    expect(sentMessages[0].text).toContain("Read essay by Sunday");
  });

  test("routes plain text notes to shared ingestion pipeline", async () => {
    const { client, sentMessages } = createMockClient();
    let receivedRequest: IngestionRequest | null = null;

    const router = new TelegramRouter({
      client,
      ingestionProcessor: async (req) => {
        receivedRequest = req;
        return {
          id: "note_1",
          title: "Important Observation",
          summary: req.payload,
          mediaType: "note",
          memories: [{ key: "observation_note", value: req.payload }],
        };
      },
    });

    const update = createAuthorizedUpdate("Important Observation\nNeed to review memory schema for Phase 7.");
    const result = await router.handleUpdate(update);

    expect(result.action).toBe("ingestion");
    expect(result.ingestionType).toBe("text");
    expect(receivedRequest!.type).toBe("text");
    expect(receivedRequest!.payload).toContain("Important Observation");
    expect(sentMessages[0].text).toContain("Saved to Knowledge");
  });

  test("routes photos to shared ingestion pipeline with metadata", async () => {
    const { client, sentMessages } = createMockClient();
    let receivedRequest: IngestionRequest | null = null;

    const router = new TelegramRouter({
      client,
      ingestionProcessor: async (req) => {
        receivedRequest = req;
        return {
          id: "photo_1",
          title: "Whiteboard Architecture Diagram",
          summary: "Visual architecture sketch for single-user system.",
          mediaType: "document",
        };
      },
    });

    const update = createAuthorizedUpdate(undefined, {
      caption: "Whiteboard sketch",
      photo: [
        { file_id: "small_id", file_unique_id: "u1", width: 100, height: 100, file_size: 100 },
        { file_id: "large_id", file_unique_id: "u2", width: 1200, height: 800, file_size: 50000 },
      ],
    });

    const result = await router.handleUpdate(update);
    expect(result.action).toBe("ingestion");
    expect(result.ingestionType).toBe("image");
    expect(receivedRequest!.type).toBe("image");
    expect(receivedRequest!.payload).toBe("large_id");
    expect(receivedRequest!.metadata?.caption).toBe("Whiteboard sketch");
    expect(sentMessages[0].text).toContain("Whiteboard Architecture Diagram");
  });

  test("routes voice, audio, and documents to shared ingestion pipeline", async () => {
    const { client } = createMockClient();
    const capturedRequests: IngestionRequest[] = [];

    const router = new TelegramRouter({
      client,
      ingestionProcessor: async (req) => {
        capturedRequests.push(req);
        return {
          id: "doc_1",
          title: "Ingested Media",
          summary: "Extracted media payload",
          mediaType: req.metadata?.mediaSubtype === "voice" ? "audio" : "document",
        };
      },
    });

    // Voice
    await router.handleUpdate(
      createAuthorizedUpdate(undefined, {
        voice: { file_id: "voice_123", file_unique_id: "v1", duration: 15, mime_type: "audio/ogg" },
      })
    );
    expect(capturedRequests[0].type).toBe("document");
    expect(capturedRequests[0].metadata?.mediaSubtype).toBe("voice");

    // Audio
    await router.handleUpdate(
      createAuthorizedUpdate(undefined, {
        audio: { file_id: "audio_123", file_unique_id: "a1", duration: 120, title: "Podcast snippet" },
      })
    );
    expect(capturedRequests[1].type).toBe("document");
    expect(capturedRequests[1].metadata?.mediaSubtype).toBe("audio");

    // Document
    await router.handleUpdate(
      createAuthorizedUpdate(undefined, {
        document: { file_id: "doc_123", file_unique_id: "d1", file_name: "spec.pdf", mime_type: "application/pdf" },
      })
    );
    expect(capturedRequests[2].type).toBe("document");
    expect(capturedRequests[2].metadata?.fileName).toBe("spec.pdf");
  });
});

describe("Telegram Webhook Route Handler (src/app/api/telegram/webhook/route.ts)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            message_id: 99,
            chat: { id: body.chat_id || Number(TEST_CHAT_ID), type: "private" },
            date: Math.floor(Date.now() / 1000),
            text: body.text || "ok",
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("GET handler returns operational status", async () => {
    const response = await webhookGET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.subsystem).toBe("telegram-webhook");
  });

  test("POST handler processes valid incoming Telegram update", async () => {
    const update: TelegramUpdate = {
      update_id: 5001,
      message: {
        message_id: 10,
        from: { id: Number(TEST_USER_ID), is_bot: false, first_name: "Owner" },
        chat: { id: Number(TEST_CHAT_ID), type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: "/start",
      },
    };

    const req = new Request("http://localhost:3000/api/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });

    const res = await webhookPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("command");
  });

  test("POST handler rejects malformed or invalid JSON payload", async () => {
    const req = new Request("http://localhost:3000/api/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });

    const res = await webhookPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON payload");
  });

  test("POST handler rejects payload missing update_id", async () => {
    const req = new Request("http://localhost:3000/api/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ not_an_update: true }),
    });

    const res = await webhookPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Malformed update payload");
  });

  test("POST handler enforces secret token when TELEGRAM_WEBHOOK_SECRET is set", async () => {
    const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    try {
      process.env.TELEGRAM_WEBHOOK_SECRET = "super-secret-telegram-webhook-token";

      const update: TelegramUpdate = {
        update_id: 6001,
        message: {
          message_id: 11,
          from: { id: Number(TEST_USER_ID), is_bot: false, first_name: "Owner" },
          chat: { id: Number(TEST_CHAT_ID), type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/status",
        },
      };

      // 1. Request without token -> 401
      const reqUnauthorized = new Request("http://localhost:3000/api/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const resUnauth = await webhookPOST(reqUnauthorized);
      expect(resUnauth.status).toBe(401);

      // 2. Request with valid token -> 200
      const reqAuthorized = new Request("http://localhost:3000/api/telegram/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": "super-secret-telegram-webhook-token",
        },
        body: JSON.stringify(update),
      });
      const resAuth = await webhookPOST(reqAuthorized);
      expect(resAuth.status).toBe(200);
    } finally {
      if (originalSecret) {
        process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
      } else {
        delete process.env.TELEGRAM_WEBHOOK_SECRET;
      }
    }
  });
});
