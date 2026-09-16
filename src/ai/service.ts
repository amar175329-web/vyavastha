import { GeminiClient, geminiClient as defaultGeminiClient } from "./client";
import {
  CONTENT_UNDERSTANDING_CONFIG,
  CHAT_SYNTHESIS_CONFIG,
  WEEKLY_REVIEW_CONFIG,
} from "./config";
import { buildContentUnderstandingPrompt } from "./prompts/content-understanding";
import { buildChatSynthesisPrompt } from "./prompts/chat-synthesis";
import { buildWeeklyReviewPrompt } from "./prompts/weekly-review";
import {
  ContentUnderstandingResultSchema,
  ChatSynthesisResponseSchema,
  WeeklyReviewResultSchema,
  type ContentUnderstandingInput,
  type ContentUnderstandingResult,
  type ChatSynthesisInput,
  type ChatSynthesisResponse,
  type WeeklyReviewInput,
  type WeeklyReviewResult,
  type SourceType,
} from "./types";

export class AiService {
  private client: GeminiClient;

  constructor(client?: GeminiClient) {
    this.client = client || defaultGeminiClient;
  }

  /**
   * Ingests and deeply understands multimodal or textual content.
   *
   * CRITICAL MEMORY RULE:
   * Saved content must NOT automatically become permanent personal memory!
   * Candidate personal memories proposed by AI must be marked `confirmedByUser: false`
   * with a confidence score and provenance reference, requiring explicit user confirmation.
   */
  async understandContent(input: ContentUnderstandingInput): Promise<ContentUnderstandingResult> {
    if (!input.text || input.text.trim().length === 0) {
      throw new Error("Cannot analyze empty content text");
    }

    const { systemInstruction, userPrompt } = buildContentUnderstandingPrompt(input);

    const rawResult = await this.client.generateJson<ContentUnderstandingResult>({
      model: CONTENT_UNDERSTANDING_CONFIG.model,
      temperature: CONTENT_UNDERSTANDING_CONFIG.temperature,
      maxOutputTokens: CONTENT_UNDERSTANDING_CONFIG.maxOutputTokens ?? CONTENT_UNDERSTANDING_CONFIG.maxTokens,
      systemInstruction,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      schema: ContentUnderstandingResultSchema,
    });

    // Enforce provenance & CRITICAL MEMORY RULE
    const provenanceReference = input.url || (input.metadata?.id as string) || "ingested_content";

    const candidatePersonalMemories = (rawResult.candidatePersonalMemories || []).map((candidate) => ({
      ...candidate,
      // Rule 1: Must never automatically become permanent personal memory
      confirmedByUser: false as const,
      // Rule 2: Calibrated confidence score between 0.0 and 1.0
      confidenceScore: Math.max(0, Math.min(1, Number(candidate.confidenceScore) || 0.5)),
      // Rule 3: Provenance reference attached
      provenanceSourceId: candidate.provenanceSourceId || (input.metadata?.id as string) || undefined,
      provenance: candidate.provenance || provenanceReference,
    }));

    // Ensure sourceUrl is preserved if provided in input
    const sourceUrl = input.url || rawResult.sourceUrl;

    // Validate or align sourceType if caller passed a valid one
    let sourceType = rawResult.sourceType;
    if (input.mediaType) {
      const validTypes: SourceType[] = ["youtube", "instagram", "article", "audio", "document", "note"];
      if (validTypes.includes(input.mediaType as SourceType)) {
        sourceType = input.mediaType as SourceType;
      }
    }

    return {
      ...rawResult,
      sourceUrl,
      sourceType,
      candidatePersonalMemories,
    };
  }

  /**
   * Synthesizes an executive chat response grounded across Layers A, B, and C with citations.
   */
  async synthesizeChatResponse(input: ChatSynthesisInput): Promise<ChatSynthesisResponse> {
    if (!input.query || input.query.trim().length === 0) {
      throw new Error("Chat query cannot be empty");
    }

    const { systemInstruction, userPrompt } = buildChatSynthesisPrompt(input);

    const result = await this.client.generateJson<ChatSynthesisResponse>({
      model: CHAT_SYNTHESIS_CONFIG.model,
      temperature: CHAT_SYNTHESIS_CONFIG.temperature,
      maxOutputTokens: CHAT_SYNTHESIS_CONFIG.maxOutputTokens ?? CHAT_SYNTHESIS_CONFIG.maxTokens,
      systemInstruction,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      schema: ChatSynthesisResponseSchema,
    });

    return result;
  }

  /**
   * Conducts longitudinal weekly review and reflective synthesis.
   */
  async generateReflectiveReview(input: WeeklyReviewInput): Promise<WeeklyReviewResult> {
    const { systemInstruction, userPrompt } = buildWeeklyReviewPrompt(input);

    const result = await this.client.generateJson<WeeklyReviewResult>({
      model: WEEKLY_REVIEW_CONFIG.model,
      temperature: WEEKLY_REVIEW_CONFIG.temperature,
      maxOutputTokens: WEEKLY_REVIEW_CONFIG.maxOutputTokens ?? WEEKLY_REVIEW_CONFIG.maxTokens,
      systemInstruction,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      schema: WeeklyReviewResultSchema,
    });

    return result;
  }
}

export const aiService = new AiService();
