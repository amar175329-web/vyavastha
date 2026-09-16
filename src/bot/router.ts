/**
 * VYAVASTHA — Telegram Update Router
 *
 * Directs incoming Telegram interactions through owner validation, input normalization,
 * command routing, and shared ingestion pipeline dispatch.
 * Formats all responses in clean, human-authored Markdown.
 */

import { pingDatabase } from "../db/client";
import {
  getRepository,
  UnimplementedVyavasthaRepository,
  type IVyavasthaRepository,
  type TaskItem,
  type PersonalMemoryItem,
  type WeeklyReviewSummary,
} from "../db/repository";
import { checkDiskHeadroom, MIN_DISK_HEADROOM_MB } from "../lib/disk";
import { logger } from "../lib/logger";
import { validateTelegramSender, UNAUTHORIZED_REJECTION_MESSAGE, type OwnerAuthConfig } from "./auth";
import { TelegramClient } from "./client";
import {
  formatKnowledgeSaved,
  formatMemoriesMessage,
  formatStartMessage,
  formatStatusMessage,
  formatTasksMessage,
  formatWeeklyReviewMessage,
} from "./formatter";
import type {
  IngestionProcessResult,
  IngestionProcessor,
  RouterResult,
  TelegramMessage,
  TelegramUpdate,
} from "./types";
import type { IngestionRequest, IngestionType } from "../ingestion/types";
import { processUnifiedIngestion } from "../ingestion/unified";

export interface TelegramRouterOptions {
  client?: TelegramClient;
  repository?: IVyavasthaRepository;
  ingestionProcessor?: IngestionProcessor;
  authConfig?: OwnerAuthConfig;
  rejectSilently?: boolean;
}

const URL_REGEX = /https?:\/\/[^\s]+/i;

/**
 * Extracts a URL from a Telegram message if present.
 */
export function extractUrlFromMessage(message: TelegramMessage): string | null {
  // 1. Check message entities
  if (message.entities) {
    for (const entity of message.entities) {
      if (entity.type === "url" && message.text) {
        return message.text.slice(entity.offset, entity.offset + entity.length);
      }
      if (entity.type === "text_link" && entity.url) {
        return entity.url;
      }
    }
  }

  // 2. Check caption entities
  if (message.caption_entities) {
    for (const entity of message.caption_entities) {
      if (entity.type === "url" && message.caption) {
        return message.caption.slice(entity.offset, entity.offset + entity.length);
      }
      if (entity.type === "text_link" && entity.url) {
        return entity.url;
      }
    }
  }

  // 3. Fallback to regex check in text or caption
  const raw = message.text || message.caption;
  if (raw) {
    const match = raw.match(URL_REGEX);
    if (match) return match[0];
  }

  return null;
}

/**
 * Detects URL subtype (youtube, instagram, or generic article).
 */
export function detectUrlSubtype(url: string): "youtube" | "instagram" | "article" {
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    return "youtube";
  }
  if (lower.includes("instagram.com")) {
    return "instagram";
  }
  return "article";
}

/**
 * Default thin ingestion processor when no external AI/extractor service is injected.
 * Normalizes input and formats structured result.
 */
export async function defaultIngestionProcessor(
  request: IngestionRequest
): Promise<IngestionProcessResult> {
  const mediaType = request.type === "url"
    ? detectUrlSubtype(request.payload)
    : request.type === "image"
    ? "document"
    : request.type === "document"
    ? (request.metadata?.mediaSubtype === "voice" || request.metadata?.mediaSubtype === "audio"
        ? "audio"
        : "document")
    : "note";

  let title = "Ingested Note";
  let summary = request.payload;

  if (request.type === "url") {
    try {
      const parsed = new URL(request.payload);
      title = `${parsed.hostname.replace(/^www\./, "")} Content`;
      summary = `Queued URL for extraction: ${request.payload}`;
    } catch {
      title = "External URL";
    }
  } else if (request.type === "image") {
    title = (request.metadata?.caption as string) || "Photo Ingestion";
    summary = "Photo uploaded and queued for multimodal perception.";
  } else if (request.type === "document") {
    const filename = request.metadata?.fileName as string;
    const subtype = request.metadata?.mediaSubtype as string;
    if (subtype === "voice" || subtype === "audio") {
      title = (request.metadata?.title as string) || "Voice Memo";
      summary = "Audio recording captured. Queued for speech transcription.";
    } else {
      title = filename || "Document";
      summary = `File [${filename || "document"}] uploaded and queued for parsing.`;
    }
  } else if (request.type === "text") {
    const lines = request.payload.split("\n").filter((l) => l.trim().length > 0);
    title = lines[0] ? lines[0].slice(0, 60) : "Quick Note";
    summary = request.payload;
  }

  return {
    id: `ingest_${Date.now()}`,
    title,
    summary,
    mediaType,
    sourceUrl: request.type === "url" ? request.payload : undefined,
    tags: [mediaType, "telegram"],
  };
}

export class TelegramRouter {
  private readonly client: TelegramClient;
  private readonly repository: IVyavasthaRepository;
  private readonly ingestionProcessor: IngestionProcessor;
  private readonly authConfig?: OwnerAuthConfig;
  private readonly rejectSilently: boolean;

  constructor(options?: TelegramRouterOptions) {
    this.client = options?.client ?? new TelegramClient();
    this.repository = options?.repository ?? getRepository();
    this.ingestionProcessor = options?.ingestionProcessor ?? ((req) => processUnifiedIngestion(req, this.repository));
    this.authConfig = options?.authConfig;
    this.rejectSilently = options?.rejectSilently ?? false;
  }

  /**
   * Safely sends a response, falling back to plain text if Markdown parsing fails.
   */
  private async safeSendMessage(chatId: number | string, text: string): Promise<boolean> {
    try {
      await this.client.sendMessage(chatId, text, { parse_mode: "Markdown" });
      return true;
    } catch (err) {
      logger.warn("[ROUTER] Markdown send failed, retrying without parse_mode", {
        chatId: String(chatId),
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        await this.client.sendMessage(chatId, text);
        return true;
      } catch (retryErr) {
        logger.error("[ROUTER] Failed to send fallback message", retryErr, {
          chatId: String(chatId),
        });
        return false;
      }
    }
  }

  /**
   * Main entry point for processing an incoming Telegram Update.
   */
  async handleUpdate(update: TelegramUpdate): Promise<RouterResult> {
    const message = update.message || update.edited_message;

    if (!message) {
      return {
        action: "ignored",
        status: "ignored",
        responseSent: false,
      };
    }

    const fromId = message.from?.id;
    const chatId = message.chat.id;

    // 1. Mandatory Owner Authentication
    const isOwner = validateTelegramSender(fromId, chatId, this.authConfig);
    if (!isOwner) {
      if (!this.rejectSilently) {
        await this.safeSendMessage(chatId, UNAUTHORIZED_REJECTION_MESSAGE);
      }
      return {
        action: "rejected",
        status: "rejected",
        responseSent: !this.rejectSilently,
        responseText: UNAUTHORIZED_REJECTION_MESSAGE,
      };
    }

    // 2. Command Handling
    const text = message.text?.trim();
    if (text && text.startsWith("/")) {
      const command = text.split(" ")[0].split("@")[0].toLowerCase();
      return this.handleCommand(command, chatId);
    }

    // 3. URL Ingestion Routing
    const extractedUrl = extractUrlFromMessage(message);
    if (extractedUrl) {
      return this.handleUrlIngestion(extractedUrl, message);
    }

    // 4. Media Ingestion Routing (Photos, Voice, Audio, Documents)
    if (message.photo && message.photo.length > 0) {
      return this.handlePhotoIngestion(message);
    }
    if (message.voice) {
      return this.handleVoiceIngestion(message);
    }
    if (message.audio) {
      return this.handleAudioIngestion(message);
    }
    if (message.document) {
      return this.handleDocumentIngestion(message);
    }

    // 5. Plain Text Notes Routing
    if (text) {
      return this.handleTextIngestion(text, message);
    }

    return {
      action: "ignored",
      status: "ignored",
      responseSent: false,
    };
  }

  /**
   * Dispatches bot commands.
   */
  private async handleCommand(command: string, chatId: number): Promise<RouterResult> {
    await this.client.sendChatAction(chatId, "typing").catch(() => {});

    switch (command) {
      case "/start": {
        const reply = formatStartMessage();
        const sent = await this.safeSendMessage(chatId, reply);
        return {
          action: "command",
          status: "success",
          command: "/start",
          responseSent: sent,
          responseText: reply,
        };
      }

      case "/status": {
        const [dbPing, diskCheck] = await Promise.all([
          pingDatabase(),
          checkDiskHeadroom(),
        ]);

        let knowledgeCount: number | undefined;
        let tasksCount: number | undefined;
        let memoriesCount: number | undefined;

        try {
          const [k, t, m] = await Promise.all([
            this.repository.listKnowledge({ limit: 1 }),
            this.repository.listTasks({ status: "pending" }),
            this.repository.listMemories(),
          ]);
          knowledgeCount = k.length;
          tasksCount = t.length;
          memoriesCount = m.length;
        } catch {
          // Repository may throw NotImplementedError in Phase 6
        }

        const reply = formatStatusMessage({
          dbConnected: dbPing.ok,
          dbLatencyMs: dbPing.latencyMs,
          dbName: dbPing.database,
          diskHealthy: diskCheck.ok,
          availableMb: diskCheck.availableMb,
          requiredMb: diskCheck.requiredMb,
          knowledgeCount,
          tasksCount,
          memoriesCount,
        });

        const sent = await this.safeSendMessage(chatId, reply);
        return {
          action: "command",
          status: "success",
          command: "/status",
          responseSent: sent,
          responseText: reply,
        };
      }

      case "/tasks": {
        let tasks: TaskItem[] = [];
        try {
          tasks = await this.repository.listTasks({ status: "pending" });
        } catch {
          // Fallback if repository layer not yet persisted
        }

        const reply = formatTasksMessage(tasks);
        const sent = await this.safeSendMessage(chatId, reply);
        return {
          action: "command",
          status: "success",
          command: "/tasks",
          responseSent: sent,
          responseText: reply,
        };
      }

      case "/memory": {
        let memories: PersonalMemoryItem[] = [];
        try {
          memories = await this.repository.listMemories();
        } catch {
          // Fallback if repository layer not yet persisted
        }

        const reply = formatMemoriesMessage(memories);
        const sent = await this.safeSendMessage(chatId, reply);
        return {
          action: "command",
          status: "success",
          command: "/memory",
          responseSent: sent,
          responseText: reply,
        };
      }

      case "/review": {
        let summary: WeeklyReviewSummary;
        try {
          summary = await this.repository.generateWeeklyReview();
        } catch {
          const now = new Date();
          const start = new Date(now);
          start.setDate(now.getDate() - 7);
          summary = {
            periodStart: start,
            periodEnd: now,
            itemsIngested: 0,
            tasksCreated: 0,
            tasksCompleted: 0,
            memoriesFormed: 0,
          };
        }

        const reply = formatWeeklyReviewMessage(summary);
        const sent = await this.safeSendMessage(chatId, reply);
        return {
          action: "command",
          status: "success",
          command: "/review",
          responseSent: sent,
          responseText: reply,
        };
      }

      default: {
        const reply = `Unknown command \`${command}\`. Use /status, /tasks, /memory, or /review.`;
        const sent = await this.safeSendMessage(chatId, reply);
        return {
          action: "command",
          status: "error",
          command,
          responseSent: sent,
          responseText: reply,
        };
      }
    }
  }

  /**
   * Routes URLs to the shared ingestion pipeline.
   */
  private async handleUrlIngestion(url: string, message: TelegramMessage): Promise<RouterResult> {
    await this.client.sendChatAction(message.chat.id, "typing").catch(() => {});

    const request: IngestionRequest = {
      type: "url",
      payload: url,
      source: "telegram",
      metadata: {
        rawText: message.text,
        caption: message.caption,
        messageId: message.message_id,
        chatId: message.chat.id,
      },
    };

    const processResult = await this.ingestionProcessor(request);
    const reply = formatKnowledgeSaved(processResult);
    const sent = await this.safeSendMessage(message.chat.id, reply);

    return {
      action: "ingestion",
      status: "success",
      ingestionType: "url",
      responseSent: sent,
      responseText: reply,
    };
  }

  /**
   * Routes plain text notes to the shared ingestion pipeline.
   */
  private async handleTextIngestion(text: string, message: TelegramMessage): Promise<RouterResult> {
    await this.client.sendChatAction(message.chat.id, "typing").catch(() => {});

    const request: IngestionRequest = {
      type: "text",
      payload: text,
      source: "telegram",
      metadata: {
        messageId: message.message_id,
        chatId: message.chat.id,
      },
    };

    const processResult = await this.ingestionProcessor(request);
    const reply = formatKnowledgeSaved(processResult);
    const sent = await this.safeSendMessage(message.chat.id, reply);

    return {
      action: "ingestion",
      status: "success",
      ingestionType: "text",
      responseSent: sent,
      responseText: reply,
    };
  }

  /**
   * Asserts disk headroom before handling ephemeral media uploads.
   */
  private async checkHeadroomBeforeMedia(chatId: number): Promise<boolean> {
    const check = await checkDiskHeadroom(MIN_DISK_HEADROOM_MB);
    if (!check.ok) {
      const alert = `⚠️ **Disk Headroom Alert**\n\nStorage space is currently low (${check.availableMb} MB available / min ${check.requiredMb} MB).\nEphemeral media ingestion is temporarily paused to protect system health.`;
      await this.safeSendMessage(chatId, alert);
      return false;
    }
    return true;
  }

  /**
   * Routes photos to the shared ingestion pipeline.
   */
  private async handlePhotoIngestion(message: TelegramMessage): Promise<RouterResult> {
    const chatId = message.chat.id;
    if (!(await this.checkHeadroomBeforeMedia(chatId))) {
      return {
        action: "ingestion",
        status: "error",
        ingestionType: "image",
        responseSent: true,
        error: "Insufficient disk headroom",
      };
    }

    await this.client.sendChatAction(chatId, "upload_photo").catch(() => {});

    const photos = message.photo!;
    const bestPhoto = photos[photos.length - 1];

    let filePath: string | undefined;
    try {
      const fileInfo = await this.client.getFile(bestPhoto.file_id);
      filePath = fileInfo.file_path;
    } catch (err) {
      logger.warn("[ROUTER] Could not retrieve file path from Telegram", {
        fileId: bestPhoto.file_id,
        error: String(err),
      });
    }

    const request: IngestionRequest = {
      type: "image",
      payload: bestPhoto.file_id,
      source: "telegram",
      metadata: {
        fileId: bestPhoto.file_id,
        filePath,
        fileSize: bestPhoto.file_size,
        width: bestPhoto.width,
        height: bestPhoto.height,
        caption: message.caption,
        messageId: message.message_id,
      },
    };

    const processResult = await this.ingestionProcessor(request);
    const reply = formatKnowledgeSaved(processResult);
    const sent = await this.safeSendMessage(chatId, reply);

    return {
      action: "ingestion",
      status: "success",
      ingestionType: "image",
      responseSent: sent,
      responseText: reply,
    };
  }

  /**
   * Routes voice notes to the shared ingestion pipeline.
   */
  private async handleVoiceIngestion(message: TelegramMessage): Promise<RouterResult> {
    const chatId = message.chat.id;
    if (!(await this.checkHeadroomBeforeMedia(chatId))) {
      return {
        action: "ingestion",
        status: "error",
        ingestionType: "document",
        responseSent: true,
        error: "Insufficient disk headroom",
      };
    }

    await this.client.sendChatAction(chatId, "record_voice").catch(() => {});

    const voice = message.voice!;
    let filePath: string | undefined;
    try {
      const fileInfo = await this.client.getFile(voice.file_id);
      filePath = fileInfo.file_path;
    } catch (err) {
      logger.warn("[ROUTER] Could not retrieve voice file path", { fileId: voice.file_id });
    }

    const request: IngestionRequest = {
      type: "document",
      payload: voice.file_id,
      source: "telegram",
      metadata: {
        mediaSubtype: "voice",
        fileId: voice.file_id,
        filePath,
        duration: voice.duration,
        mimeType: voice.mime_type,
        fileSize: voice.file_size,
        caption: message.caption,
      },
    };

    const processResult = await this.ingestionProcessor(request);
    const reply = formatKnowledgeSaved(processResult);
    const sent = await this.safeSendMessage(chatId, reply);

    return {
      action: "ingestion",
      status: "success",
      ingestionType: "document",
      responseSent: sent,
      responseText: reply,
    };
  }

  /**
   * Routes audio files to the shared ingestion pipeline.
   */
  private async handleAudioIngestion(message: TelegramMessage): Promise<RouterResult> {
    const chatId = message.chat.id;
    if (!(await this.checkHeadroomBeforeMedia(chatId))) {
      return {
        action: "ingestion",
        status: "error",
        ingestionType: "document",
        responseSent: true,
        error: "Insufficient disk headroom",
      };
    }

    await this.client.sendChatAction(chatId, "upload_document").catch(() => {});

    const audio = message.audio!;
    let filePath: string | undefined;
    try {
      const fileInfo = await this.client.getFile(audio.file_id);
      filePath = fileInfo.file_path;
    } catch (err) {
      logger.warn("[ROUTER] Could not retrieve audio file path", { fileId: audio.file_id });
    }

    const request: IngestionRequest = {
      type: "document",
      payload: audio.file_id,
      source: "telegram",
      metadata: {
        mediaSubtype: "audio",
        fileId: audio.file_id,
        filePath,
        title: audio.title,
        performer: audio.performer,
        duration: audio.duration,
        mimeType: audio.mime_type,
        fileSize: audio.file_size,
        caption: message.caption,
      },
    };

    const processResult = await this.ingestionProcessor(request);
    const reply = formatKnowledgeSaved(processResult);
    const sent = await this.safeSendMessage(chatId, reply);

    return {
      action: "ingestion",
      status: "success",
      ingestionType: "document",
      responseSent: sent,
      responseText: reply,
    };
  }

  /**
   * Routes general documents to the shared ingestion pipeline.
   */
  private async handleDocumentIngestion(message: TelegramMessage): Promise<RouterResult> {
    const chatId = message.chat.id;
    if (!(await this.checkHeadroomBeforeMedia(chatId))) {
      return {
        action: "ingestion",
        status: "error",
        ingestionType: "document",
        responseSent: true,
        error: "Insufficient disk headroom",
      };
    }

    await this.client.sendChatAction(chatId, "upload_document").catch(() => {});

    const doc = message.document!;
    let filePath: string | undefined;
    try {
      const fileInfo = await this.client.getFile(doc.file_id);
      filePath = fileInfo.file_path;
    } catch (err) {
      logger.warn("[ROUTER] Could not retrieve document file path", { fileId: doc.file_id });
    }

    const request: IngestionRequest = {
      type: "document",
      payload: doc.file_id,
      source: "telegram",
      metadata: {
        fileId: doc.file_id,
        filePath,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        fileSize: doc.file_size,
        caption: message.caption,
      },
    };

    const processResult = await this.ingestionProcessor(request);
    const reply = formatKnowledgeSaved(processResult);
    const sent = await this.safeSendMessage(chatId, reply);

    return {
      action: "ingestion",
      status: "success",
      ingestionType: "document",
      responseSent: sent,
      responseText: reply,
    };
  }
}

/**
 * Functional convenience wrapper for handling an update.
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  options?: TelegramRouterOptions
): Promise<RouterResult> {
  const router = new TelegramRouter(options);
  return router.handleUpdate(update);
}
