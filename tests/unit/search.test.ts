import { describe, expect, test } from "bun:test";
import {
  tokenize,
  calculateRecencyWeight,
  checkExactPhraseMatch,
  checkTagMatch,
  scoreLexical,
  scoreCandidates,
} from "../../src/search/lexical";
import {
  extractSnippetAroundMatches,
  resolveLayerWeights,
  deduplicateScoredItems,
  rankCandidates,
} from "../../src/search/ranking";
import {
  detectQueryIntent,
  mapDomainToCandidates,
  formatRetrievalPromptContext,
  ChatRetriever,
} from "../../src/search/chat-retriever";
import type {
  SearchCandidate,
  UnifiedSearchQuery,
} from "../../src/search/types";
import type {
  IVyavasthaRepository,
  KnowledgeItem,
  PersonalMemoryItem,
  TaskItem,
} from "../../src/db/repository";

describe("Lexical Search Engine (src/search/lexical.ts)", () => {
  test("tokenizes text across whitespace, punctuation, and Unicode characters", () => {
    const tokens = tokenize("Hello, World! This is VYAVASTHA's search-engine (v1.0) with résumé café.");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
    expect(tokens).toContain("vyavastha");
    expect(tokens).toContain("search");
    expect(tokens).toContain("engine");
    expect(tokens).toContain("v1");
    expect(tokens).toContain("0");
    expect(tokens).toContain("résumé");
    expect(tokens).toContain("café");
    expect(tokens).not.toContain(",");
    expect(tokens).not.toContain("!");
  });

  test("handles empty and nullish text gracefully", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize(null)).toEqual([]);
  });

  test("calculates recency decay favoring recent items while retaining older fundamental knowledge", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    const today = new Date("2026-09-15T10:00:00Z");
    const sixtyDaysAgo = new Date("2026-07-17T12:00:00Z");
    const twoYearsAgo = new Date("2024-09-15T12:00:00Z");

    const wToday = calculateRecencyWeight(today, now);
    const w60Days = calculateRecencyWeight(sixtyDaysAgo, now);
    const w2Years = calculateRecencyWeight(twoYearsAgo, now);

    // Today gets maximum recency weight (1.0)
    expect(wToday).toBeGreaterThan(0.99);
    expect(wToday).toBeLessThanOrEqual(1.0);

    // 60 days (half-life) decays halfway between 1.0 and floor (0.80) -> ~0.90
    expect(w60Days).toBeGreaterThan(0.89);
    expect(w60Days).toBeLessThan(0.91);

    // 2 years ago asymptotes near floor 0.80 and is never discarded
    expect(w2Years).toBeGreaterThanOrEqual(0.80);
    expect(w2Years).toBeLessThan(0.81);
    expect(wToday).toBeGreaterThan(w60Days);
    expect(w60Days).toBeGreaterThan(w2Years);
  });

  test("scores documents matching terms across title, summary, key, value, and rawContent", () => {
    const candidate: SearchCandidate = {
      id: "k-1",
      layer: "knowledge",
      title: "Distributed Consensus Algorithms in Modern Systems",
      summary: "Overview of Raft and Paxos protocols for distributed state replication.",
      rawContent: "Detailed proofs and edge-case handling for leader elections and log compaction.",
      tags: ["distributed-systems", "algorithms"],
      createdAt: new Date("2026-09-10T12:00:00Z"),
    };

    const query = "raft consensus distributed";
    const result = scoreLexical(candidate, query, { now: new Date("2026-09-15T12:00:00Z") });

    expect(result.finalScore).toBeGreaterThan(0);
    expect(result.matchedTokens).toContain("raft");
    expect(result.matchedTokens).toContain("consensus");
    expect(result.matchedTokens).toContain("distributed");
  });

  test("returns 0 score when no query tokens match candidate fields", () => {
    const candidate: SearchCandidate = {
      id: "k-2",
      layer: "knowledge",
      title: "French Pastry Baking",
      summary: "How to make croissants and pain au chocolat.",
      createdAt: new Date(),
    };

    const result = scoreLexical(candidate, "quantum cryptography");
    expect(result.baseScore).toBe(0);
    expect(result.finalScore).toBe(0);
    expect(result.matchedTokens).toHaveLength(0);
  });

  test("weights title and key matches higher than rawContent matches", () => {
    const titleMatch: SearchCandidate = {
      id: "k-title",
      layer: "knowledge",
      title: "Kubernetes Cluster Networking",
      summary: "General guide.",
      rawContent: "Some details.",
      createdAt: new Date(),
    };

    const contentMatch: SearchCandidate = {
      id: "k-content",
      layer: "knowledge",
      title: "General Engineering Notes",
      summary: "Various topics.",
      rawContent: "We discussed Kubernetes yesterday during the team sync.",
      createdAt: new Date(),
    };

    const resTitle = scoreLexical(titleMatch, "kubernetes");
    const resContent = scoreLexical(contentMatch, "kubernetes");

    expect(resTitle.baseScore).toBeGreaterThan(resContent.baseScore);
  });

  test("applies exact phrase matching boost (+2.0x)", () => {
    const candidateWithPhrase: SearchCandidate = {
      id: "k-phrase-1",
      layer: "knowledge",
      title: "Deep Dive into Vector Embeddings",
      summary: "Everything you need to know about vector embeddings for semantic search.",
      createdAt: new Date(),
    };

    const candidateWithoutPhrase: SearchCandidate = {
      id: "k-phrase-2",
      layer: "knowledge",
      title: "Embeddings for High Dimensional Vector Spaces",
      summary: "Analyzing different spaces.",
      createdAt: new Date(),
    };

    const query = "vector embeddings";

    const hasMatch1 = checkExactPhraseMatch(candidateWithPhrase, query);
    const hasMatch2 = checkExactPhraseMatch(candidateWithoutPhrase, query);

    expect(hasMatch1).toBe(true);
    expect(hasMatch2).toBe(false);

    const score1 = scoreLexical(candidateWithPhrase, query);
    const score2 = scoreLexical(candidateWithoutPhrase, query);

    expect(score1.phraseBoostApplied).toBe(true);
    expect(score2.phraseBoostApplied).toBe(false);
    expect(score1.finalScore).toBeGreaterThan(score2.finalScore);
  });

  test("applies tag and category exact match boost (+1.5x)", () => {
    const taggedCandidate: SearchCandidate = {
      id: "k-tag-1",
      layer: "knowledge",
      title: "Building Microservices",
      summary: "Architecture and design patterns.",
      tags: ["architecture", "microservices"],
      createdAt: new Date(),
    };

    const untaggedCandidate: SearchCandidate = {
      id: "k-tag-2",
      layer: "knowledge",
      title: "Building Microservices",
      summary: "Architecture and design patterns.",
      tags: ["general"],
      createdAt: new Date(),
    };

    const query = "architecture";

    expect(checkTagMatch(taggedCandidate, query, ["architecture"])).toBe(true);
    expect(checkTagMatch(untaggedCandidate, query, ["architecture"])).toBe(false);

    const resTagged = scoreLexical(taggedCandidate, query);
    const resUntagged = scoreLexical(untaggedCandidate, query);

    expect(resTagged.tagBoostApplied).toBe(true);
    expect(resUntagged.tagBoostApplied).toBe(false);
    expect(resTagged.finalScore).toBeGreaterThan(resUntagged.finalScore);
  });

  test("scoreCandidates computes corpus IDF across multiple documents", () => {
    const candidates: SearchCandidate[] = [
      {
        id: "doc-1",
        layer: "knowledge",
        title: "Introduction to Rust",
        summary: "Rust memory safety without garbage collection.",
        createdAt: new Date(),
      },
      {
        id: "doc-2",
        layer: "knowledge",
        title: "Python for Data Science",
        summary: "Python pandas and numpy libraries.",
        createdAt: new Date(),
      },
      {
        id: "doc-3",
        layer: "knowledge",
        title: "Rust Borrow Checker Deep Dive",
        summary: "Rust lifetimes, mutability, and safety rules.",
        createdAt: new Date(),
      },
    ];

    const results = scoreCandidates(candidates, "rust borrow");
    expect(results.get("doc-3")!.finalScore).toBeGreaterThan(results.get("doc-1")!.finalScore);
    expect(results.get("doc-2")!.finalScore).toBe(0);
  });
});

describe("Hybrid Ranking & Normalization (src/search/ranking.ts)", () => {
  const sampleCandidates: SearchCandidate[] = [
    {
      id: "k-1",
      layer: "knowledge",
      title: "Postgres Performance Tuning",
      summary: "Indexes, vacuuming, and query execution plans for Postgres.",
      rawContent: "Explain analyze output and buffer cache hit ratios.",
      tags: ["database", "postgres"],
      createdAt: new Date("2026-09-10T12:00:00Z"),
    },
    {
      id: "m-1",
      layer: "memory",
      title: "PREFERENCE: Preferred Database",
      key: "preferred_db",
      value: "User prefers Postgres for transactional data and SQLite for local embedded storage.",
      category: "preference",
      createdAt: new Date("2026-09-12T12:00:00Z"),
    },
    {
      id: "t-1",
      layer: "tasks",
      title: "Migrate database indexes to Postgres 17",
      description: "Run vacuum analyze and verify index bloat on Postgres servers.",
      status: "pending",
      createdAt: new Date("2026-09-14T12:00:00Z"),
    },
  ];

  test("normalizes scores strictly between 0.0 and 1.0 with top item at 1.0", () => {
    const result = rankCandidates(sampleCandidates, { query: "postgres performance" });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].score).toBe(1.0);

    for (const item of result.items) {
      expect(item.score).toBeGreaterThanOrEqual(0.0);
      expect(item.score).toBeLessThanOrEqual(1.0);
    }
  });

  test("returns empty items and 0 scores when no candidate matches", () => {
    const result = rankCandidates(sampleCandidates, { query: "unrelated astronomical galaxy" });
    expect(result.items).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.grouped.knowledge).toHaveLength(0);
    expect(result.grouped.memory).toHaveLength(0);
    expect(result.grouped.tasks).toHaveLength(0);
  });

  test("resolves layer weights favoring memory (1.2) for identity queries and tasks (0.9) for todo queries", () => {
    const identityWeights = resolveLayerWeights("identity");
    expect(identityWeights.knowledge).toBe(1.0);
    expect(identityWeights.memory).toBe(1.2);

    const todoWeights = resolveLayerWeights("todo");
    expect(todoWeights.knowledge).toBe(1.0);
    expect(todoWeights.tasks).toBe(0.9);

    const generalWeights = resolveLayerWeights("general");
    expect(generalWeights.knowledge).toBe(1.0);
    expect(generalWeights.memory).toBe(1.0);
  });

  test("boosts memory layer when query intent is identity", () => {
    const memoryCandidate: SearchCandidate = {
      id: "mem-identity",
      layer: "memory",
      title: "Alice Johnson",
      key: "user_name",
      value: "Alice Johnson, senior software architect.",
      category: "identity",
      createdAt: new Date(),
    };

    const knowledgeCandidate: SearchCandidate = {
      id: "know-doc",
      layer: "knowledge",
      title: "Alice Johnson",
      summary: "Alice Johnson, senior software architect.",
      createdAt: new Date(),
    };

    const result = rankCandidates([memoryCandidate, knowledgeCandidate], {
      query: "alice johnson",
    }, { intent: "identity" });

    // Memory candidate gets 1.2 layer weight vs 1.0 for knowledge
    expect(result.items[0].id).toBe("mem-identity");
  });

  test("deduplicates duplicate candidates preserving the highest score", () => {
    const duplicates: SearchCandidate[] = [
      {
        id: "dup-1",
        layer: "knowledge",
        title: "Docker Setup Guide",
        summary: "Short guide.",
        createdAt: new Date(),
      },
      {
        id: "dup-1",
        layer: "knowledge",
        title: "Docker Setup Guide",
        summary: "Docker containers, docker-compose, and volume setup guide in detail.",
        createdAt: new Date(),
      },
    ];

    const deduplicated = deduplicateScoredItems([
      {
        candidate: duplicates[0],
        score: 5.0,
        lexical: {
          baseScore: 5.0,
          phraseBoostApplied: false,
          tagBoostApplied: false,
          recencyWeight: 1,
          finalScore: 5.0,
          matchedTokens: ["docker"],
        },
      },
      {
        candidate: duplicates[1],
        score: 12.0,
        lexical: {
          baseScore: 12.0,
          phraseBoostApplied: true,
          tagBoostApplied: false,
          recencyWeight: 1,
          finalScore: 12.0,
          matchedTokens: ["docker", "setup", "guide"],
        },
      },
    ]);

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].score).toBe(12.0);
  });

  test("extracts snippet centered around matched terms with contextual ellipses", () => {
    const candidate: SearchCandidate = {
      id: "k-long",
      layer: "knowledge",
      title: "Web Security Overview",
      summary:
        "Web application security involves many layers of defense. The most common vulnerability is Cross-Site Scripting (XSS), which enables attackers to inject malicious scripts into trusted web applications. Implementing Content Security Policy mitigates this risk.",
      createdAt: new Date(),
    };

    const snippet = extractSnippetAroundMatches(candidate, "cross-site scripting", ["cross", "site", "scripting"], 80);
    expect(snippet.toLowerCase()).toContain("cross-site scripting");
    expect(snippet.startsWith("...")).toBe(true);
    expect(snippet.endsWith("...")).toBe(true);
  });

  test("filters candidates by layer and metadata", () => {
    const resultKnowledgeOnly = rankCandidates(sampleCandidates, {
      query: "postgres",
      layers: ["knowledge"],
    });

    expect(resultKnowledgeOnly.items.length).toBe(1);
    expect(resultKnowledgeOnly.items[0].layer).toBe("knowledge");
    expect(resultKnowledgeOnly.grouped.memory).toHaveLength(0);
    expect(resultKnowledgeOnly.grouped.tasks).toHaveLength(0);

    const resultStatusFilter = rankCandidates(sampleCandidates, {
      query: "postgres",
      filters: { status: "pending" },
    });

    expect(resultStatusFilter.items.length).toBe(1);
    expect(resultStatusFilter.items[0].layer).toBe("tasks");
  });
});

describe("Chat Retrieval Hierarchy & Intent Orchestration (src/search/chat-retriever.ts)", () => {
  test("identifies user query intent accurately", () => {
    expect(detectQueryIntent("who am I").intent).toBe("identity");
    expect(detectQueryIntent("what is my email address").intent).toBe("identity");
    expect(detectQueryIntent("my profile preferences").intent).toBe("identity");

    expect(detectQueryIntent("what are my pending tasks").intent).toBe("todo");
    expect(detectQueryIntent("todo list for tomorrow").intent).toBe("todo");
    expect(detectQueryIntent("action items for sprint 4").intent).toBe("todo");

    expect(detectQueryIntent("what did I save about machine learning").intent).toBe("knowledge");
    expect(detectQueryIntent("summarize the article on distributed systems").intent).toBe("knowledge");

    expect(detectQueryIntent("search the web for latest TS 5.7 release").externalWebRequested).toBe(true);
    expect(detectQueryIntent("google this topic online").externalWebRequested).toBe(true);
    expect(detectQueryIntent("internal notes on rust").externalWebRequested).toBe(false);
  });

  test("strictly orders context prompt: [SAVED KNOWLEDGE] -> [PERSONAL MEMORY] -> [ACTIVE TASKS]", () => {
    const grouped = {
      knowledge: [
        {
          id: "k-1",
          layer: "knowledge" as const,
          title: "Neural Networks Primer",
          snippet: "Backpropagation and gradient descent fundamentals.",
          score: 1.0,
          sourceUrl: "https://example.com/nn",
          createdAt: new Date(),
        },
      ],
      memory: [
        {
          id: "m-1",
          layer: "memory" as const,
          title: "[PREFERENCE] Framework",
          category: "preference",
          snippet: "Prefers PyTorch over TensorFlow.",
          score: 0.9,
          createdAt: new Date(),
        },
      ],
      tasks: [
        {
          id: "t-1",
          layer: "tasks" as const,
          title: "Complete PyTorch tutorial",
          status: "pending",
          snippet: "Run exercises 1 through 5.",
          score: 0.8,
          createdAt: new Date(),
        },
      ],
    };

    const prompt = formatRetrievalPromptContext(grouped);

    // Verify presence of all three separation markers
    expect(prompt).toContain("[SAVED KNOWLEDGE]");
    expect(prompt).toContain("[PERSONAL MEMORY]");
    expect(prompt).toContain("[ACTIVE TASKS]");

    // Verify strict hierarchical ordering
    const kIdx = prompt.indexOf("[SAVED KNOWLEDGE]");
    const mIdx = prompt.indexOf("[PERSONAL MEMORY]");
    const tIdx = prompt.indexOf("[ACTIVE TASKS]");

    expect(kIdx).toBeGreaterThan(-1);
    expect(mIdx).toBeGreaterThan(kIdx);
    expect(tIdx).toBeGreaterThan(mIdx);
  });

  test("clearly distinguishes external web sources with warning when invoked", () => {
    const grouped = {
      knowledge: [],
      memory: [],
      tasks: [],
    };

    const externalItems = [
      {
        id: "web-1",
        layer: "knowledge" as const,
        title: "TypeScript 5.7 Release Notes",
        snippet: "TypeScript 5.7 introduces checks for uninitialized variables.",
        sourceUrl: "https://devblogs.microsoft.com/typescript",
        score: 0.85,
        createdAt: new Date(),
      },
    ];

    const prompt = formatRetrievalPromptContext(grouped, externalItems);

    expect(prompt).toContain("[EXTERNAL WEB SOURCES (NOT USER KNOWLEDGE)]");
    expect(prompt).toContain("WARNING: The following information was retrieved from the external web");
    expect(prompt).toContain("NOT part of the user's verified personal memory or saved knowledge");
    expect(prompt).toContain("TypeScript 5.7 Release Notes");
  });

  test("ChatRetriever respects external search gating: only when requested AND internal data is insufficient", async () => {
    let externalCalled = false;
    const mockExternalSearch = async (q: string) => {
      externalCalled = true;
      return [
        {
          id: "ext-1",
          layer: "knowledge" as const,
          title: "External Web Result for " + q,
          snippet: "Found on the web.",
          score: 0.9,
          createdAt: new Date(),
        },
      ];
    };

    // Case 1: Internal data is sufficient -> external web search MUST NOT be called even if allowExternalWeb is true
    const internalCandidates: SearchCandidate[] = [
      {
        id: "k-match",
        layer: "knowledge",
        title: "Docker Setup Guide",
        summary: "Detailed instructions for installing Docker.",
        createdAt: new Date(),
      },
    ];

    const retriever = new ChatRetriever(undefined, mockExternalSearch);

    const res1 = await retriever.retrieve("docker setup", {
      candidates: internalCandidates,
      allowExternalWeb: true,
      sufficiencyThreshold: 0.3,
    });

    expect(res1.items.length).toBeGreaterThan(0);
    expect(res1.externalWebRequired).toBe(false);
    expect(res1.externalWebSearched).toBe(false);
    expect(externalCalled).toBe(false);

    // Case 2: Internal data is insufficient BUT user DID NOT allow or request external search -> external web search NOT called
    externalCalled = false;
    const res2 = await retriever.retrieve("quantum mechanics", {
      candidates: internalCandidates,
      allowExternalWeb: false,
    });

    expect(res2.items.length).toBe(0);
    expect(res2.externalWebRequired).toBe(false);
    expect(res2.externalWebSearched).toBe(false);
    expect(externalCalled).toBe(false);

    // Case 3: Internal data is insufficient AND user explicitly allowed external web -> external web search IS called
    externalCalled = false;
    const res3 = await retriever.retrieve("quantum mechanics", {
      candidates: internalCandidates,
      allowExternalWeb: true,
      sufficiencyThreshold: 0.3,
    });

    expect(res3.externalWebRequired).toBe(true);
    expect(res3.externalWebSearched).toBe(true);
    expect(externalCalled).toBe(true);
    expect(res3.contextPrompt).toContain("[EXTERNAL WEB SOURCES (NOT USER KNOWLEDGE)]");
  });

  test("ChatRetriever handles repository with UnimplementedVyavasthaRepository without crashing", async () => {
    // Repository where methods throw NotImplementedError
    const unimplementedRepo: IVyavasthaRepository = {
      createKnowledge: async () => { throw new Error("Not implemented"); },
      getKnowledgeById: async () => { throw new Error("Not implemented"); },
      listKnowledge: async () => { throw new Error("Not implemented"); },
      createMemory: async () => { throw new Error("Not implemented"); },
      getMemoryById: async () => { throw new Error("Not implemented"); },
      listMemories: async () => { throw new Error("Not implemented"); },
      createTask: async () => { throw new Error("Not implemented"); },
      getTaskById: async () => { throw new Error("Not implemented"); },
      listTasks: async () => { throw new Error("Not implemented"); },
      updateTaskStatus: async () => { throw new Error("Not implemented"); },
      logActivity: async () => { throw new Error("Not implemented"); },
      listActivities: async () => { throw new Error("Not implemented"); },
      search: async () => { throw new Error("Not implemented"); },
      generateWeeklyReview: async () => { throw new Error("Not implemented"); },
    };

    const retriever = new ChatRetriever(unimplementedRepo);

    // Should gracefully complete with 0 items without throwing an unhandled exception
    const result = await retriever.retrieve("test query");
    expect(result.items).toHaveLength(0);
    expect(result.grouped.knowledge).toHaveLength(0);
    expect(result.grouped.memory).toHaveLength(0);
    expect(result.grouped.tasks).toHaveLength(0);
    expect(result.contextPrompt).toContain("[SAVED KNOWLEDGE]");
    expect(result.contextPrompt).toContain("[PERSONAL MEMORY]");
    expect(result.contextPrompt).toContain("[ACTIVE TASKS]");
  });

  test("maps domain repository entities accurately to candidates", () => {
    const knowledgeItems: KnowledgeItem[] = [
      {
        id: "k-1",
        title: "Test Knowledge",
        summary: "Summary of knowledge",
        mediaType: "article",
        tags: ["tag1"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const memoryItems: PersonalMemoryItem[] = [
      {
        id: "m-1",
        category: "preference",
        key: "theme",
        value: "dark",
        confidenceScore: 1.0,
        confirmedByUser: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const taskItems: TaskItem[] = [
      {
        id: "t-1",
        title: "Finish report",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const candidates = mapDomainToCandidates(knowledgeItems, memoryItems, taskItems);
    expect(candidates).toHaveLength(3);

    const kCand = candidates.find((c) => c.layer === "knowledge");
    const mCand = candidates.find((c) => c.layer === "memory");
    const tCand = candidates.find((c) => c.layer === "tasks");

    expect(kCand?.title).toBe("Test Knowledge");
    expect(mCand?.title).toBe("[PREFERENCE] theme");
    expect(mCand?.value).toBe("dark");
    expect(tCand?.status).toBe("pending");
  });
});
