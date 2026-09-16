/**
 * VYAVASTHA — Telegram Owner Authentication
 *
 * Enforces single-user OS security boundaries for Telegram interactions.
 * Every incoming message is strictly validated against configured owner credentials:
 * ALLOWED_TELEGRAM_USER_ID and TELEGRAM_CHAT_ID.
 * Non-owners are rejected with an audit log and polite silence or rejection message.
 */

import { getEnv } from "../lib/env";
import { logger } from "../lib/logger";

export interface OwnerAuthConfig {
  allowedUserId?: string;
  allowedChatId?: string;
}

export const UNAUTHORIZED_REJECTION_MESSAGE =
  "⛔ **Access Denied**\n\nVyavastha is a single-user personal operating system. Access is strictly restricted to the authorized owner.";

/**
 * Validates whether an incoming Telegram interaction originates from the verified owner.
 *
 * @param fromId - The Telegram User ID of the sender (message.from.id)
 * @param chatId - The Telegram Chat ID where the message was sent (message.chat.id)
 * @param overrideConfig - Optional override for unit testing
 * @returns true if both sender ID and chat ID match the authorized owner; false otherwise.
 */
export function validateTelegramSender(
  fromId: number | string | undefined | null,
  chatId: number | string | undefined | null,
  overrideConfig?: OwnerAuthConfig
): boolean {
  if (fromId === undefined || fromId === null || chatId === undefined || chatId === null) {
    logger.warn("[AUTH] Rejected Telegram update with missing sender or chat id", {
      fromId: fromId ?? null,
      chatId: chatId ?? null,
    });
    return false;
  }

  let allowedUser: string;
  let allowedChat: string;

  try {
    const env = getEnv();
    allowedUser = overrideConfig?.allowedUserId ?? env.ALLOWED_TELEGRAM_USER_ID;
    allowedChat = overrideConfig?.allowedChatId ?? env.TELEGRAM_CHAT_ID;
  } catch (err) {
    if (overrideConfig?.allowedUserId && overrideConfig?.allowedChatId) {
      allowedUser = overrideConfig.allowedUserId;
      allowedChat = overrideConfig.allowedChatId;
    } else {
      logger.error("[AUTH] Failed to resolve owner environment configuration", err);
      return false;
    }
  }

  const normalizedFromId = String(fromId).trim();
  const normalizedChatId = String(chatId).trim();

  const userMatches = normalizedFromId === allowedUser.trim();
  const chatMatches = normalizedChatId === allowedChat.trim();

  if (!userMatches || !chatMatches) {
    logger.warn("[AUTH] Rejected unauthorized Telegram interaction", {
      senderId: normalizedFromId,
      chatId: normalizedChatId,
      expectedUser: allowedUser.trim(),
      expectedChat: allowedChat.trim(),
      userMatches,
      chatMatches,
    });
    return false;
  }

  return true;
}

/**
 * Returns the standardized polite rejection message for unauthorized senders.
 */
export function getUnauthorizedMessage(): string {
  return UNAUTHORIZED_REJECTION_MESSAGE;
}
