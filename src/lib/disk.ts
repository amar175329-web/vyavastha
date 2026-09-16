import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { logger } from "./logger";

/**
 * Minimum disk headroom requirement for VYAVASTHA operations (500 MB).
 * All temporary ingestion, downloads, or buffer operations MUST halt if available
 * disk space falls below this safety boundary.
 */
export const MIN_DISK_HEADROOM_MB = process.env.VERCEL ? 50 : 500;

export const TMP_DIR = process.env.VERCEL ? "/tmp" : path.resolve(process.cwd(), "tmp");

/**
 * Ensures the temporary directory exists synchronously or asynchronously.
 * Returns the resolved directory path.
 */
export function ensureTmpDir(): string {
  if (!fsSync.existsSync(TMP_DIR)) {
    try {
      fsSync.mkdirSync(TMP_DIR, { recursive: true });
      logger.debug("[DISK] Initialized temporary directory", { path: TMP_DIR });
    } catch {
      return "/tmp";
    }
  }
  return TMP_DIR;
}

export interface DiskSpaceInfo {
  totalBytes: number;
  availableBytes: number;
  freeBytes: number;
  totalMb: number;
  availableMb: number;
  freeMb: number;
}

/**
 * Inspects the filesystem disk space at the specified target directory.
 */
export async function getDiskSpace(targetPath: string = TMP_DIR): Promise<DiskSpaceInfo> {
  ensureTmpDir();
  const stats = await fs.statfs(targetPath);

  const bsize = Number(stats.bsize);
  const totalBytes = Number(stats.blocks) * bsize;
  const freeBytes = Number(stats.bfree) * bsize;
  const availableBytes = Number(stats.bavail) * bsize;

  const toMb = (bytes: number) => Math.round(bytes / (1024 * 1024));

  return {
    totalBytes,
    availableBytes,
    freeBytes,
    totalMb: toMb(totalBytes),
    availableMb: toMb(availableBytes),
    freeMb: toMb(freeBytes),
  };
}

export interface HeadroomCheckResult {
  ok: boolean;
  availableMb: number;
  requiredMb: number;
  reason?: string;
}

/**
 * Checks whether the host system has sufficient disk headroom.
 * Defaults to enforcing the 500 MB minimum threshold.
 */
export async function checkDiskHeadroom(requiredMb: number = MIN_DISK_HEADROOM_MB): Promise<HeadroomCheckResult> {
  try {
    const space = await getDiskSpace();
    if (space.availableMb < requiredMb) {
      const reason = `Available disk space (${space.availableMb} MB) is below the required safety threshold (${requiredMb} MB)`;
      logger.warn("[DISK] Headroom safety alert", { availableMb: space.availableMb, requiredMb });
      return {
        ok: false,
        availableMb: space.availableMb,
        requiredMb,
        reason,
      };
    }

    return {
      ok: true,
      availableMb: space.availableMb,
      requiredMb,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[DISK] Failed to check disk space", err);
    return {
      ok: false,
      availableMb: 0,
      requiredMb,
      reason: `Failed to inspect disk space: ${errorMsg}`,
    };
  }
}

/**
 * Asserts disk headroom, throwing an Error if insufficient space exists.
 */
export async function assertDiskHeadroom(requiredMb: number = MIN_DISK_HEADROOM_MB): Promise<void> {
  const check = await checkDiskHeadroom(requiredMb);
  if (!check.ok) {
    throw new Error(`[VYAVASTHA DISK PROTECTION] Operation halted: ${check.reason}`);
  }
}

/**
 * Safely cleans up stale files in the tmp directory older than maxAgeMs.
 */
export async function cleanTmpDir(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<{ removedCount: number }> {
  ensureTmpDir();
  let removedCount = 0;
  const now = Date.now();

  try {
    const files = await fs.readdir(TMP_DIR);
    for (const file of files) {
      if (file === ".gitkeep") continue;
      const fullPath = path.join(TMP_DIR, file);
      try {
        const stat = await fs.stat(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(fullPath);
          removedCount++;
        }
      } catch {
        // Ignore individual file removal errors
      }
    }
  } catch (err) {
    logger.warn("[DISK] Could not read tmp directory during cleanup", { error: String(err) });
  }

  return { removedCount };
}
