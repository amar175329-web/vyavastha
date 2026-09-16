import { describe, expect, test } from "bun:test";
import {
  ContentUnderstandingResultSchema,
  CandidatePersonalMemorySchema,
  ChatSynthesisResponseSchema,
  WeeklyReviewResultSchema,
  type ContentUnderstandingInput,
  type ChatSynthesisInput,
  type WeeklyReviewInput,
} from "../../src/ai/types";
import {
  CONTENT_UNDERSTANDING_CONFIG,
  CHAT_SYNTHESIS_CONFIG,
  WEEKLY_REVIEW_CONFIG,
  AI_MODELS,
} from "../../src/ai/config";
import { buildContentUnderstandingPrompt } from "../../src/ai/prompts/content-understanding";
import { buildChatSynthesisPrompt } from "../../src/ai/prompts/chat-synthesis";
import { buildWeeklyReviewPrompt } from "../../src/ai/prompts/weekly-review";
import { GeminiClient, GeminiApiError, cleanJsonText } from "../../src/ai/client";
import { AiService } from "../../src/ai/service";

describe("AI Cognitive Intelligence Layer (src/ai)", () => {
  describe("Types & Schemas Validation (src/ai/types.ts)", () => {
    test("validates complete and valid ContentUnderstandingResult", () => {
      const validPayload = {
        title: "Deep Dive into Distributed Consensus",
        summary: "An overview of Raft and Paxos consensus algorithms.",
        sourceType: "article",
        sourceUrl: "https://example.com/consensus",
        concepts: ["consensus", "state machine replication", "quorum"],
        topics: ["Distributed Systems", "Computer Science"],
        tags: ["raft", "paxos", "algorithms"],
        entities: [
          { name: "Leslie Lamport", type: "Person", context: "Creator of Paxos" },
          { name: "Raft", type: "Algorithm", context: "Understandable consensus" },
        ],
        actionableTasks: [
          {
            title: "Implement Raft election in TypeScript",
            description: "Build a 3-node in-memory Raft cluster simulator.",
            priority: "high",
          },
        ],
        candidatePersonalMemories: [
          {
            category: "project",
            key: "active_distributed_systems_research",
            value: "Researching consensus algorithms for Vyavastha replication",
            confidenceScore: 0.85,
            reason: "User explicitly stated building a consensus prototype.",
            confirmedByUser: false,
          },
        ],
      };

      const parsed = ContentUnderstandingResultSchema.parse(validPayload);
      expect(parsed.title).toBe(validPayload.title);
      expect(parsed.sourceType).toBe("article");
      expect(parsed.actionableTasks).toHaveLength(1);
      expect(parsed.actionableTasks[0].priority).toBe("high");
      expect(parsed.candidatePersonalMemories).toHaveLength(1);
      expect(parsed.candidatePersonalMemories[0].confirmedByUser).toBe(false);
    });

    test("CandidatePersonalMemorySchema defaults confirmedByUser to false", () => {
      const memoryPayload = {
        category: "preference",
        key: "editor_preference",
        value: "Prefers Neovim with dark theme",
        confidenceScore: 0.9,
        reason: "User mentioned 'I always code in Neovim'.",
      };

      const parsed = CandidatePersonalMemorySchema.parse(memoryPayload);
      expect(parsed.confirmedByUser).toBe(false);
    });

    test("rejects invalid sourceType", () => {
      const invalidPayload = {
        title: "Invalid Source",
        summary: "Summary text",
        sourceType: "tiktok", // Not in allowed enum
      };

      expect(() => ContentUnderstandingResultSchema.parse(invalidPayload)).toThrow();
    });

    test("rejects invalid memory category or out-of-range confidence score", () => {
      const invalidCategory = {
        category: "gossip", // Invalid category
        key: "key",
        value: "value",
        confidenceScore: 0.5,
        reason: "reason",
      };
      expect(() => CandidatePersonalMemorySchema.parse(invalidCategory)).toThrow();

      const invalidScore = {
        category: "fact",
        key: "key",
        value: "value",
        confidenceScore: 1.5, // > 1.0
        reason: "reason",
      };
      expect(() => CandidatePersonalMemorySchema.parse(invalidScore)).toThrow();
    });

    test("validates ChatSynthesisResponseSchema and citations", () => {
      const validChatResponse = {
        reply: "Based on your saved notes on Paxos, consensus requires a quorum.",
        citations: [
          {
            id: "know_12345",
            type: "knowledge",
            title: "Deep Dive into Distributed Consensus",
          },
        ],
      };

      const parsed = ChatSynthesisResponseSchema.parse(validChatResponse);
      expect(parsed.reply).toContain("Paxos");
      expect(parsed.citations).toHaveLength(1);
      expect(parsed.citations[0].type).toBe("knowledge");
    });

    test("validates WeeklyReviewResultSchema", () => {
      const validReview = {
        narrative: "A highly productive week focusing on autonomous system design.",
        keyLearnings: ["Raft simplifies leader election compared to Multi-Paxos."],
        activeIntentions: ["Complete Vyavastha Phase 7 database migration."],
        identityShifts: ["Shifted preference towards local-first architecture."],
      };

      const parsed = WeeklyReviewResultSchema.parse(validReview);
      expect(parsed.narrative).toContain("productive");
      expect(parsed.keyLearnings).toHaveLength(1);
      expect(parsed.identityShifts).toHaveLength(1);
    });
  });

  describe("Prompt Builders (src/ai/prompts/)", () => {
    test("buildContentUnderstandingPrompt embeds inputs and enforces CRITICAL MEMORY RULE", () => {
      const input: ContentUnderstandingInput = {
        text: "Building resilient distributed event streams in Bun.",
        url: "https://bun.sh/blog/event-streams",
        mediaType: "article",
        metadata: { author: "Jarred" },
      };

      const { systemInstruction, userPrompt } = buildContentUnderstandingPrompt(input);

      expect(systemInstruction).toContain("VYAVASTHA");
      expect(systemInstruction).toContain("CRITICAL MEMORY RULE");
      expect(userPrompt).toContain("https://bun.sh/blog/event-streams");
      expect(userPrompt).toContain("Building resilient distributed event streams");
      expect(userPrompt).toContain("Jarred");
      // Verify strict memory rule phrasing in prompt
      expect(userPrompt).toContain("SAVED CONTENT IS EXTERNAL KNOWLEDGE");
      expect(userPrompt).toContain("Layer A");
      expect(userPrompt).toContain("Layer B");
      expect(userPrompt).toContain("confirmedByUser");
    });

    test("buildChatSynthesisPrompt correctly formats Layers A, B, and C with citations instruction", () => {
      const input: ChatSynthesisInput = {
        query: "What is my current progress on distributed consensus?",
        conversationHistory: [
          { role: "user", content: "Hello OS" },
          { role: "assistant", content: "Greetings. How can I assist you today?" },
        ],
        retrievedContext: {
          knowledge: [
            {
              id: "k-1",
              title: "Raft Paper",
              summary: "In Search of an Understandable Consensus Algorithm",
              sourceUrl: "https://raft.github.io",
            },
          ],
          memories: [
            {
              id: "m-1",
              category: "project",
              key: "vyavastha_consensus",
              value: "Evaluating Raft for state sync",
              confirmedByUser: true,
            },
          ],
          tasks: [
            {
              id: "t-1",
              title: "Write Raft unit tests",
              status: "pending",
              dueDate: "2026-10-01",
            },
          ],
        },
      };

      const { systemInstruction, userPrompt } = buildChatSynthesisPrompt(input);

      expect(systemInstruction).toContain("executive intelligence of VYAVASTHA");
      expect(userPrompt).toContain("--- LAYER A: SAVED KNOWLEDGE ---");
      expect(userPrompt).toContain("[K1] ID: k-1 | Title: \"Raft Paper\"");
      expect(userPrompt).toContain("--- LAYER B: PERSONAL MEMORIES ---");
      expect(userPrompt).toContain("[M1] ID: m-1 | Key: \"vyavastha_consensus\"");
      expect(userPrompt).toContain("(Confirmed by User)");
      expect(userPrompt).toContain("--- LAYER C: TASKS & INTENTIONS ---");
      expect(userPrompt).toContain("[T1] ID: t-1 | Title: \"Write Raft unit tests\"");
      expect(userPrompt).toContain("What is my current progress on distributed consensus?");
      expect(userPrompt).toContain("citations");
    });

    test("buildWeeklyReviewPrompt includes stats and activities across layers", () => {
      const input: WeeklyReviewInput = {
        stats: { itemsIngested: 14, tasksCreated: 5, tasksCompleted: 4, memoriesFormed: 2 },
        recentKnowledge: [{ id: "k-1", title: "Turso Architecture", summary: "libSQL at edge" }],
        recentTasks: [{ id: "t-1", title: "Deploy Bot", status: "completed" }],
        recentMemories: [{ id: "m-1", key: "timezone", value: "Asia/Kolkata", category: "preference" }],
      };

      const { systemInstruction, userPrompt } = buildWeeklyReviewPrompt(input);

      expect(systemInstruction).toContain("Reflective Synthesis Engine");
      expect(userPrompt).toContain('"itemsIngested": 14');
      expect(userPrompt).toContain("Turso Architecture");
      expect(userPrompt).toContain("Deploy Bot");
      expect(userPrompt).toContain("Asia/Kolkata");
    });
  });

  describe("Gemini Client & Error Handling (src/ai/client.ts)", () => {
    test("cleanJsonText strips markdown fences cleanly", () => {
      expect(cleanJsonText('{"key": "value"}')).toBe('{"key": "value"}');
      expect(cleanJsonText('```json\n{"key": "value"}\n```')).toBe('{"key": "value"}');
      expect(cleanJsonText('```\n{"key": "value"}\n```')).toBe('{"key": "value"}');
    });

    test("GeminiClient sends proper payload and parses valid structured JSON response", async () => {
      let interceptedUrl = "";
      let interceptedHeaders: HeadersInit | undefined;
      let interceptedBody: any;

      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        interceptedUrl = String(input);
        interceptedHeaders = init?.headers;
        interceptedBody = JSON.parse(init?.body as string);

        const mockResponse = {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ answer: 42, label: "truth" }) }],
                role: "model",
              },
              finishReason: "STOP",
            },
          ],
        };

        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const client = new GeminiClient({
        apiKey: "AIzaSyMockTestKey_1234567890",
        fetchFn: mockFetch as any,
      });

      const result = await client.generateJson<{ answer: number; label: string }>({
        contents: [{ role: "user", parts: [{ text: "What is the answer?" }] }],
      });

      expect(interceptedUrl).toContain("/models/gemini-3.6-flash:generateContent");
      expect((interceptedHeaders as Record<string, string>)["x-goog-api-key"]).toBe(
        "AIzaSyMockTestKey_1234567890"
      );
      expect(interceptedBody.generationConfig.responseMimeType).toBe("application/json");
      expect(result.answer).toBe(42);
      expect(result.label).toBe("truth");
    });

    test("GeminiClient redacts API secrets in error messages", async () => {
      const sensitiveKey = "AIzaSyMockSuperSecret_Secret12345";

      const failingFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            error: {
              code: 403,
              message: `API key ${sensitiveKey} is invalid or expired.`,
              status: "PERMISSION_DENIED",
            },
          }),
          { status: 403, statusText: "Forbidden" }
        );
      };

      const client = new GeminiClient({
        apiKey: sensitiveKey,
        fetchFn: failingFetch as any,
      });

      try {
        await client.generateJson({
          contents: [{ role: "user", parts: [{ text: "test" }] }],
        });
        expect(true).toBe(false); // Should not reach here
      } catch (err: unknown) {
        expect(err instanceof GeminiApiError).toBe(true);
        const error = err as GeminiApiError;
        expect(error.statusCode).toBe(403);
        // Secret must NOT be in the error message
        expect(error.message).not.toContain(sensitiveKey);
      }
    });

    test("GeminiClient throws descriptive error on network failure", async () => {
      const networkFailFetch = async (): Promise<Response> => {
        throw new Error("DNS resolution failed");
      };

      const client = new GeminiClient({
        apiKey: "mock-key",
        fetchFn: networkFailFetch as any,
      });

      expect(
        client.generateJson({
          contents: [{ role: "user", parts: [{ text: "test" }] }],
        })
      ).rejects.toThrow("Gemini network request failed");
    });
  });

  describe("AiService & CRITICAL MEMORY RULE (src/ai/service.ts)", () => {
    test("understandContent strictly enforces confirmedByUser: false for candidate memories", async () => {
      // Mock Gemini returning candidate memory with confirmedByUser: true (attempted bypass)
      const mockGeminiResponse = {
        title: "Personal Journal Entry",
        summary: "User remarks about switching to TypeScript.",
        sourceType: "note",
        concepts: ["typescript"],
        topics: ["Programming"],
        tags: ["typescript", "preferences"],
        entities: [{ name: "TypeScript", type: "Language" }],
        actionableTasks: [],
        candidatePersonalMemories: [
          {
            category: "preference",
            key: "primary_language",
            value: "TypeScript",
            confidenceScore: 0.95,
            reason: "User said 'I love TypeScript'.",
            confirmedByUser: true, // Should be forcefully overridden to false!
          },
        ],
      };

      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockGeminiResponse) }],
                  role: "model",
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const client = new GeminiClient({
        apiKey: "mock-key",
        fetchFn: mockFetch as any,
      });

      const service = new AiService(client);

      const result = await service.understandContent({
        text: "I really love TypeScript and use it for all projects.",
        url: "https://example.com/note/1",
        mediaType: "note",
      });

      expect(result.title).toBe("Personal Journal Entry");
      expect(result.candidatePersonalMemories).toHaveLength(1);
      const mem = result.candidatePersonalMemories[0];

      // CRITICAL MEMORY RULE CHECK
      expect(mem.confirmedByUser).toBe(false);
      expect(mem.confidenceScore).toBe(0.95);
      expect(mem.provenance).toBe("https://example.com/note/1");
    });

    test("understandContent rejects empty content text", async () => {
      const service = new AiService();
      expect(service.understandContent({ text: "   " })).rejects.toThrow(
        "Cannot analyze empty content text"
      );
    });

    test("synthesizeChatResponse returns reply and citations", async () => {
      const mockChatOutput = {
        reply: "You have 1 pending task for your Raft implementation.",
        citations: [
          {
            id: "t-1",
            type: "task",
            title: "Write Raft unit tests",
          },
        ],
      };

      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockChatOutput) }],
                  role: "model",
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const client = new GeminiClient({
        apiKey: "mock-key",
        fetchFn: mockFetch as any,
      });

      const service = new AiService(client);

      const res = await service.synthesizeChatResponse({
        query: "What tasks do I have?",
        conversationHistory: [],
        retrievedContext: {
          knowledge: [],
          memories: [],
          tasks: [{ id: "t-1", title: "Write Raft unit tests", status: "pending" }],
        },
      });

      expect(res.reply).toContain("Raft implementation");
      expect(res.citations).toHaveLength(1);
      expect(res.citations[0].id).toBe("t-1");
    });

    test("generateReflectiveReview returns comprehensive synthesis", async () => {
      const mockReviewOutput = {
        narrative: "The week showcased sustained momentum on cognitive architecture.",
        keyLearnings: ["Separating Layer A knowledge from Layer B memory prevents memory pollution."],
        activeIntentions: ["Finalize Phase 7 persistence layer."],
        identityShifts: ["Solidifying identity as an autonomous systems architect."],
      };

      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockReviewOutput) }],
                  role: "model",
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const client = new GeminiClient({
        apiKey: "mock-key",
        fetchFn: mockFetch as any,
      });

      const service = new AiService(client);

      const review = await service.generateReflectiveReview({
        stats: { itemsIngested: 10 },
        recentKnowledge: [],
        recentTasks: [],
        recentMemories: [],
      });

      expect(review.narrative).toContain("sustained momentum");
      expect(review.keyLearnings).toHaveLength(1);
      expect(review.activeIntentions[0]).toContain("Phase 7");
      expect(review.identityShifts[0]).toContain("autonomous systems architect");
    });
  });

  describe("Configuration (src/ai/config.ts)", () => {
    test("provides configured defaults for fast and deep models", () => {
      expect(AI_MODELS.fast).toBe("gemini-3.6-flash");
      expect(AI_MODELS.deep).toBe("gemini-3.6-flash");
      expect(CONTENT_UNDERSTANDING_CONFIG.model).toBe("gemini-3.6-flash");
      expect(CHAT_SYNTHESIS_CONFIG.model).toBe("gemini-3.6-flash");
      expect(WEEKLY_REVIEW_CONFIG.model).toBe("gemini-3.6-flash");
      expect(CONTENT_UNDERSTANDING_CONFIG.temperature).toBe(0.1);
      expect(CHAT_SYNTHESIS_CONFIG.temperature).toBe(0.3);
      expect(WEEKLY_REVIEW_CONFIG.temperature).toBe(0.4);
    });
  });
});
