export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
}

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /password/i,
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /auth[_-]?header/i,
  /cookie/i,
  /private[_-]?key/i,
];

// Regex for Telegram Bot tokens: e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456
const TELEGRAM_TOKEN_REGEX = /\b\d{8,10}:[A-Za-z0-9_-]{28,45}\b/g;

// Regex for Bearer tokens
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;

/**
 * Collects known secret values from environment to ensure exact-match redaction.
 */
function getKnownSecretStrings(): string[] {
  const secretKeys = [
    "TURSO_AUTH_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "GEMINI_API_KEY",
    "FIRECRAWL_API_KEY",
    "APP_MASTER_PASSWORD",
    "SESSION_SECRET",
  ];

  const secrets: string[] = [];
  for (const key of secretKeys) {
    const val = process.env[key];
    if (val && val.length >= 6) {
      secrets.push(val);
    }
  }
  return secrets;
}

/**
 * Redacts known sensitive strings and patterns from a given string.
 */
export function redactString(str: string): string {
  if (!str) return str;

  let cleaned = str;

  // Redact known environment secrets
  const knownSecrets = getKnownSecretStrings();
  for (const secret of knownSecrets) {
    if (cleaned.includes(secret)) {
      cleaned = cleaned.replaceAll(secret, "[REDACTED_SECRET]");
    }
  }

  // Redact Telegram tokens
  cleaned = cleaned.replace(TELEGRAM_TOKEN_REGEX, "[REDACTED_TELEGRAM_TOKEN]");

  // Redact Bearer tokens
  cleaned = cleaned.replace(BEARER_REGEX, "Bearer [REDACTED_TOKEN]");

  return cleaned;
}

/**
 * Deeply and safely redacts an object or value, masking sensitive keys and secret values.
 */
export function redact(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return "[CIRCULAR]";
    }
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((item) => redact(item, seen));
    }

    const redactedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        redactedObj[key] = "[REDACTED]";
      } else {
        redactedObj[key] = redact(val, seen);
      }
    }
    return redactedObj;
  }

  return String(value);
}

export type LogWriter = (entry: LogEntry, formattedJson: string) => void;

export class Logger {
  private writer: LogWriter;

  constructor(writer?: LogWriter) {
    this.writer =
      writer ||
      ((entry, formatted) => {
        if (entry.level === "error") {
          console.error(formatted);
        } else if (entry.level === "warn") {
          console.warn(formatted);
        } else {
          console.log(formatted);
        }
      });
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, err?: unknown): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: redactString(message),
    };

    if (context) {
      entry.context = redact(context) as Record<string, unknown>;
    }

    if (err) {
      entry.error = redact(err instanceof Error ? err : new Error(String(err))) as {
        name?: string;
        message: string;
        stack?: string;
      };
    }

    const formatted = JSON.stringify(entry);
    this.writer(entry, formatted);
    return entry;
  }

  debug(message: string, context?: Record<string, unknown>): LogEntry {
    return this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): LogEntry {
    return this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): LogEntry {
    return this.log("warn", message, context);
  }

  error(message: string, err?: unknown, context?: Record<string, unknown>): LogEntry {
    return this.log("error", message, context, err);
  }
}

export const logger = new Logger();
