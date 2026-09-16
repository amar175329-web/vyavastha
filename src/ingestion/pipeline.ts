import { assertDiskHeadroom, cleanTmpDir } from "../lib/disk";
import { logger } from "../lib/logger";
import {
  imageExtractor,
  instagramExtractor,
  textExtractor,
  webExtractor,
  youtubeExtractor,
  extractYouTubeVideoId,
  parseInstagramUrl,
} from "./extractors";
import type {
  Extractor,
  ExtractionResult,
  IngestionOptions,
  IngestionPipelineResult,
  IngestionRequest,
  UnderstandingService,
} from "./types";

let globalUnderstandingService: UnderstandingService | null = null;

/**
 * Registers an optional AI understanding service into the global ingestion pipeline.
 */
export function registerUnderstandingService(service: UnderstandingService | null): void {
  globalUnderstandingService = service;
}

/**
 * Determines the most appropriate extractor for a given ingestion request.
 * Resolves explicit modality requests or intelligently detects URLs (YouTube, Instagram, Images, Web).
 */
export function resolveExtractor(request: IngestionRequest): { extractor: Extractor; resolvedType: string } {
  const payload = request.payload?.trim() || "";

  // 1. Explicit YouTube modality
  if (request.type === "youtube") {
    return { extractor: youtubeExtractor, resolvedType: "youtube" };
  }

  // 2. Explicit Instagram modality
  if (request.type === "instagram") {
    return { extractor: instagramExtractor, resolvedType: "instagram" };
  }

  // 3. Explicit Image modality
  if (request.type === "image") {
    return { extractor: imageExtractor, resolvedType: "image" };
  }

  // 4. Explicit Document modality
  if (request.type === "document") {
    // If document is an image or data URI
    if (payload.startsWith("data:image/") || /\.(png|jpe?g|webp|gif)$/i.test(payload)) {
      return { extractor: imageExtractor, resolvedType: "image" };
    }
    return { extractor: textExtractor, resolvedType: "text" };
  }

  // 5. URL modality (or auto-detection for URL payloads)
  const isHttpUrl = payload.startsWith("http://") || payload.startsWith("https://");

  if (request.type === "url" || isHttpUrl) {
    // Check YouTube detection
    if (extractYouTubeVideoId(payload)) {
      return { extractor: youtubeExtractor, resolvedType: "youtube" };
    }

    // Check Instagram detection
    if (parseInstagramUrl(payload)) {
      return { extractor: instagramExtractor, resolvedType: "instagram" };
    }

    // Check direct image URL detection
    if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(payload)) {
      return { extractor: imageExtractor, resolvedType: "image" };
    }

    // Fallback to standard web article reader
    return { extractor: webExtractor, resolvedType: "web" };
  }

  // 6. Base64 Image detection even if marked as text or unspecified
  if (payload.startsWith("data:image/")) {
    return { extractor: imageExtractor, resolvedType: "image" };
  }

  // 7. Default to plain text note extractor
  return { extractor: textExtractor, resolvedType: "text" };
}

/**
 * Main ingestion pipeline entry point for VYAVASTHA.
 *
 * Coordinates:
 * 1. Disk headroom safety check (`assertDiskHeadroom`)
 * 2. Intelligent modality router
 * 3. Extractor execution
 * 4. Optional AI understanding extraction
 * 5. Ephemeral temp file cleanup in `tmp/`
 * 6. Structured result delivery
 */
export async function ingest(
  request: IngestionRequest,
  options?: IngestionOptions
): Promise<IngestionPipelineResult> {
  // 1. Mandatory disk headroom assertion
  if (!options?.skipDiskHeadroomCheck) {
    await assertDiskHeadroom(options?.requiredDiskHeadroomMb);
  }

  // 2. Route to appropriate extractor
  const { extractor, resolvedType } = resolveExtractor(request);
  logger.debug("[INGESTION] Routing request to extractor", {
    requestedType: request.type,
    resolvedType,
    source: request.source,
  });

  let extraction: ExtractionResult;
  try {
    // 3. Execute extraction
    extraction = await extractor.extract(request);
  } finally {
    // 5. Always ensure ephemeral temp cleanup
    try {
      await cleanTmpDir(5 * 60 * 1000); // Clean temp files older than 5 minutes
    } catch (cleanErr) {
      logger.debug("[INGESTION] Non-critical temp cleanup warning", { error: String(cleanErr) });
    }
  }

  // 4. Optionally connect to AI understanding service
  let understanding: unknown = undefined;
  const understandingService = options?.understandingService || globalUnderstandingService;

  if (understandingService) {
    try {
      understanding = await understandingService.understand(extraction);
    } catch (aiErr) {
      const errorMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      logger.warn("[INGESTION] AI understanding service encountered an error", {
        reason: errorMsg,
      });
      // Do not fail the ingestion if AI understanding fails
      extraction.warning = extraction.warning
        ? `${extraction.warning}; AI understanding skipped (${errorMsg})`
        : `AI understanding skipped (${errorMsg})`;
    }
  }

  return {
    extraction,
    understanding,
  };
}
