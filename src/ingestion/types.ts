/**
 * VYAVASTHA — Ingestion Engine Types & Contracts
 *
 * Defines the core data models for raw input intake, multimodal routing,
 * and structured extraction across all input modalities (text notes, articles,
 * YouTube videos, Instagram posts/reels, images, documents).
 */

export type IngestionType =
  | "text"
  | "url"
  | "youtube"
  | "instagram"
  | "image"
  | "document";

export type IngestionSource = "web" | "telegram" | "api";

export type IngestionMediaType =
  | "youtube"
  | "instagram"
  | "article"
  | "audio"
  | "document"
  | "note";

/**
 * Standard input request passed into the ingestion pipeline.
 */
export interface IngestionRequest {
  type: IngestionType;
  payload: string; // text content, URL, base64 data URI, or file path
  source: IngestionSource;
  metadata?: Record<string, unknown>;
}

/**
 * Normalized output produced by the extractors.
 */
export interface ExtractionResult {
  rawText: string;
  title?: string;
  sourceUrl?: string;
  mediaType: IngestionMediaType;
  extractedAt: Date;
  metadata: Record<string, unknown>;
  warning?: string;
}

/**
 * Extractor interface implemented by each modality-specific extractor.
 */
export interface Extractor {
  extract(request: IngestionRequest): Promise<ExtractionResult>;
}

/**
 * AI understanding hook/service interface.
 */
export interface UnderstandingService {
  understand(extraction: ExtractionResult): Promise<unknown>;
}

/**
 * Options for configuring pipeline execution.
 */
export interface IngestionOptions {
  understandingService?: UnderstandingService;
  skipDiskHeadroomCheck?: boolean;
  requiredDiskHeadroomMb?: number;
}

/**
 * Pipeline result wrapping extraction and optional AI understanding.
 */
export interface IngestionPipelineResult {
  extraction: ExtractionResult;
  understanding?: unknown;
}
