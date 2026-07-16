import fs from "node:fs/promises";
import type { DiskInfo } from "@msc/shared";

/**
 * macOS APFS: `df /` is the sealed system snapshot and under-reports "Used"
 * (~system only). Prefer the Data volume, then fall back to total − free so
 * the UI numbers always add up.
 */
export async function getDiskInfo(): Promise<DiskInfo> {
  const candidates = ["/System/Volumes/Data", "/"];

  for (const mountPoint of candidates) {
    try {
      const s = await fs.statfs(mountPoint);
      const blockSize = Number(s.bsize);
      const totalBytes = Number(s.blocks) * blockSize;
      const freeBytes = Number(s.bavail) * blockSize;
      // Always derive used from capacity − free so APFS quirks don't show
      // "12 GB used of 228 GB" with only 6 GB free.
      const usedBytes = Math.max(0, totalBytes - freeBytes);

      if (totalBytes > 0) {
        return {
          totalBytes,
          freeBytes,
          usedBytes,
          mountPoint,
        };
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error("Unable to read disk statistics");
}
