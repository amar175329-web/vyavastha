import { logger } from "../../lib/logger";
import type { Extractor, ExtractionResult, IngestionRequest } from "../types";
import { decodeHtmlEntities } from "./web";

/**
 * Robustly extracts the 11-character YouTube video ID from any valid YouTube URL
 * (standard watch, short youtu.be, mobile m.youtube, shorts, embed, live, or raw ID).
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If input is directly an 11-character ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const urlStr = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(urlStr);
    const hostname = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

    // Short links: youtu.be/ID
    if (hostname === "youtu.be") {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return id;
      }
    }

    // Standard youtube.com links
    if (hostname === "youtube.com") {
      // 1. Query parameter ?v=ID
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return v;
      }

      // 2. Path routing: /shorts/ID, /embed/ID, /v/ID, /live/ID
      const pathParts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "v", "live"].includes(pathParts[0]) && pathParts[1]) {
        const candidate = pathParts[1].split(/[?&#]/)[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // Continue to regex fallback
  }

  // General regex fallback
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  const match = trimmed.match(regex);
  return match ? match[1] : null;
}

/**
 * Normalizes any YouTube URL or video ID to the canonical watch URL:
 * https://www.youtube.com/watch?v={videoId}
 */
export function normalizeYouTubeUrl(input: string): string {
  const videoId = extractYouTubeVideoId(input);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return input.trim();
}

/**
 * YouTube metadata and transcript extractor.
 * Fetches oEmbed metadata and attempts timedtext captions extraction.
 */
export class YouTubeExtractor implements Extractor {
  constructor(private fetchFn: typeof fetch = fetch) {}

  async extract(request: IngestionRequest): Promise<ExtractionResult> {
    const rawInput = request.payload.trim();
    const videoId = extractYouTubeVideoId(rawInput);

    if (!videoId) {
      throw new Error(`[INGESTION] Invalid YouTube URL or video ID: "${rawInput}"`);
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 1. Fetch public oEmbed metadata (title, author, thumbnail)
    const oembed = await this.fetchOEmbed(canonicalUrl);

    // 2. Fetch public timedtext captions / transcript
    const transcriptResult = await this.fetchTimedTextTranscript(videoId);

    let rawText: string;
    let warning: string | undefined;

    if (transcriptResult.transcript) {
      rawText = `# ${oembed?.title || `YouTube Video ${videoId}`}\n\n**Channel:** ${oembed?.author_name || "Unknown"}\n**Video URL:** ${canonicalUrl}\n\n## Transcript\n\n${transcriptResult.transcript}`;
    } else {
      rawText = `# ${oembed?.title || `YouTube Video ${videoId}`}\n\n**Channel:** ${oembed?.author_name || "Unknown"}\n**Video URL:** ${canonicalUrl}\n\n[Transcript unavailable - captions disabled or restricted by publisher]`;
      warning = "Captions not available for this video; extracted oEmbed metadata.";
    }

    const title = oembed?.title || `YouTube Video (${videoId})`;

    return {
      rawText,
      title,
      sourceUrl: canonicalUrl,
      mediaType: "youtube",
      extractedAt: new Date(),
      metadata: {
        ...(request.metadata || {}),
        videoId,
        author: oembed?.author_name,
        authorUrl: oembed?.author_url,
        thumbnailUrl: oembed?.thumbnail_url,
        transcriptAvailable: Boolean(transcriptResult.transcript),
        transcriptLanguage: transcriptResult.language,
      },
      warning,
    };
  }

  /**
   * Fetches official oEmbed JSON from YouTube.
   */
  private async fetchOEmbed(videoUrl: string): Promise<{
    title?: string;
    author_name?: string;
    author_url?: string;
    thumbnail_url?: string;
  } | null> {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
      const res = await this.fetchFn(oembedUrl, {
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return null;
      }

      return (await res.json()) as {
        title?: string;
        author_name?: string;
        author_url?: string;
        thumbnail_url?: string;
      };
    } catch (err) {
      logger.debug("[INGESTION] YouTube oEmbed fetch skipped or failed", {
        url: videoUrl,
        error: String(err),
      });
      return null;
    }
  }

  /**
   * Attempts to fetch subtitles/captions from the public YouTube timedtext endpoint.
   */
  private async fetchTimedTextTranscript(videoId: string): Promise<{
    transcript?: string;
    language?: string;
  }> {
    // Try English captions first
    const languages = ["en", "en-US", "en-GB"];

    for (const lang of languages) {
      try {
        const timedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`;
        const res = await this.fetchFn(timedTextUrl, {
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) continue;

        const xml = await res.text();
        if (!xml || !xml.includes("<text")) continue;

        // Parse <text> nodes from timedtext XML
        const textMatches = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi));
        if (textMatches.length > 0) {
          const lines = textMatches
            .map((m) => decodeHtmlEntities(m[1].trim()))
            .filter((line) => line.length > 0);

          if (lines.length > 0) {
            return {
              transcript: lines.join("\n"),
              language: lang,
            };
          }
        }
      } catch {
        // Continue trying next language or return empty
      }
    }

    return {};
  }
}

export const youtubeExtractor = new YouTubeExtractor();
