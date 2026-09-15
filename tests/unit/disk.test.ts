import { describe, expect, test } from "bun:test";
import fsSync from "node:fs";
import {
  ensureTmpDir,
  getDiskSpace,
  checkDiskHeadroom,
  assertDiskHeadroom,
  MIN_DISK_HEADROOM_MB,
  TMP_DIR,
} from "../../src/lib/disk";

describe("Disk Headroom & Ephemeral Safety (src/lib/disk.ts)", () => {
  test("ensures temporary sandbox directory exists", () => {
    const dir = ensureTmpDir();
    expect(dir).toBe(TMP_DIR);
    expect(fsSync.existsSync(dir)).toBe(true);
  });

  test("calculates real available and total disk space", async () => {
    const space = await getDiskSpace();
    expect(space.totalMb).toBeGreaterThan(1000); // Host filesystem has tens of GB
    expect(space.availableMb).toBeGreaterThan(0);
    expect(space.totalBytes).toBeGreaterThan(space.availableBytes);
  });

  test("passes headroom check when space exceeds requirement", async () => {
    // 1 MB is well below available space
    const result = await checkDiskHeadroom(1);
    expect(result.ok).toBe(true);
    expect(result.availableMb).toBeGreaterThan(1);
  });

  test("fails headroom check safely when requirement exceeds available space", async () => {
    // Requesting 10,000,000 MB (10 TB) should safely return ok: false
    const impossibleRequirement = 10_000_000;
    const result = await checkDiskHeadroom(impossibleRequirement);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("below the required safety threshold");
  });

  test("assertDiskHeadroom throws when space is insufficient", async () => {
    const impossibleRequirement = 10_000_000;
    expect(async () => {
      await assertDiskHeadroom(impossibleRequirement);
    }).toThrow("VYAVASTHA DISK PROTECTION");
  });

  test("verifies current system satisfies minimum 500 MB headroom threshold", async () => {
    const check = await checkDiskHeadroom(MIN_DISK_HEADROOM_MB);
    expect(check.ok).toBe(true);
    expect(check.availableMb).toBeGreaterThanOrEqual(MIN_DISK_HEADROOM_MB);
  });
});
