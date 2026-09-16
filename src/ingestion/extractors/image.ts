import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { assertDiskHeadroom, ensureTmpDir } from "../../lib/disk";
import { logger } from "../../lib/logger";
import type { Extractor, ExtractionResult, IngestionRequest } from "../types";

/**
 * Maximum permitted image size (20 MB) to prevent out-of-memory and disk depletion.
 */
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Inspects binary magic bytes to determine the image MIME type safely.
 */
export function detectImageMimeType(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/octet-stream";
}

/**
 * Ephemeral image extractor and vision preparation pipeline.
 * Enforces strict disk headroom checks, validates file size limits,
 * processes bytes ephemerally in `tmp/`, cleans up all temp files immediately,
 * and formats the result for vision inspection.
 */
export class ImageExtractor implements Extractor {
  constructor(private fetchFn: typeof fetch = fetch) {}

  async extract(request: IngestionRequest): Promise<ExtractionResult> {
    // 1. Mandatory disk safety guard: Enforce available headroom boundary
    await assertDiskHeadroom();

    const payload = request.payload.trim();
    let buffer: Buffer;
    let explicitMimeType: string | undefined;
    let tempPathToClean: string | null = null;

    try {
      // Scenario A: Data URI (e.g. data:image/png;base64,iVBORw...)
      if (payload.startsWith("data:image/")) {
        const matches = payload.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (!matches) {
          throw new Error("[INGESTION] Malformed image data URI payload");
        }
        explicitMimeType = matches[1];
        buffer = Buffer.from(matches[2], "base64");
      }
      // Scenario B: Remote image URL
      else if (payload.startsWith("http://") || payload.startsWith("https://")) {
        const res = await this.fetchFn(payload, {
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          throw new Error(`[INGESTION] Failed to fetch remote image: HTTP ${res.status}`);
        }
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.startsWith("image/")) {
          explicitMimeType = contentType.split(";")[0].trim();
        }
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      }
      // Scenario C: Local file path
      else if (payload.startsWith("/") || payload.startsWith("./") || payload.includes(path.sep)) {
        tempPathToClean = path.resolve(payload);
        const stat = await fs.stat(tempPathToClean);
        if (stat.size > MAX_IMAGE_SIZE_BYTES) {
          throw new Error(
            `[INGESTION] Image file size (${Math.round(stat.size / 1024 / 1024)} MB) exceeds 20 MB limit`
          );
        }
        buffer = await fs.readFile(tempPathToClean);
      }
      // Scenario D: Raw base64 string
      else {
        buffer = Buffer.from(payload, "base64");
      }

      // 2. Validate payload size boundary
      if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(
          `[INGESTION] Image size (${Math.round(buffer.length / 1024 / 1024)} MB) exceeds maximum allowed limit (20 MB)`
        );
      }

      if (buffer.length === 0) {
        throw new Error("[INGESTION] Empty image payload provided");
      }

      // 3. Ephemeral write & inspection in tmp/ sandbox
      const tmpDir = ensureTmpDir();
      const ephemeralFile = path.join(
        tmpDir,
        `ephemeral_img_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.tmp`
      );

      // Write ephemeral file to ensure disk operations succeed within safety boundary
      await fs.writeFile(ephemeralFile, buffer);

      // Inspect binary
      const detectedMime = detectImageMimeType(buffer);
      const mimeType = explicitMimeType || detectedMime;
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const base64Data = buffer.toString("base64");

      // Clean up the ephemeral file immediately
      await fs.unlink(ephemeralFile).catch(() => {});

      const sizeKb = Math.round(buffer.length / 1024);
      const caption =
        typeof request.metadata?.caption === "string" && request.metadata.caption.trim()
          ? (request.metadata.caption as string).trim()
          : undefined;

      const rawText = caption
        ? `[Image: ${mimeType}, ${sizeKb} KB]\n\nCaption: ${caption}`
        : `[Image: ${mimeType}, ${sizeKb} KB]`;

      const title =
        typeof request.metadata?.title === "string" && request.metadata.title.trim()
          ? (request.metadata.title as string).trim()
          : `Image (${mimeType.replace("image/", "").toUpperCase()})`;

      return {
        rawText,
        title,
        sourceUrl:
          payload.startsWith("http://") || payload.startsWith("https://") ? payload : undefined,
        mediaType: "document",
        extractedAt: new Date(),
        metadata: {
          ...(request.metadata || {}),
          mimeType,
          sizeBytes: buffer.length,
          sizeKb,
          sha256,
          // Vision API payload ready for multimodal LLM inspection
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
      };
    } finally {
      // 4. Guaranteed cleanup of any temp file that was processed
      if (tempPathToClean && tempPathToClean.includes("tmp")) {
        try {
          await fs.unlink(tempPathToClean);
          logger.debug("[INGESTION] Cleaned up temporary image file", { path: tempPathToClean });
        } catch {
          // Ignore error if file was already removed or didn't exist
        }
      }
    }
  }
}

export const imageExtractor = new ImageExtractor();
