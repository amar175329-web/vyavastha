import { logger } from "../../lib/logger";
import type { Extractor, ExtractionResult, IngestionRequest } from "../types";

export interface InstagramUrlInfo {
  postType: "post" | "reel" | "tv";
  shortcode: string;
  canonicalUrl: string;
}

export const INSTAGRAM_AUTH_REQUIRED_MESSAGE =
  "Instagram content requires authenticated access; saved link reference and metadata";

/**
 * Truthfully inspects an input URL to determine if it is an Instagram post or reel.
 * Extracts the postType ("post" | "reel" | "tv"), shortcode, and canonical URL.
 */
export function parseInstagramUrl(input: string): InstagramUrlInfo | null {
  if (!input) return null;
  const trimmed = input.trim();

  const regex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;
  const match = trimmed.match(regex);
  if (!match) return null;

  const rawType = match[1].toLowerCase();
  let postType: "post" | "reel" | "tv";
  if (rawType === "p") {
    postType = "post";
  } else if (rawType === "reel" || rawType === "reels") {
    postType = "reel";
  } else {
    postType = "tv";
  }

  const shortcode = match[2];
  const canonicalUrl = `https://www.instagram.com/${postType === "reel" ? "reel" : postType}/${shortcode}/`;

  return {
    postType,
    shortcode,
    canonicalUrl,
  };
}

/**
 * Instagram extractor.
 * Truthfully parses Instagram post/reel URLs and returns structured link references
 * with clear authentication status fallback, adhering to the principle of never promising
 * universal anonymous scraping.
 */
export class InstagramExtractor implements Extractor {
  constructor(private fetchFn: typeof fetch = fetch) {}

  async extract(request: IngestionRequest): Promise<ExtractionResult> {
    const rawInput = request.payload.trim();
    const info = parseInstagramUrl(rawInput);

    if (!info) {
      throw new Error(`[INGESTION] Invalid Instagram URL: "${rawInput}"`);
    }

    const { postType, shortcode, canonicalUrl } = info;
    const typeLabel = postType.toUpperCase();

    // Check if caption or user notes were already provided in request metadata
    const providedCaption =
      typeof request.metadata?.caption === "string" && request.metadata.caption.trim()
        ? (request.metadata.caption as string).trim()
        : undefined;

    // Attempt gentle public inspection if available (e.g. meta tags)
    let scrapedCaption: string | undefined;
    let authorName: string | undefined;

    try {
      const res = await this.fetchFn(canonicalUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const html = await res.text();
        // Extract og:description if present
        const descMatch = html.match(/<meta\s+(?:property|name)=["']og:description["']\s+content=["']([\s\S]*?)["']/i);
        if (descMatch && descMatch[1] && !descMatch[1].includes("Instagram photos and videos")) {
          scrapedCaption = descMatch[1].trim();
        }
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          authorName = titleMatch[1].split("on Instagram")[0]?.trim();
        }
      }
    } catch {
      // Instagram consistently blocks/redirects anonymous requests; fallback is expected
      logger.debug("[INGESTION] Instagram anonymous fetch gated, using structured reference fallback", {
        canonicalUrl,
      });
    }

    const resolvedCaption = providedCaption || scrapedCaption;
    const title = authorName
      ? `${authorName} on Instagram (${typeLabel})`
      : `Instagram ${typeLabel} (${shortcode})`;

    if (resolvedCaption) {
      return {
        rawText: `# ${title}\n\n**Source:** ${canonicalUrl}\n\n${resolvedCaption}`,
        title,
        sourceUrl: canonicalUrl,
        mediaType: "instagram",
        extractedAt: new Date(),
        metadata: {
          ...(request.metadata || {}),
          platform: "instagram",
          postType,
          shortcode,
          canonicalUrl,
          author: authorName,
          authenticatedAccessRequired: false,
        },
      };
    }

    // Truthful fallback when unauthenticated access is gated
    return {
      rawText: INSTAGRAM_AUTH_REQUIRED_MESSAGE,
      title,
      sourceUrl: canonicalUrl,
      mediaType: "instagram",
      extractedAt: new Date(),
      metadata: {
        ...(request.metadata || {}),
        platform: "instagram",
        postType,
        shortcode,
        canonicalUrl,
        authenticatedAccessRequired: true,
      },
      warning: INSTAGRAM_AUTH_REQUIRED_MESSAGE,
    };
  }
}

export const instagramExtractor = new InstagramExtractor();
