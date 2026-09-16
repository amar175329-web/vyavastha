/**
 * VYAVASTHA — Hybrid Ranking Engine
 *
 * Combines lexical BM25-like scoring, layer weighting (Knowledge: 1.0,
 * Memory: 1.2 for identity queries, Tasks: 0.9 for to-do queries),
 * and recency decay.
 * Normalizes scores to 0.0 - 1.0, deduplicates items, and extracts snippets
 * centered around matched search terms.
 */

import { scoreCandidates, tokenize, type LexicalScoreResult } from "./lexical";
import type {
  SearchCandidate,
  SearchItem,
  SearchIntent,
  SearchLayer,
  UnifiedSearchQuery,
  UnifiedSearchResult,
} from "./types";

export interface RankingOptions {
  intent?: SearchIntent;
  layerWeights?: Partial<Record<SearchLayer, number>>;
  now?: Date;
  snippetMaxLength?: number;
  minScoreThreshold?: number;
}

/**
 * Resolves layer weight according to query intent:
 * - Knowledge: 1.0 (baseline)
 * - Memory: 1.2 for identity queries
 * - Tasks: 0.9 for to-do queries
 */
export function resolveLayerWeights(
  intent: SearchIntent = "general",
  overrides?: Partial<Record<SearchLayer, number>>
): Record<SearchLayer, number> {
  const baseWeights: Record<SearchLayer, number> = {
    knowledge: 1.0,
    memory: intent === "identity" ? 1.2 : 1.0,
    tasks: intent === "todo" ? 0.9 : 0.8,
  };

  return {
    ...baseWeights,
    ...(overrides ?? {}),
  };
}

/**
 * Extracts a readable snippet of text centered around matched search terms.
 */
export function extractSnippetAroundMatches(
  candidate: SearchCandidate,
  query: string,
  matchedTokens: string[],
  maxLength: number = 160
): string {
  // Determine primary text source
  const primaryText =
    candidate.summary ||
    candidate.value ||
    candidate.description ||
    candidate.rawContent ||
    candidate.title ||
    "";

  if (!primaryText || primaryText.trim().length === 0) {
    return "";
  }

  const cleanText = primaryText.replace(/\s+/g, " ").trim();
  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  const lowerText = cleanText.toLowerCase();
  const cleanQuery = query.trim().toLowerCase();

  // 1. Try finding exact phrase match first
  let matchIndex = cleanQuery.length > 1 ? lowerText.indexOf(cleanQuery) : -1;
  let matchLen = cleanQuery.length;

  // 2. If no exact phrase, find the earliest matching token
  if (matchIndex === -1 && matchedTokens.length > 0) {
    for (const token of matchedTokens) {
      const idx = lowerText.indexOf(token.toLowerCase());
      if (idx !== -1 && (matchIndex === -1 || idx < matchIndex)) {
        matchIndex = idx;
        matchLen = token.length;
      }
    }
  }

  // 3. Fall back to rawContent if primary text had no match but rawContent might
  if (matchIndex === -1 && candidate.rawContent) {
    const rawClean = candidate.rawContent.replace(/\s+/g, " ").trim();
    const rawLower = rawClean.toLowerCase();
    const rawMatch = cleanQuery.length > 1 ? rawLower.indexOf(cleanQuery) : -1;
    if (rawMatch !== -1) {
      return extractWindow(rawClean, rawMatch, cleanQuery.length, maxLength);
    }
  }

  // If no match found anywhere, return prefix of primary text
  if (matchIndex === -1) {
    return cleanText.slice(0, maxLength).trim() + "...";
  }

  return extractWindow(cleanText, matchIndex, matchLen, maxLength);
}

/**
 * Helper to slice a window around a match index with leading/trailing ellipses.
 */
function extractWindow(
  text: string,
  matchIndex: number,
  matchLen: number,
  maxLength: number
): string {
  const halfWindow = Math.floor((maxLength - matchLen) / 2);
  let start = Math.max(0, matchIndex - halfWindow);
  let end = Math.min(text.length, start + maxLength);

  // Adjust start to word boundary if not at 0
  if (start > 0) {
    const spaceAfterStart = text.indexOf(" ", start);
    if (spaceAfterStart !== -1 && spaceAfterStart < matchIndex) {
      start = spaceAfterStart + 1;
    }
  }

  // Adjust end to word boundary if not at end
  if (end < text.length) {
    const spaceBeforeEnd = text.lastIndexOf(" ", end);
    if (spaceBeforeEnd > matchIndex + matchLen) {
      end = spaceBeforeEnd;
    }
  }

  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

/**
 * Deduplicates candidates, keeping the version with the highest composite score.
 */
export function deduplicateScoredItems(
  scoredItems: Array<{ candidate: SearchCandidate; score: number; lexical: LexicalScoreResult }>
): Array<{ candidate: SearchCandidate; score: number; lexical: LexicalScoreResult }> {
  const seenMap = new Map<
    string,
    { candidate: SearchCandidate; score: number; lexical: LexicalScoreResult }
  >();

  for (const item of scoredItems) {
    const idKey = item.candidate.id;
    const urlKey = item.candidate.sourceUrl ? `url:${item.candidate.sourceUrl}` : null;
    const titleKey = `${item.candidate.layer}:${item.candidate.title.toLowerCase().trim()}`;

    // Check if duplicate exists
    const existing = seenMap.get(idKey) ?? (urlKey ? seenMap.get(urlKey) : null) ?? seenMap.get(titleKey);

    if (!existing || item.score > existing.score) {
      seenMap.set(idKey, item);
      if (urlKey) seenMap.set(urlKey, item);
      seenMap.set(titleKey, item);
    }
  }

  // Collect unique items
  const uniqueItems = new Set<{
    candidate: SearchCandidate;
    score: number;
    lexical: LexicalScoreResult;
  }>();

  for (const item of seenMap.values()) {
    uniqueItems.add(item);
  }

  return Array.from(uniqueItems);
}

/**
 * Hybrid ranking engine executing:
 * 1. Candidate filtering (by layer and metadata filters)
 * 2. Multi-term BM25 lexical scoring with phrase/tag boosts & recency
 * 3. Layer weighting based on query intent
 * 4. Deduplication
 * 5. Score normalization (strictly 0.0 - 1.0)
 * 6. Term-centered snippet extraction
 * 7. Multi-layer grouping and pagination
 */
export function rankCandidates(
  candidates: SearchCandidate[],
  searchQuery: UnifiedSearchQuery,
  options?: RankingOptions
): UnifiedSearchResult {
  const startTime = performance.now();
  const query = searchQuery.query;
  const intent = options?.intent ?? "general";
  const layerWeights = resolveLayerWeights(intent, options?.layerWeights);
  const snippetMaxLength = options?.snippetMaxLength ?? 160;
  const minScoreThreshold = options?.minScoreThreshold ?? 0.0;
  const limit = searchQuery.limit ?? 20;

  // 1. Filter candidates by requested layers
  let filtered = candidates;
  if (searchQuery.layers && searchQuery.layers.length > 0) {
    const allowedLayers = new Set(searchQuery.layers);
    filtered = filtered.filter((c) => allowedLayers.has(c.layer));
  }

  // 2. Filter by optional metadata filters
  if (searchQuery.filters) {
    const { mediaType, category, status } = searchQuery.filters;
    if (mediaType) {
      filtered = filtered.filter((c) => c.mediaType === mediaType);
    }
    if (category) {
      filtered = filtered.filter((c) => c.category === category);
    }
    if (status) {
      filtered = filtered.filter((c) => c.status === status);
    }
  }

  if (filtered.length === 0) {
    return {
      items: [],
      grouped: { knowledge: [], memory: [], tasks: [] },
      totalCount: 0,
      latencyMs: Math.round(performance.now() - startTime),
    };
  }

  // 3. Score candidates with lexical engine
  const lexicalScores = scoreCandidates(filtered, query, {
    now: options?.now,
  });

  // 4. Combine lexical score with layer weights
  const compositeScored: Array<{
    candidate: SearchCandidate;
    score: number;
    lexical: LexicalScoreResult;
  }> = [];

  for (const candidate of filtered) {
    const lexical = lexicalScores.get(candidate.id);
    if (!lexical || lexical.finalScore <= 0) continue;

    const layerWeight = layerWeights[candidate.layer] ?? 1.0;
    const compositeScore = lexical.finalScore * layerWeight;

    compositeScored.push({
      candidate,
      score: compositeScore,
      lexical,
    });
  }

  if (compositeScored.length === 0) {
    return {
      items: [],
      grouped: { knowledge: [], memory: [], tasks: [] },
      totalCount: 0,
      latencyMs: Math.round(performance.now() - startTime),
    };
  }

  // 5. Deduplicate scored candidates
  const deduplicated = deduplicateScoredItems(compositeScored);

  // 6. Normalize scores to 0.0 - 1.0 range
  let maxScore = 0;
  for (const item of deduplicated) {
    if (item.score > maxScore) {
      maxScore = item.score;
    }
  }

  const normalizedItems: SearchItem[] = [];

  for (const item of deduplicated) {
    const rawNormalized = maxScore > 0 ? item.score / maxScore : 0;
    const normalizedScore = Number(Math.min(1.0, Math.max(0.0, rawNormalized)).toFixed(4));

    if (normalizedScore < minScoreThreshold) continue;

    // Snippet extraction around matched terms
    const snippet = extractSnippetAroundMatches(
      item.candidate,
      query,
      item.lexical.matchedTokens,
      snippetMaxLength
    );

    // Human-readable title
    let displayTitle = item.candidate.title;
    if (!displayTitle && item.candidate.layer === "memory" && item.candidate.key) {
      displayTitle = item.candidate.category
        ? `[${item.candidate.category.toUpperCase()}] ${item.candidate.key}`
        : item.candidate.key;
    }

    normalizedItems.push({
      id: item.candidate.id,
      layer: item.candidate.layer,
      title: displayTitle || "Untitled",
      snippet,
      score: normalizedScore,
      mediaType: item.candidate.mediaType,
      category: item.candidate.category,
      status: item.candidate.status,
      createdAt: item.candidate.createdAt,
      sourceUrl: item.candidate.sourceUrl,
    });
  }

  // 7. Sort by normalized score desc, tie-break with createdAt desc
  normalizedItems.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const totalCount = normalizedItems.length;
  const paginatedItems = normalizedItems.slice(0, limit);

  // Group by layer
  const grouped = {
    knowledge: paginatedItems.filter((i) => i.layer === "knowledge"),
    memory: paginatedItems.filter((i) => i.layer === "memory"),
    tasks: paginatedItems.filter((i) => i.layer === "tasks"),
  };

  return {
    items: paginatedItems,
    grouped,
    totalCount,
    latencyMs: Math.round(performance.now() - startTime),
  };
}
