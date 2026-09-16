/**
 * VYAVASTHA — Telegram Long-Polling Runner
 *
 * Local development CLI runner (`bun run src/bot/polling.ts`) providing an alternative
 * to webhooks. Uses getUpdates with offset management, error backoff, and graceful termination.
 */

import { logger } from "../lib/logger";
import { TelegramClient } from "./client";
import { TelegramRouter } from "./router";

export interface PollingOptions {
  client?: TelegramClient;
  router?: TelegramRouter;
  timeoutSeconds?: number;
  errorBackoffMs?: number;
}

export class TelegramPollingRunner {
  private readonly client: TelegramClient;
  private readonly router: TelegramRouter;
  private readonly timeoutSeconds: number;
  private readonly errorBackoffMs: number;
  private isRunning: boolean = false;
  private currentOffset: number = 0;

  constructor(options?: PollingOptions) {
    this.client = options?.client ?? new TelegramClient();
    this.router = options?.router ?? new TelegramRouter({ client: this.client });
    this.timeoutSeconds = options?.timeoutSeconds ?? 30;
    this.errorBackoffMs = options?.errorBackoffMs ?? 3000;
  }

  /**
   * Starts the polling loop.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("[POLLING] Runner is already active");
      return;
    }

    this.isRunning = true;
    logger.info("[POLLING] Starting Telegram long-polling runner...");

    // Remove any lingering webhook to enable getUpdates polling
    try {
      await this.client.deleteWebhook({ drop_pending_updates: false });
      logger.info("[POLLING] Cleared existing webhook for polling mode");
    } catch (err) {
      logger.warn("[POLLING] Could not clear webhook on startup", { error: String(err) });
    }

    // Register shutdown hooks
    const shutdown = () => {
      logger.info("[POLLING] Received termination signal, stopping cleanly...");
      this.stop();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    while (this.isRunning) {
      try {
        const updates = await this.client.getUpdates({
          offset: this.currentOffset,
          timeout: this.timeoutSeconds,
          allowed_updates: ["message", "edited_message"],
        });

        for (const update of updates) {
          if (!this.isRunning) break;
          this.currentOffset = update.update_id + 1;
          await this.router.handleUpdate(update);
        }
      } catch (err) {
        if (!this.isRunning) break;
        logger.error("[POLLING] Error in update polling loop", err);
        await new Promise((resolve) => setTimeout(resolve, this.errorBackoffMs));
      }
    }

    logger.info("[POLLING] Polling loop stopped gracefully.");
  }

  /**
   * Halts the polling loop.
   */
  stop(): void {
    this.isRunning = false;
  }
}

/**
 * CLI execution entrypoint.
 */
if (import.meta.main) {
  const runner = new TelegramPollingRunner();
  runner.start().catch((err) => {
    logger.error("[POLLING] Fatal runner failure", err);
    process.exit(1);
  });
}
