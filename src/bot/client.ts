/**
 * VYAVASTHA — Telegram Bot API Client
 *
 * Lightweight, typed client for interacting with the official Telegram Bot API.
 * Uses native fetch with strict token redaction across all logs and exception messages.
 */

import { getEnv } from "../lib/env";
import { logger, redactString } from "../lib/logger";
import type {
  ChatAction,
  GetUpdatesOptions,
  SendMessageOptions,
  SetWebhookOptions,
  TelegramApiResponse,
  TelegramFile,
  TelegramMessage,
  TelegramUpdate,
  TelegramWebhookInfo,
} from "./types";

export type TelegramFetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface TelegramClientConfig {
  token?: string;
  baseUrl?: string;
  fetchFn?: TelegramFetchFn;
}

export class TelegramApiError extends Error {
  readonly method: string;
  readonly statusCode: number;
  readonly description: string;

  constructor(method: string, statusCode: number, description: string) {
    const sanitizedDesc = redactString(description);
    super(`[Telegram API] Call to '${method}' failed (HTTP ${statusCode}): ${sanitizedDesc}`);
    this.name = "TelegramApiError";
    this.method = method;
    this.statusCode = statusCode;
    this.description = sanitizedDesc;
  }
}

export class TelegramClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: TelegramFetchFn;

  constructor(config?: TelegramClientConfig) {
    this.token = config?.token ?? getEnv().TELEGRAM_BOT_TOKEN;
    this.baseUrl = (config?.baseUrl ?? "https://api.telegram.org").replace(/\/+$/, "");
    this.fetchFn = config?.fetchFn ?? fetch;
  }

  /**
   * Sanitizes any URL or string containing the Telegram bot token.
   */
  private sanitizeUrl(url: string): string {
    if (!this.token) return url;
    return url.replaceAll(this.token, "[REDACTED_TELEGRAM_TOKEN]");
  }

  /**
   * Internal generic request dispatcher for Telegram Bot API methods.
   */
  private async apiCall<T>(method: string, payload?: Record<string, unknown>): Promise<T> {
    const endpoint = `${this.baseUrl}/bot${this.token}/${method}`;
    const sanitizedEndpoint = this.sanitizeUrl(endpoint);

    try {
      const response = await this.fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      let data: TelegramApiResponse<T>;
      try {
        data = (await response.json()) as TelegramApiResponse<T>;
      } catch (parseErr) {
        throw new TelegramApiError(
          method,
          response.status,
          `Failed to parse JSON response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
        );
      }

      if (!response.ok || !data.ok) {
        const errorDesc = data.description || `HTTP ${response.status} ${response.statusText}`;
        logger.error(`[TelegramClient] ${method} returned error`, undefined, {
          method,
          status: response.status,
          description: errorDesc,
          endpoint: sanitizedEndpoint,
        });
        throw new TelegramApiError(method, response.status, errorDesc);
      }

      return data.result;
    } catch (err) {
      if (err instanceof TelegramApiError) {
        throw err;
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      const safeMsg = redactString(this.sanitizeUrl(rawMsg));
      logger.error(`[TelegramClient] Network error during ${method}`, undefined, {
        method,
        error: safeMsg,
      });
      throw new TelegramApiError(method, 0, safeMsg);
    }
  }

  /**
   * Sends a text message to a specific Telegram chat.
   */
  async sendMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage> {
    return this.apiCall<TelegramMessage>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode,
      disable_web_page_preview: options?.disable_web_page_preview,
      disable_notification: options?.disable_notification,
      reply_to_message_id: options?.reply_to_message_id,
    });
  }

  /**
   * Broadcasts a chat action (e.g. typing, upload_document) to inform the user of activity.
   */
  async sendChatAction(chatId: number | string, action: ChatAction): Promise<boolean> {
    return this.apiCall<boolean>("sendChatAction", {
      chat_id: chatId,
      action,
    });
  }

  /**
   * Retrieves basic file information and prepares it for download.
   */
  async getFile(fileId: string): Promise<TelegramFile> {
    return this.apiCall<TelegramFile>("getFile", {
      file_id: fileId,
    });
  }

  /**
   * Generates the direct download URL for a file path retrieved via getFile.
   * Note: The returned URL contains the token; use carefully and do not log.
   */
  getFileUrl(filePath: string): string {
    const cleanPath = filePath.replace(/^\/+/, "");
    return `${this.baseUrl}/file/bot${this.token}/${cleanPath}`;
  }

  /**
   * Downloads a file given its Telegram file_path as a binary ArrayBuffer.
   */
  async downloadFile(filePath: string): Promise<ArrayBuffer> {
    const url = this.getFileUrl(filePath);
    try {
      const res = await this.fetchFn(url);
      if (!res.ok) {
        throw new Error(`Failed to download file from Telegram: HTTP ${res.status}`);
      }
      return await res.arrayBuffer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[TelegramClient] Download failed: ${redactString(this.sanitizeUrl(msg))}`);
    }
  }

  /**
   * Configures the webhook URL for receiving updates from Telegram.
   */
  async setWebhook(url: string, options?: SetWebhookOptions): Promise<boolean> {
    return this.apiCall<boolean>("setWebhook", {
      url,
      secret_token: options?.secret_token,
      max_connections: options?.max_connections,
      allowed_updates: options?.allowed_updates,
      drop_pending_updates: options?.drop_pending_updates,
    });
  }

  /**
   * Retrieves current webhook status and diagnostics.
   */
  async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return this.apiCall<TelegramWebhookInfo>("getWebhookInfo");
  }

  /**
   * Removes webhook integration, allowing the bot to switch to getUpdates polling.
   */
  async deleteWebhook(options?: { drop_pending_updates?: boolean }): Promise<boolean> {
    return this.apiCall<boolean>("deleteWebhook", {
      drop_pending_updates: options?.drop_pending_updates,
    });
  }

  /**
   * Long-polls for incoming updates using the getUpdates API method.
   */
  async getUpdates(options?: GetUpdatesOptions): Promise<TelegramUpdate[]> {
    return this.apiCall<TelegramUpdate[]>("getUpdates", {
      offset: options?.offset,
      limit: options?.limit,
      timeout: options?.timeout,
      allowed_updates: options?.allowed_updates,
    });
  }
}
