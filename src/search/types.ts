/**
 * VYAVASTHA — Search Types & Interfaces
 *
 * Provides type contracts for unified search across:
 * - Layer A: Saved Knowledge
 * - Layer B: Personal Memory
 * - Layer C: Tasks / Intentions
 */

export type SearchLayer = "knowledge" | "memory" | "tasks";

export type SearchIntent = "identity" | "knowledge" | "todo" | "general";

/**
 * Standardized search result item across all layers.
 */
export interface SearchItem {
  id: string;
  layer: SearchLayer;
  title: string;
  snippet: string;
  score: number;
  mediaType?: string;
  category?: string;
  status?: string;
  createdAt: Date;
  sourceUrl?: string;
}

/**
 * Filter options for unified search queries.
 */
export interface UnifiedSearchFilters {
  mediaType?: string;
  category?: string;
  status?: string;
}

/**
 * Unified multi-layer search query.
 */
export interface UnifiedSearchQuery {
  query: string;
  layers?: Array<SearchLayer>;
  limit?: number;
  filters?: UnifiedSearchFilters;
}

/**
 * Grouped and prioritized search result.
 */
export interface UnifiedSearchResult {
  items: SearchItem[];
  grouped: {
    knowledge: SearchItem[];
    memory: SearchItem[];
    tasks: SearchItem[];
  };
  totalCount: number;
  latencyMs: number;
}

/**
 * Candidate document representation for lexical and hybrid ranking.
 */
export interface SearchCandidate {
  id: string;
  layer: SearchLayer;
  title: string;
  summary?: string;
  rawContent?: string;
  key?: string;
  value?: string;
  description?: string;
  tags?: string[];
  category?: string;
  mediaType?: string;
  status?: string;
  sourceUrl?: string;
  createdAt: Date;
  updatedAt?: Date;
  confidenceScore?: number;
  confirmedByUser?: boolean;
}

/**
 * Intent classification and retrieval prompt context output.
 */
export interface ChatRetrievalResult {
  intent: SearchIntent;
  items: SearchItem[];
  grouped: {
    knowledge: SearchItem[];
    memory: SearchItem[];
    tasks: SearchItem[];
  };
  contextPrompt: string;
  externalWebSearched: boolean;
  externalWebRequired: boolean;
  externalItems?: SearchItem[];
  latencyMs: number;
}
