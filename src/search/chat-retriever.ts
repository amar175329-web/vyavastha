/**
 * VYAVASTHA — Chat Retrieval Orchestrator
 *
 * Implements the strict chat retrieval hierarchy:
 * 1. Layer A: Saved Knowledge
 * 2. Layer B: Personal Memory
 * 3. Layer C: Tasks / History
 * 4. External Web (strictly gated: ONLY when explicitly requested/allowed AND internal data is insufficient)
 *
 * Packages retrieved items into structured prompt context for AI synthesis with
 * clear separation markers: [SAVED KNOWLEDGE], [PERSONAL MEMORY], [ACTIVE TASKS],
 * ensuring external web info is clearly demarcated from the user's stored knowledge.
 */

import type {
  IVyavasthaRepository,
  KnowledgeItem,
  PersonalMemoryItem,
  TaskItem,
} from "../db/repository";
import { rankCandidates } from "./ranking";
import type {
  ChatRetrievalResult,
  SearchCandidate,
  SearchIntent,
  SearchItem,
  UnifiedSearchQuery,
} from "./types";

export interface ChatRetrieveOptions {
  intent?: SearchIntent;
  allowExternalWeb?: boolean;
  sufficiencyThreshold?: number;
  limitPerLayer?: number;
  totalLimit?: number;
  candidates?: SearchCandidate[];
  now?: Date;
}

export type ExternalSearchProvider = (query: string) => Promise<SearchItem[]>;

/**
 * Identifies query intent and checks whether external web search was explicitly requested.
 */
export function detectQueryIntent(query: string): {
  intent: SearchIntent;
  externalWebRequested: boolean;
} {
  const clean = query.trim().toLowerCase();

  // Detect explicit external web search requests
  const externalWebPattern =
    /\b(search the web|search online|look up online|google this|google|search internet|browse the web|external search|find on the web|latest news on)\b/i;
  const externalWebRequested = externalWebPattern.test(clean);

  // 1. Identity / Personal memory intent
  const identityPattern =
    /\b(who am i|my name|about me|my preference|my profile|my bio|do i like|what do i prefer|my email|my phone|my address|where do i live|remember when i|personal details|am i)\b/i;
  if (identityPattern.test(clean) || /^my\s+[a-z0-9]+/i.test(clean)) {
    return { intent: "identity", externalWebRequested };
  }

  // 2. To-do / Task intent
  const taskPattern =
    /\b(todo|to-do|tasks?|action items?|pending|deadline|due date|what do i need to do|what should i work on|backlog|in progress|checklist|assignee)\b/i;
  if (taskPattern.test(clean)) {
    return { intent: "todo", externalWebRequested };
  }

  // 3. Knowledge / Research intent
  const knowledgePattern =
    /\b(what did i save|summarize|article|note|video|youtube|learn|explain|read|document|pdf|bookmark|notes on|research|how does|what is)\b/i;
  if (knowledgePattern.test(clean)) {
    return { intent: "knowledge", externalWebRequested };
  }

  return { intent: "general", externalWebRequested };
}

/**
 * Maps repository domain entities to unified SearchCandidate objects.
 */
export function mapDomainToCandidates(
  knowledge: KnowledgeItem[] = [],
  memories: PersonalMemoryItem[] = [],
  tasks: TaskItem[] = []
): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];

  for (const k of knowledge) {
    candidates.push({
      id: k.id,
      layer: "knowledge",
      title: k.title,
      summary: k.summary,
      rawContent: k.rawContent,
      mediaType: k.mediaType,
      tags: k.tags,
      sourceUrl: k.sourceUrl,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    });
  }

  for (const m of memories) {
    candidates.push({
      id: m.id,
      layer: "memory",
      title: `[${m.category.toUpperCase()}] ${m.key}`,
      key: m.key,
      value: m.value,
      category: m.category,
      confidenceScore: m.confidenceScore,
      confirmedByUser: m.confirmedByUser,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    });
  }

  for (const t of tasks) {
    candidates.push({
      id: t.id,
      layer: "tasks",
      title: t.title,
      description: t.description,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    });
  }

  return candidates;
}

/**
 * Packages grouped search items into structured prompt context strictly obeying:
 * 1. [SAVED KNOWLEDGE]
 * 2. [PERSONAL MEMORY]
 * 3. [ACTIVE TASKS]
 * 4. [EXTERNAL WEB SOURCES (NOT USER KNOWLEDGE)] (if external search was invoked)
 */
export function formatRetrievalPromptContext(
  grouped: {
    knowledge: SearchItem[];
    memory: SearchItem[];
    tasks: SearchItem[];
  },
  externalItems?: SearchItem[]
): string {
  const sections: string[] = [];

  // Section 1: Saved Knowledge
  sections.push("[SAVED KNOWLEDGE]");
  if (grouped.knowledge.length === 0) {
    sections.push("(No relevant saved knowledge found)");
  } else {
    for (const item of grouped.knowledge) {
      const parts = [`- Title: ${item.title}`];
      if (item.snippet) parts.push(`  Snippet: ${item.snippet}`);
      if (item.sourceUrl) parts.push(`  Source URL: ${item.sourceUrl}`);
      if (item.mediaType) parts.push(`  Media Type: ${item.mediaType}`);
      sections.push(parts.join("\n"));
    }
  }

  // Section 2: Personal Memory
  sections.push("\n[PERSONAL MEMORY]");
  if (grouped.memory.length === 0) {
    sections.push("(No relevant personal memory found)");
  } else {
    for (const item of grouped.memory) {
      const parts = [`- Item: ${item.title}`];
      if (item.category) parts.push(`  Category: ${item.category}`);
      if (item.snippet) parts.push(`  Memory Value: ${item.snippet}`);
      sections.push(parts.join("\n"));
    }
  }

  // Section 3: Active Tasks
  sections.push("\n[ACTIVE TASKS]");
  if (grouped.tasks.length === 0) {
    sections.push("(No relevant tasks found)");
  } else {
    for (const item of grouped.tasks) {
      const parts = [`- Task: ${item.title}`];
      if (item.status) parts.push(`  Status: ${item.status}`);
      if (item.snippet) parts.push(`  Details: ${item.snippet}`);
      sections.push(parts.join("\n"));
    }
  }

  // Section 4: External Web Sources (strictly demarcated)
  if (externalItems && externalItems.length > 0) {
    sections.push("\n[EXTERNAL WEB SOURCES (NOT USER KNOWLEDGE)]");
    sections.push(
      "WARNING: The following information was retrieved from the external web because internal data was insufficient. This is NOT part of the user's verified personal memory or saved knowledge:"
    );
    for (const item of externalItems) {
      const parts = [`- Web Source: ${item.title}`];
      if (item.snippet) parts.push(`  Snippet: ${item.snippet}`);
      if (item.sourceUrl) parts.push(`  URL: ${item.sourceUrl}`);
      sections.push(parts.join("\n"));
    }
  }

  return sections.join("\n");
}

/**
 * Chat retrieval engine orchestrating multi-layer search and prompt context synthesis.
 */
export class ChatRetriever {
  constructor(
    private readonly repository?: IVyavasthaRepository,
    private readonly externalSearchProvider?: ExternalSearchProvider
  ) {}

  /**
   * Fetches candidate items from the repository safely, handling unimplemented methods.
   */
  private async fetchCandidatesFromRepo(): Promise<SearchCandidate[]> {
    if (!this.repository) {
      return [];
    }

    let knowledge: KnowledgeItem[] = [];
    let memories: PersonalMemoryItem[] = [];
    let tasks: TaskItem[] = [];

    try {
      knowledge = await this.repository.listKnowledge();
    } catch {
      // Gracefully continue if unimplemented or error
    }

    try {
      memories = await this.repository.listMemories();
    } catch {
      // Gracefully continue if unimplemented or error
    }

    try {
      tasks = await this.repository.listTasks();
    } catch {
      // Gracefully continue if unimplemented or error
    }

    return mapDomainToCandidates(knowledge, memories, tasks);
  }

  /**
   * Orchestrates retrieval for a user query.
   */
  public async retrieve(
    query: string,
    options?: ChatRetrieveOptions
  ): Promise<ChatRetrievalResult> {
    const startTime = performance.now();
    const { intent: detectedIntent, externalWebRequested } = detectQueryIntent(query);
    const intent = options?.intent ?? detectedIntent;
    const sufficiencyThreshold = options?.sufficiencyThreshold ?? 0.3;
    const limitPerLayer = options?.limitPerLayer ?? 5;
    const totalLimit = options?.totalLimit ?? 15;

    // Gather candidate items from options or repository
    let candidates = options?.candidates;
    if (!candidates || candidates.length === 0) {
      candidates = await this.fetchCandidatesFromRepo();
    }

    // Perform hybrid ranking across candidates
    const searchQuery: UnifiedSearchQuery = {
      query,
      limit: totalLimit,
    };

    const searchResult = rankCandidates(candidates, searchQuery, {
      intent,
      now: options?.now,
    });

    // Group items with layer limit applied
    const grouped = {
      knowledge: searchResult.grouped.knowledge.slice(0, limitPerLayer),
      memory: searchResult.grouped.memory.slice(0, limitPerLayer),
      tasks: searchResult.grouped.tasks.slice(0, limitPerLayer),
    };

    // Reconstruct prioritized items list
    const items = [...grouped.knowledge, ...grouped.memory, ...grouped.tasks];

    // Determine whether internal data is insufficient
    const hasSufficientMatches = items.some((item) => item.score >= sufficiencyThreshold);
    const isInternalInsufficient = !hasSufficientMatches;

    // External search condition:
    // ONLY when explicitly requested or allowed AND internal data is insufficient
    const isExternalAllowed = options?.allowExternalWeb || externalWebRequested;
    const externalWebRequired = Boolean(isExternalAllowed && isInternalInsufficient);

    let externalItems: SearchItem[] | undefined;
    let externalWebSearched = false;

    if (externalWebRequired && this.externalSearchProvider) {
      try {
        externalItems = await this.externalSearchProvider(query);
        externalWebSearched = true;
      } catch {
        externalItems = [];
      }
    }

    // Package into prompt context obeying strict hierarchy
    const contextPrompt = formatRetrievalPromptContext(grouped, externalItems);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      intent,
      items,
      grouped,
      contextPrompt,
      externalWebSearched,
      externalWebRequired,
      externalItems,
      latencyMs,
    };
  }
}
