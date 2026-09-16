import { getEnv } from "../lib/env";
import { redactString } from "../lib/logger";
import { AI_MODELS, type AiModelName } from "./config";
import type { z } from "zod";

// Google Gemini API key regex pattern (e.g. AIzaSy...)
const GEMINI_KEY_REGEX = /\bAIzaSy[A-Za-z0-9_-]{20,45}\b/g;

export class GeminiApiError extends Error {
  public statusCode?: number;
  public statusText?: string;

  constructor(message: string, statusCode?: number, statusText?: string, sensitiveKey?: string) {
    let sanitized = redactString(message);
    if (sensitiveKey && sensitiveKey.length >= 6 && sanitized.includes(sensitiveKey)) {
      sanitized = sanitized.split(sensitiveKey).join("[REDACTED_GEMINI_KEY]");
    }
    sanitized = sanitized.replace(GEMINI_KEY_REGEX, "[REDACTED_GEMINI_KEY]");

    super(sanitized);
    this.name = "GeminiApiError";
    this.statusCode = statusCode;
    this.statusText = statusText ? redactString(statusText) : undefined;
  }
}

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiContent {
  role?: "user" | "model" | "assistant";
  parts: GeminiPart[];
}

export interface GenerateContentOptions {
  model?: AiModelName;
  contents: GeminiContent[];
  systemInstruction?: string | { parts: GeminiPart[] };
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: "application/json" | "text/plain";
  responseSchema?: unknown;
}

export interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
    role?: string;
  };
  finishReason?: string;
  safetyRatings?: Array<Record<string, unknown>>;
}

export interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export interface GenerateJsonOptions<T> {
  model?: AiModelName;
  contents: GeminiContent[];
  systemInstruction?: string | { parts: GeminiPart[] };
  temperature?: number;
  maxOutputTokens?: number;
  schema?: z.ZodType<T, any, any>;
}

export interface GeminiClientOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: AiModelName;
  fetchFn?: typeof fetch;
}

/**
 * Strips markdown code fences (e.g. ```json ... ```) from Gemini JSON responses.
 */
export function cleanJsonText(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```json")) {
    text = text.slice(7);
  } else if (text.startsWith("```")) {
    text = text.slice(3);
  }
  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }
  return text.trim();
}

/**
 * Lightweight Gemini REST API client using standard native fetch.
 * Communicates with Google Generative AI REST API.
 * Never leaks API keys or secrets in logs or errors.
 */
export class GeminiClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: AiModelName;
  private fetchFn: typeof fetch;

  constructor(options: GeminiClientOptions = {}) {
    this.apiKey = options.apiKey || this.resolveApiKey();
    this.baseUrl = (options.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    this.defaultModel = options.defaultModel || AI_MODELS.default;
    this.fetchFn = options.fetchFn || fetch.bind(globalThis);
  }

  private resolveApiKey(): string {
    try {
      const env = getEnv();
      return env.GEMINI_API_KEY;
    } catch {
      // Fallback for tests or environments where full getEnv() might not be initialized
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new GeminiApiError("GEMINI_API_KEY is missing from environment");
      }
      return key;
    }
  }

  private createError(message: string, statusCode?: number, statusText?: string): GeminiApiError {
    return new GeminiApiError(message, statusCode, statusText, this.apiKey);
  }

  /**
   * Generates content from Google Generative AI REST API.
   */
  async generateContent(options: GenerateContentOptions): Promise<GeminiGenerateResponse> {
    const model = options.model || this.defaultModel;
    const url = `${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;

    const generationConfig: Record<string, unknown> = {};
    if (options.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    }
    if (options.maxOutputTokens !== undefined) {
      generationConfig.maxOutputTokens = options.maxOutputTokens;
    }
    if (options.responseMimeType) {
      generationConfig.responseMimeType = options.responseMimeType;
      generationConfig.response_mime_type = options.responseMimeType;
    }
    if (options.responseSchema) {
      generationConfig.responseSchema = options.responseSchema;
    }

    const bodyPayload: Record<string, unknown> = {
      contents: options.contents,
    };

    if (Object.keys(generationConfig).length > 0) {
      bodyPayload.generationConfig = generationConfig;
    }

    if (options.systemInstruction) {
      if (typeof options.systemInstruction === "string") {
        bodyPayload.systemInstruction = {
          parts: [{ text: options.systemInstruction }],
        };
      } else {
        bodyPayload.systemInstruction = options.systemInstruction;
      }
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(bodyPayload),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw this.createError(`Gemini network request failed: ${msg}`);
    }

    let responseData: GeminiGenerateResponse;
    try {
      responseData = (await response.json()) as GeminiGenerateResponse;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw this.createError(
        `Failed to parse Gemini response as JSON (HTTP ${response.status}): ${msg}`,
        response.status,
        response.statusText
      );
    }

    if (!response.ok) {
      const errorMsg =
        responseData?.error?.message ||
        `Gemini API returned HTTP ${response.status} (${response.statusText || "Unknown Error"})`;
      throw this.createError(errorMsg, response.status, response.statusText);
    }

    return responseData;
  }

  /**
   * Generates structured JSON from Gemini and optionally validates with a Zod schema.
   */
  async generateJson<T>(options: GenerateJsonOptions<T>): Promise<T> {
    const response = await this.generateContent({
      model: options.model,
      contents: options.contents,
      systemInstruction: options.systemInstruction,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      responseMimeType: "application/json",
    });

    const candidate = response.candidates?.[0];
    const textPart = candidate?.content?.parts?.find((p) => p.text !== undefined)?.text;

    if (!textPart) {
      throw this.createError("Gemini returned empty candidate content or no text part");
    }

    const cleaned = cleanJsonText(textPart);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw this.createError(
        `Failed to parse Gemini output as JSON: ${msg}. Output preview: ${cleaned.slice(0, 100)}`
      );
    }

    if (options.schema) {
      const result = options.schema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw this.createError(`Gemini response failed schema validation: ${issues}`);
      }
      return result.data;
    }

    return parsed as T;
  }
}

export const geminiClient = new GeminiClient();
