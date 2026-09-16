import type { Extractor, ExtractionResult, IngestionRequest } from "../types";

/**
 * Derives a clean human-readable title from the first non-empty line of text.
 */
function deriveTitleFromText(text: string, maxLength = 80): string {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      // Strip markdown header symbols (#, ##, etc.) for a cleaner title
      const cleanLine = trimmed.replace(/^#+\s*/, "").trim();
      if (cleanLine.length <= maxLength) {
        return cleanLine;
      }
      return `${cleanLine.slice(0, maxLength - 1).trim()}…`;
    }
  }
  return "Untitled Note";
}

/**
 * Text note extractor.
 * Fast, in-memory, zero disk overhead.
 */
export class TextExtractor implements Extractor {
  async extract(request: IngestionRequest): Promise<ExtractionResult> {
    const rawText = request.payload ?? "";
    const trimmedText = rawText.trim();

    const title =
      typeof request.metadata?.title === "string" && request.metadata.title.trim()
        ? (request.metadata.title as string).trim()
        : deriveTitleFromText(trimmedText);

    const wordCount = trimmedText ? trimmedText.split(/\s+/).filter(Boolean).length : 0;
    const lineCount = trimmedText ? trimmedText.split("\n").length : 0;

    const sourceUrl =
      typeof request.metadata?.sourceUrl === "string"
        ? (request.metadata.sourceUrl as string)
        : undefined;

    return {
      rawText,
      title,
      sourceUrl,
      mediaType: "note",
      extractedAt: new Date(),
      metadata: {
        ...(request.metadata || {}),
        charCount: rawText.length,
        wordCount,
        lineCount,
        derivedTitle: title,
      },
    };
  }
}

export const textExtractor = new TextExtractor();
