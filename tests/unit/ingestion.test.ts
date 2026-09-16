import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  TextExtractor,
  textExtractor,
} from "../../src/ingestion/extractors/text";
import {
  WebExtractor,
  decodeHtmlEntities,
  extractTextFromHtml,
} from "../../src/ingestion/extractors/web";
import {
  YouTubeExtractor,
  extractYouTubeVideoId,
  normalizeYouTubeUrl,
} from "../../src/ingestion/extractors/youtube";
import {
  InstagramExtractor,
  parseInstagramUrl,
  INSTAGRAM_AUTH_REQUIRED_MESSAGE,
} from "../../src/ingestion/extractors/instagram";
import {
  ImageExtractor,
  detectImageMimeType,
  MAX_IMAGE_SIZE_BYTES,
} from "../../src/ingestion/extractors/image";
import {
  ingest,
  resolveExtractor,
  registerUnderstandingService,
} from "../../src/ingestion/pipeline";
import type {
  IngestionRequest,
  UnderstandingService,
} from "../../src/ingestion/types";
import { TMP_DIR } from "../../src/lib/disk";

describe("Text Extractor (src/ingestion/extractors/text.ts)", () => {
  test("extracts plain text note with accurate metrics and zero disk overhead", async () => {
    const request: IngestionRequest = {
      type: "text",
      source: "web",
      payload: "# Architectural Decision\n\nWe decided to use Turso for libSQL serverless database.",
    };

    const result = await textExtractor.extract(request);

    expect(result.mediaType).toBe("note");
    expect(result.rawText).toBe(request.payload);
    expect(result.title).toBe("Architectural Decision");
    expect(result.metadata.charCount).toBe(request.payload.length);
    expect(result.metadata.wordCount).toBe(12);
    expect(result.metadata.lineCount).toBe(3);
    expect(result.extractedAt).toBeInstanceOf(Date);
  });

  test("derives title from first non-empty line or truncates long titles", async () => {
    const longLine = "A".repeat(120);
    const request: IngestionRequest = {
      type: "text",
      source: "api",
      payload: `\n\n   \n${longLine}\nSecond line here`,
    };

    const result = await textExtractor.extract(request);
    expect(result.title?.length).toBeLessThanOrEqual(80);
    expect(result.title?.endsWith("…")).toBe(true);
  });

  test("uses explicit title from metadata if provided", async () => {
    const request: IngestionRequest = {
      type: "text",
      source: "telegram",
      payload: "Some random body content",
      metadata: { title: "Custom Explicit Title" },
    };

    const result = await textExtractor.extract(request);
    expect(result.title).toBe("Custom Explicit Title");
  });

  test("defaults to 'Untitled Note' for empty whitespace text", async () => {
    const request: IngestionRequest = {
      type: "text",
      source: "web",
      payload: "   \n\t  \n  ",
    };

    const result = await textExtractor.extract(request);
    expect(result.title).toBe("Untitled Note");
    expect(result.metadata.wordCount).toBe(0);
  });
});

describe("YouTube Extractor & Normalizer (src/ingestion/extractors/youtube.ts)", () => {
  test("extracts video ID across all valid YouTube URL variations", () => {
    const testCases = [
      { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { url: "https://youtube.com/watch?v=dQw4w9WgXcQ&feature=share", expected: "dQw4w9WgXcQ" },
      { url: "https://youtu.be/dQw4w9WgXcQ?t=42", expected: "dQw4w9WgXcQ" },
      { url: "https://m.youtube.com/watch?v=dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { url: "https://www.youtube.com/embed/dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { url: "https://www.youtube.com/live/dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { url: "dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
    ];

    for (const { url, expected } of testCases) {
      expect(extractYouTubeVideoId(url)).toBe(expected);
      expect(normalizeYouTubeUrl(url)).toBe(`https://www.youtube.com/watch?v=${expected}`);
    }
  });

  test("returns null for non-YouTube URLs or invalid strings", () => {
    expect(extractYouTubeVideoId("https://example.com/watch?v=1234")).toBeNull();
    expect(extractYouTubeVideoId("not-a-valid-id-too-long-or-short")).toBeNull();
    expect(extractYouTubeVideoId("")).toBeNull();
  });

  test("extracts YouTube metadata and timedtext transcript when available", async () => {
    const mockFetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("oembed")) {
        return new Response(
          JSON.stringify({
            title: "Rick Astley - Never Gonna Give You Up",
            author_name: "RickAstleyVEVO",
            author_url: "https://www.youtube.com/@RickAstleyVEVO",
            thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("timedtext")) {
        const sampleXml = `
          <transcript>
            <text start="1.2" dur="2.4">We're no strangers to love</text>
            <text start="3.6" dur="2.1">You know the rules and so do I</text>
          </transcript>
        `;
        return new Response(sampleXml, { status: 200, headers: { "Content-Type": "text/xml" } });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const extractor = new YouTubeExtractor(mockFetch);
    const result = await extractor.extract({
      type: "youtube",
      source: "telegram",
      payload: "https://youtu.be/dQw4w9WgXcQ",
    });

    expect(result.mediaType).toBe("youtube");
    expect(result.title).toBe("Rick Astley - Never Gonna Give You Up");
    expect(result.sourceUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.metadata.videoId).toBe("dQw4w9WgXcQ");
    expect(result.metadata.author).toBe("RickAstleyVEVO");
    expect(result.metadata.transcriptAvailable).toBe(true);
    expect(result.rawText).toContain("We're no strangers to love");
    expect(result.rawText).toContain("You know the rules and so do I");
  });

  test("gracefully falls back when captions are restricted or unavailable", async () => {
    const mockFetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("oembed")) {
        return new Response(
          JSON.stringify({
            title: "Private Captions Video",
            author_name: "Creator",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      // Timedtext fails / 404
      return new Response("No captions", { status: 404 });
    }) as unknown as typeof fetch;

    const extractor = new YouTubeExtractor(mockFetch);
    const result = await extractor.extract({
      type: "youtube",
      source: "web",
      payload: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(result.metadata.transcriptAvailable).toBe(false);
    expect(result.warning).toContain("Captions not available for this video");
    expect(result.rawText).toContain("[Transcript unavailable - captions disabled or restricted by publisher]");
  });

  test("throws an error when video ID cannot be determined", async () => {
    const extractor = new YouTubeExtractor();
    expect(async () => {
      await extractor.extract({
        type: "youtube",
        source: "api",
        payload: "https://invalid-video-url.com",
      });
    }).toThrow("Invalid YouTube URL or video ID");
  });
});

describe("Instagram Extractor (src/ingestion/extractors/instagram.ts)", () => {
  test("truthfully parses Instagram post, reel, and TV URLs", () => {
    const postInfo = parseInstagramUrl("https://www.instagram.com/p/DB12345Abc/");
    expect(postInfo).not.toBeNull();
    expect(postInfo?.postType).toBe("post");
    expect(postInfo?.shortcode).toBe("DB12345Abc");
    expect(postInfo?.canonicalUrl).toBe("https://www.instagram.com/post/DB12345Abc/");

    const reelInfo = parseInstagramUrl("https://instagram.com/reel/C89xyz123/?utm_source=ig_web");
    expect(reelInfo).not.toBeNull();
    expect(reelInfo?.postType).toBe("reel");
    expect(reelInfo?.shortcode).toBe("C89xyz123");
    expect(reelInfo?.canonicalUrl).toBe("https://www.instagram.com/reel/C89xyz123/");

    const reelsInfo = parseInstagramUrl("https://www.instagram.com/reels/C89xyz123/");
    expect(reelsInfo?.postType).toBe("reel");

    const nonIg = parseInstagramUrl("https://twitter.com/user/status/12345");
    expect(nonIg).toBeNull();
  });

  test("truthfully falls back for unauthenticated content without false scraping promises", async () => {
    // Mock Instagram login wall redirect / empty response
    const mockFetch = (async () => {
      return new Response("Login required", { status: 302 });
    }) as unknown as typeof fetch;

    const extractor = new InstagramExtractor(mockFetch);
    const result = await extractor.extract({
      type: "instagram",
      source: "telegram",
      payload: "https://www.instagram.com/reel/C89xyz123/",
    });

    expect(result.mediaType).toBe("instagram");
    expect(result.sourceUrl).toBe("https://www.instagram.com/reel/C89xyz123/");
    expect(result.rawText).toBe(INSTAGRAM_AUTH_REQUIRED_MESSAGE);
    expect(result.warning).toBe(INSTAGRAM_AUTH_REQUIRED_MESSAGE);
    expect(result.metadata.authenticatedAccessRequired).toBe(true);
    expect(result.metadata.shortcode).toBe("C89xyz123");
    expect(result.metadata.postType).toBe("reel");
  });

  test("uses caption when provided in metadata or accessible tags", async () => {
    const extractor = new InstagramExtractor();
    const result = await extractor.extract({
      type: "instagram",
      source: "web",
      payload: "https://www.instagram.com/p/DB12345Abc/",
      metadata: { caption: "A beautiful sunset over the mountains #nature" },
    });

    expect(result.rawText).toContain("A beautiful sunset over the mountains #nature");
    expect(result.metadata.authenticatedAccessRequired).toBe(false);
  });
});

describe("Web Extractor & Fallback (src/ingestion/extractors/web.ts)", () => {
  test("decodes various HTML entities properly", () => {
    const raw = "AT&amp;T &lt;corp&gt; &quot;innovates&quot; &#39;fast&#39; &#65; &#x42;";
    expect(decodeHtmlEntities(raw)).toBe("AT&T <corp> \"innovates\" 'fast' A B");
  });

  test("extracts clean text from HTML, stripping scripts and styles", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>System Architecture Overview</title>
          <meta name="description" content="Technical guide for system design">
          <style>body { background: #000; }</style>
          <script>console.log("tracker");</script>
        </head>
        <body>
          <header><nav>Home &bull; About</nav></header>
          <article>
            <h1>VYAVASTHA Engine</h1>
            <p>A personal memory and task operating system.</p>
            <p>Runs efficiently on limited disk space.</p>
          </article>
        </body>
      </html>
    `;

    const parsed = extractTextFromHtml(html);
    expect(parsed.title).toBe("System Architecture Overview");
    expect(parsed.description).toBe("Technical guide for system design");
    expect(parsed.text).toContain("VYAVASTHA Engine");
    expect(parsed.text).toContain("A personal memory and task operating system.");
    expect(parsed.text).not.toContain("console.log");
    expect(parsed.text).not.toContain("background: #000");
  });

  test("uses Firecrawl API when available and successful", async () => {
    const mockFetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("api.firecrawl.dev")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "# Scraped via Firecrawl\n\nClean markdown content.",
              metadata: {
                title: "Firecrawl Scraped Article",
                description: "Clean extracted description",
                statusCode: 200,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not expected", { status: 500 });
    }) as unknown as typeof fetch;

    const extractor = new WebExtractor(mockFetch);
    const result = await extractor.extract({
      type: "url",
      source: "web",
      payload: "https://example.com/article",
    });

    expect(result.mediaType).toBe("article");
    expect(result.title).toBe("Firecrawl Scraped Article");
    expect(result.rawText).toBe("# Scraped via Firecrawl\n\nClean markdown content.");
    expect(result.metadata.provider).toBe("firecrawl");
  });

  test("automatically falls back to native fetch parser when Firecrawl fails", async () => {
    const mockFetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("api.firecrawl.dev")) {
        // Firecrawl fails with 500 or rate limit
        return new Response(JSON.stringify({ success: false, error: "Rate limited" }), {
          status: 429,
        });
      }
      // Target URL returns standard HTML
      return new Response(
        "<html><head><title>Fallback Page</title></head><body><p>Extracted via fallback reader.</p></body></html>",
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    }) as unknown as typeof fetch;

    const extractor = new WebExtractor(mockFetch);
    const result = await extractor.extract({
      type: "url",
      source: "api",
      payload: "https://example.com/fallback-page",
    });

    expect(result.mediaType).toBe("article");
    expect(result.title).toBe("Fallback Page");
    expect(result.rawText).toBe("Extracted via fallback reader.");
    expect(result.metadata.provider).toBe("fallback_fetch");
    expect(result.warning).toContain("Extracted via fallback HTML reader");
  });
});

describe("Image Extractor & Ephemeral Safety (src/ingestion/extractors/image.ts)", () => {
  test("detects image MIME types from binary magic bytes", () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMimeType(jpegBuffer)).toBe("image/jpeg");

    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageMimeType(pngBuffer)).toBe("image/png");

    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageMimeType(gifBuffer)).toBe("image/gif");
  });

  test("extracts image from base64 data URI and cleans up ephemeral temp files", async () => {
    // 1x1 transparent PNG base64
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const dataUri = `data:image/png;base64,${pngBase64}`;

    const extractor = new ImageExtractor();
    const result = await extractor.extract({
      type: "image",
      source: "telegram",
      payload: dataUri,
      metadata: { caption: "Test 1x1 pixel image" },
    });

    expect(result.mediaType).toBe("document");
    expect(result.metadata.mimeType).toBe("image/png");
    expect(result.metadata.inlineData).toBeDefined();
    expect((result.metadata.inlineData as { mimeType: string }).mimeType).toBe("image/png");
    expect(result.rawText).toContain("Test 1x1 pixel image");

    // Ensure no orphan files remain in tmp/
    const files = await fs.readdir(TMP_DIR);
    const ephemeralImages = files.filter((f) => f.startsWith("ephemeral_img_"));
    expect(ephemeralImages.length).toBe(0);
  });

  test("enforces maximum image size boundary (rejects > 20 MB)", async () => {
    const extractor = new ImageExtractor();
    const oversizedBuffer = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1024);
    const oversizedBase64 = oversizedBuffer.toString("base64");

    expect(async () => {
      await extractor.extract({
        type: "image",
        source: "api",
        payload: `data:image/png;base64,${oversizedBase64}`,
      });
    }).toThrow("exceeds maximum allowed limit");
  });
});

describe("Ingestion Pipeline Router & Headroom Safety (src/ingestion/pipeline.ts)", () => {
  test("resolves appropriate extractors based on request type and URL patterns", () => {
    // Text
    expect(resolveExtractor({ type: "text", source: "web", payload: "Hello world" }).resolvedType).toBe("text");

    // YouTube URLs
    expect(resolveExtractor({ type: "url", source: "web", payload: "https://youtu.be/dQw4w9WgXcQ" }).resolvedType).toBe("youtube");
    expect(resolveExtractor({ type: "youtube", source: "telegram", payload: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }).resolvedType).toBe("youtube");

    // Instagram URLs
    expect(resolveExtractor({ type: "url", source: "web", payload: "https://www.instagram.com/reel/C89xyz123/" }).resolvedType).toBe("instagram");
    expect(resolveExtractor({ type: "instagram", source: "telegram", payload: "https://www.instagram.com/p/DB12345Abc/" }).resolvedType).toBe("instagram");

    // Direct Image URL
    expect(resolveExtractor({ type: "url", source: "web", payload: "https://example.com/assets/banner.png" }).resolvedType).toBe("image");

    // Web Article
    expect(resolveExtractor({ type: "url", source: "web", payload: "https://news.ycombinator.com" }).resolvedType).toBe("web");
  });

  test("ingest executes pipeline and integrates with optional AI understanding service", async () => {
    const mockUnderstanding: UnderstandingService = {
      understand: async (extraction) => ({
        summary: `Understood: ${extraction.title}`,
        category: "engineering",
        detectedEntities: ["Vyavastha"],
      }),
    };

    const result = await ingest(
      {
        type: "text",
        source: "web",
        payload: "Refactoring the ingestion pipeline for zero disk overhead.",
      },
      { understandingService: mockUnderstanding }
    );

    expect(result.extraction.mediaType).toBe("note");
    expect(result.understanding).toBeDefined();
    expect((result.understanding as { category: string }).category).toBe("engineering");
  });

  test("disk headroom safety check stops operation when available space is below requirement", async () => {
    // Request an impossible disk headroom requirement (10,000,000 MB = 10 TB)
    expect(async () => {
      await ingest(
        {
          type: "text",
          source: "web",
          payload: "Should halt due to disk safety",
        },
        { requiredDiskHeadroomMb: 10_000_000 }
      );
    }).toThrow("VYAVASTHA DISK PROTECTION");
  });
});
