/**
 * VYAVASTHA — Lexical Search Engine
 *
 * Implements multi-term lexical tokenization, BM25-like scoring across
 * domain fields (titles, summaries, tags, keys, values, rawContent),
 * exact phrase boost (+2.0x), tag/category exact match boost (+1.5x),
 * and recency decay weighting that favors recent items without discarding
 * older fundamental knowledge.
 */

import type { SearchCandidate } from "./types";

export interface FieldWeights {
  title: number;
  key: number;
  summary: number;
  value: number;
  description: number;
  tags: number;
  category: number;
  rawContent: number;
}

export const DEFAULT_FIELD_WEIGHTS: FieldWeights = {
  title: 3.5,
  key: 3.5,
  summary: 2.0,
  value: 2.0,
  description: 2.0,
  tags: 2.5,
  category: 2.0,
  rawContent: 1.0,
};

export const AVERAGE_FIELD_LENGTHS: Record<keyof FieldWeights, number> = {
  title: 8,
  key: 4,
  summary: 35,
  value: 25,
  description: 30,
  tags: 6,
  category: 2,
  rawContent: 150,
};

export interface RecencyOptions {
  halfLifeDays?: number;
  floor?: number;
}

export interface LexicalScoringOptions {
  fieldWeights?: Partial<FieldWeights>;
  recencyOptions?: RecencyOptions;
  now?: Date;
  k1?: number;
  b?: number;
  corpusDocFreqs?: Map<string, number>;
  corpusTotalDocs?: number;
}

export interface LexicalScoreResult {
  baseScore: number;
  phraseBoostApplied: boolean;
  tagBoostApplied: boolean;
  recencyWeight: number;
  finalScore: number;
  matchedTokens: string[];
}

/**
 * Tokenizes text into lowercase alphanumeric tokens supporting Unicode word boundaries.
 */
export function tokenize(text: string | undefined | null): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Calculates recency weight with an exponential half-life decay and strict floor.
 * Ensures older fundamental knowledge retains at least `floor` (default 0.80) of its weight.
 */
export function calculateRecencyWeight(
  createdAt: Date,
  now: Date = new Date(),
  options?: RecencyOptions
): number {
  const halfLifeDays = options?.halfLifeDays ?? 60;
  const floor = options?.floor ?? 0.80;
  const ageMs = Math.max(0, now.getTime() - createdAt.getTime());
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Exponential decay from 1.0 down towards floor
  const decayFraction = Math.pow(0.5, ageDays / halfLifeDays);
  return floor + (1.0 - floor) * decayFraction;
}

/**
 * Detects if the exact query phrase is present verbatim in document textual fields.
 */
export function checkExactPhraseMatch(candidate: SearchCandidate, query: string): boolean {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 2) return false;

  const targetTexts: (string | undefined)[] = [
    candidate.title,
    candidate.summary,
    candidate.key,
    candidate.value,
    candidate.description,
    candidate.rawContent,
  ];

  for (const text of targetTexts) {
    if (text && text.toLowerCase().includes(cleanQuery)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects if tags or category have an exact match with the query or query terms.
 */
export function checkTagMatch(
  candidate: SearchCandidate,
  query: string,
  queryTokens: string[]
): boolean {
  const cleanQuery = query.trim().toLowerCase();

  if (candidate.category && candidate.category.toLowerCase() === cleanQuery) {
    return true;
  }

  if (candidate.tags && candidate.tags.length > 0) {
    for (const tag of candidate.tags) {
      const lowerTag = tag.trim().toLowerCase();
      if (lowerTag === cleanQuery || queryTokens.includes(lowerTag)) {
        return true;
      }
    }
  }

  if (candidate.category && queryTokens.includes(candidate.category.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Computes term frequencies in a given array of tokens.
 */
function getTermFrequencies(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return freq;
}

/**
 * Computes BM25-like saturated term score for a specific field.
 */
function computeFieldSaturation(
  tf: number,
  fieldLen: number,
  avgLen: number,
  k1: number,
  b: number
): number {
  if (tf <= 0) return 0;
  const lenRatio = avgLen > 0 ? fieldLen / avgLen : 1;
  const denom = tf + k1 * (1 - b + b * lenRatio);
  return (tf * (k1 + 1)) / denom;
}

/**
 * Scores a single candidate document against a search query using lexical matching,
 * BM25 saturation, exact phrase boost (+2.0x), tag match boost (+1.5x), and recency weighting.
 */
export function scoreLexical(
  candidate: SearchCandidate,
  query: string,
  options?: LexicalScoringOptions
): LexicalScoreResult {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return {
      baseScore: 0,
      phraseBoostApplied: false,
      tagBoostApplied: false,
      recencyWeight: 1,
      finalScore: 0,
      matchedTokens: [],
    };
  }

  const fieldWeights: FieldWeights = {
    ...DEFAULT_FIELD_WEIGHTS,
    ...(options?.fieldWeights ?? {}),
  };

  const k1 = options?.k1 ?? 1.2;
  const b = options?.b ?? 0.75;
  const now = options?.now ?? new Date();

  // Extract field token maps
  const fieldTokens: Record<keyof FieldWeights, string[]> = {
    title: tokenize(candidate.title),
    key: tokenize(candidate.key),
    summary: tokenize(candidate.summary),
    value: tokenize(candidate.value),
    description: tokenize(candidate.description),
    tags: candidate.tags ? candidate.tags.flatMap((t) => tokenize(t)) : [],
    category: tokenize(candidate.category),
    rawContent: tokenize(candidate.rawContent),
  };

  const fieldFreqs: Record<keyof FieldWeights, Map<string, number>> = {
    title: getTermFrequencies(fieldTokens.title),
    key: getTermFrequencies(fieldTokens.key),
    summary: getTermFrequencies(fieldTokens.summary),
    value: getTermFrequencies(fieldTokens.value),
    description: getTermFrequencies(fieldTokens.description),
    tags: getTermFrequencies(fieldTokens.tags),
    category: getTermFrequencies(fieldTokens.category),
    rawContent: getTermFrequencies(fieldTokens.rawContent),
  };

  const matchedTokensSet = new Set<string>();
  let rawBm25Score = 0;

  for (const token of queryTokens) {
    let tokenFieldScore = 0;
    let tokenMatched = false;

    for (const [fieldName, weight] of Object.entries(fieldWeights) as [
      keyof FieldWeights,
      number,
    ][]) {
      const tf = fieldFreqs[fieldName].get(token) ?? 0;
      if (tf > 0) {
        tokenMatched = true;
        const fieldLen = fieldTokens[fieldName].length;
        const avgLen = AVERAGE_FIELD_LENGTHS[fieldName];
        const sat = computeFieldSaturation(tf, fieldLen, avgLen, k1, b);
        tokenFieldScore += weight * sat;
      }
    }

    if (tokenMatched) {
      matchedTokensSet.add(token);

      // Compute IDF
      let idf = 1.0;
      if (options?.corpusDocFreqs && options?.corpusTotalDocs) {
        const docFreq = options.corpusDocFreqs.get(token) ?? 1;
        const total = options.corpusTotalDocs;
        idf = Math.log(1 + (total - docFreq + 0.5) / (docFreq + 0.5));
        if (idf < 0.1) idf = 0.1;
      }

      rawBm25Score += tokenFieldScore * idf;
    }
  }

  // If no tokens matched across any field, candidate score is 0
  if (matchedTokensSet.size === 0) {
    return {
      baseScore: 0,
      phraseBoostApplied: false,
      tagBoostApplied: false,
      recencyWeight: calculateRecencyWeight(candidate.createdAt, now, options?.recencyOptions),
      finalScore: 0,
      matchedTokens: [],
    };
  }

  // Exact phrase match boost (+2.0x)
  const phraseBoostApplied = checkExactPhraseMatch(candidate, query);
  const phraseMultiplier = phraseBoostApplied ? 2.0 : 1.0;

  // Tag / category exact match boost (+1.5x)
  const tagBoostApplied = checkTagMatch(candidate, query, queryTokens);
  const tagMultiplier = tagBoostApplied ? 1.5 : 1.0;

  // Recency decay weighting
  const recencyWeight = calculateRecencyWeight(
    candidate.createdAt,
    now,
    options?.recencyOptions
  );

  const finalScore = rawBm25Score * phraseMultiplier * tagMultiplier * recencyWeight;

  return {
    baseScore: rawBm25Score,
    phraseBoostApplied,
    tagBoostApplied,
    recencyWeight,
    finalScore,
    matchedTokens: Array.from(matchedTokensSet),
  };
}

/**
 * Scores a collection of candidate documents, computing corpus-wide document frequencies
 * for accurate BM25 IDF weighting.
 */
export function scoreCandidates(
  candidates: SearchCandidate[],
  query: string,
  options?: LexicalScoringOptions
): Map<string, LexicalScoreResult> {
  const queryTokens = tokenize(query);
  const docFreqs = new Map<string, number>();

  for (const candidate of candidates) {
    const candidateTokens = new Set<string>([
      ...tokenize(candidate.title),
      ...tokenize(candidate.key),
      ...tokenize(candidate.summary),
      ...tokenize(candidate.value),
      ...tokenize(candidate.description),
      ...(candidate.tags ? candidate.tags.flatMap((t) => tokenize(t)) : []),
      ...tokenize(candidate.category),
      ...tokenize(candidate.rawContent),
    ]);

    for (const qToken of queryTokens) {
      if (candidateTokens.has(qToken)) {
        docFreqs.set(qToken, (docFreqs.get(qToken) ?? 0) + 1);
      }
    }
  }

  const results = new Map<string, LexicalScoreResult>();
  const mergedOptions: LexicalScoringOptions = {
    ...options,
    corpusDocFreqs: docFreqs,
    corpusTotalDocs: candidates.length,
  };

  for (const candidate of candidates) {
    results.set(candidate.id, scoreLexical(candidate, query, mergedOptions));
  }

  return results;
}
