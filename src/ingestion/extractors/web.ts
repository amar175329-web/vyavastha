import { getEnv } from "../../lib/env";
import { logger } from "../../lib/logger";
import type { Extractor, ExtractionResult, IngestionRequest } from "../types";

/**
 * Decodes basic and numerical HTML entities into clean readable text.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Extracts clean, readable text from raw HTML by removing scripts, styles,
 * and markup tags while preserving structural linebreaks.
 */
export function extractTextFromHtml(html: string): { text: string; title?: string; description?: string } {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : undefined;

  // Extract meta description or og:description
  const descMatch =
    html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i) ||
    html.match(/<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["']/i);
  const description = descMatch ? decodeHtmlEntities(descMatch[1].trim()) : undefined;

  // Strip head, script, style, svg, noscript, and comment blocks
  let clean = html
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Convert block elements and breaks into newlines
  clean = clean
    .replace(/<\/(p|div|h[1-6]|li|tr|article|section|header|footer)>/gi, "\n")
    .replace(/<br\s*[\/]?>/gi, "\n");

  // Remove all other HTML tags
  clean = clean.replace(/<[^>]+>/g, " ");

  // Decode entities
  clean = decodeHtmlEntities(clean);

  // Normalize whitespace: collapse multiple horizontal spaces, limit consecutive blank lines
  const lines = clean
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0);

  const text = lines.join("\n\n");
  return { text, title, description };
}

/**
 * Safely resolves the Firecrawl API key without throwing or exposing secrets.
 */
function getFirecrawlApiKey(): string | null {
  try {
    const env = getEnv();
    return env.FIRECRAWL_API_KEY || null;
  } catch {
    return process.env.FIRECRAWL_API_KEY || null;
  }
}

/**
 * Webpage extractor.
 * Primary: Firecrawl API (clean markdown extraction).
 * Secondary / Fallback: Native fetch + clean HTML text extractor.
 */
export class WebExtractor implements Extractor {
  constructor(private fetchFn: typeof fetch = fetch) {}

  async extract(request: IngestionRequest): Promise<ExtractionResult> {
    const targetUrl = request.payload.trim();

    // 1. Attempt Firecrawl API extraction if API key is available
    const apiKey = getFirecrawlApiKey();
    if (apiKey) {
      try {
        const firecrawlResult = await this.scrapeWithFirecrawl(targetUrl, apiKey);
        if (firecrawlResult) {
          return {
            ...firecrawlResult,
            metadata: {
              ...(request.metadata || {}),
              ...firecrawlResult.metadata,
            },
          };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn("[INGESTION] Firecrawl scrape failed, switching to native fetch fallback", {
          targetUrl,
          reason: errorMsg,
        });
      }
    }

    // 2. Fallback to native fetch + HTML parser
    return this.fallbackFetch(targetUrl, request.metadata, apiKey ? "Firecrawl scrape failed or returned empty content" : "FIRECRAWL_API_KEY not configured");
  }

  /**
   * Scrapes webpage content using the Firecrawl v1 API.
   */
  private async scrapeWithFirecrawl(targetUrl: string, apiKey: string): Promise<ExtractionResult | null> {
    const response = await this.fetchFn("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["markdown"],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      logger.warn("[INGESTION] Firecrawl API returned error status", {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as {
      success?: boolean;
      data?: {
        markdown?: string;
        metadata?: {
          title?: string;
          description?: string;
          sourceURL?: string;
          statusCode?: number;
          [key: string]: unknown;
        };
      };
    };

    if (!data.success || !data.data?.markdown) {
      return null;
    }

    const markdown = data.data.markdown.trim();
    const title = data.data.metadata?.title || targetUrl;

    return {
      rawText: markdown,
      title,
      sourceUrl: targetUrl,
      mediaType: "article",
      extractedAt: new Date(),
      metadata: {
        provider: "firecrawl",
        description: data.data.metadata?.description,
        statusCode: data.data.metadata?.statusCode || 200,
        ...data.data.metadata,
      },
    };
  }

  /**
   * Fallback extraction using native fetch and robust HTML parser.
   */
  private async fallbackFetch(
    targetUrl: string,
    additionalMetadata?: Record<string, unknown>,
    fallbackReason?: string
  ): Promise<ExtractionResult> {
    try {
      const response = await this.fetchFn(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const parsed = extractTextFromHtml(html);

      return {
        rawText: parsed.text || `[Empty content returned from ${targetUrl}]`,
        title: parsed.title || targetUrl,
        sourceUrl: targetUrl,
        mediaType: "article",
        extractedAt: new Date(),
        metadata: {
          ...(additionalMetadata || {}),
          provider: "fallback_fetch",
          fallbackReason,
          description: parsed.description,
        },
        warning: fallbackReason ? `Extracted via fallback HTML reader (${fallbackReason})` : undefined,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("[INGESTION] Fallback webpage fetch failed", err, { targetUrl });

      // Return a structured graceful result even on network failure
      return {
        rawText: `[Webpage extraction failed for ${targetUrl}: ${errorMsg}]`,
        title: targetUrl,
        sourceUrl: targetUrl,
        mediaType: "article",
        extractedAt: new Date(),
        metadata: {
          ...(additionalMetadata || {}),
          provider: "failed_fetch",
          error: errorMsg,
          fallbackReason,
        },
        warning: `Extraction failed: ${errorMsg}`,
      };
    }
  }
}

export const webExtractor = new WebExtractor();
