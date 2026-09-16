/**
 * VYAVASTHA — Telegram Bot Types & Contracts
 *
 * Provides strongly typed definitions for the Telegram Bot API and the internal
 * routing, authentication, and ingestion boundaries of Vyavastha OS.
 */

import type { IngestionRequest, IngestionType } from "../ingestion/types";

// --- Telegram Bot API Entities ---

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface MessageEntity {
  type:
    | "mention"
    | "hashtag"
    | "cashtag"
    | "bot_command"
    | "url"
    | "email"
    | "phone_number"
    | "bold"
    | "italic"
    | "underline"
    | "strikethrough"
    | "spoiler"
    | "code"
    | "pre"
    | "text_link"
    | "text_mention"
    | "custom_emoji";
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
  language?: string;
  custom_emoji_id?: string;
}

export interface PhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface Voice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface Audio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface Document {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  entities?: MessageEntity[];
  caption_entities?: MessageEntity[];
  photo?: PhotoSize[];
  voice?: Voice;
  audio?: Audio;
  document?: Document;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
}

export interface SendMessageOptions {
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
}

export type ChatAction =
  | "typing"
  | "upload_photo"
  | "record_video"
  | "upload_video"
  | "record_voice"
  | "upload_voice"
  | "upload_document"
  | "choose_sticker"
  | "find_location"
  | "record_video_note"
  | "upload_video_note";

export interface SetWebhookOptions {
  secret_token?: string;
  max_connections?: number;
  allowed_updates?: string[];
  drop_pending_updates?: boolean;
}

export interface GetUpdatesOptions {
  offset?: number;
  limit?: number;
  timeout?: number;
  allowed_updates?: string[];
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
  error_code?: number;
}

// --- Vyavastha Ingestion & Router Contracts ---

export interface IngestionProcessResult {
  id?: string;
  title: string;
  summary: string;
  mediaType: string;
  sourceUrl?: string;
  tags?: string[];
  tasks?: Array<{ title: string; description?: string }>;
  memories?: Array<{ key: string; value: string; category?: string }>;
  warning?: string;
}

export type IngestionProcessor = (
  request: IngestionRequest
) => Promise<IngestionProcessResult>;

export interface RouterResult {
  action: "command" | "ingestion" | "rejected" | "ignored" | "error";
  status: "success" | "error" | "rejected" | "ignored";
  command?: string;
  ingestionType?: IngestionType;
  responseSent: boolean;
  responseText?: string;
  error?: string;
}
