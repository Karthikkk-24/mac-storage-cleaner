import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { DeleteItemResult } from "@msc/shared";
import {
  defaultSafetyContext,
  isPathSafeToDelete,
} from "../safety/guard.js";
import { getSession, type RegisteredItem } from "../session.js";

const execFileAsync = promisify(execFile);

async function uniqueTrashName(base: string): Promise<string> {
  const trash = path.join(os.homedir(), ".Trash");
  let candidate = base;
  let i = 0;
  while (true) {
    try {
      await fs.access(path.join(trash, candidate));
      i += 1;
      const ext = path.extname(base);
      const stem = path.basename(base, ext);
      candidate = `${stem} ${i}${ext}`;
    } catch {
      return candidate;
    }
  }
}

/** Move path into ~/.Trash using rename, falling back to osascript. */
export async function moveToTrash(absPath: string): Promise<void> {
  const trashDir = path.join(os.homedir(), ".Trash");
  await fs.mkdir(trashDir, { recursive: true });

  const destName = await uniqueTrashName(path.basename(absPath));
  const dest = path.join(trashDir, destName);

  try {
    await fs.rename(absPath, dest);
    return;
  } catch {
    // Cross-device or busy — try Finder
  }

  // osascript: POSIX file path
  const escaped = absPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  await execFileAsync("osascript", [
    "-e",
    `tell application "Finder" to delete (POSIX file "${escaped}")`,
  ]);
}

export async function deleteItems(
  itemIds: string[],
  options?: { dryRun?: boolean },
): Promise<{ results: DeleteItemResult[]; totalBytesFreed: number }> {
  const session = getSession();
  if (!session) {
    return {
      results: itemIds.map((id) => ({
        id,
        path: "",
        ok: false,
        error: "No active scan session — run a scan first",
      })),
      totalBytesFreed: 0,
    };
  }

  const ctx = defaultSafetyContext();
  const dryRun = options?.dryRun ?? false;
  const results: DeleteItemResult[] = [];
  let totalBytesFreed = 0;

  for (const id of itemIds) {
    const item: RegisteredItem | undefined = session.get(id);
    if (!item) {
      results.push({
        id,
        path: "",
        ok: false,
        error: "Unknown item id — not in current scan session",
      });
      continue;
    }

    const check = isPathSafeToDelete(item.path, ctx);
    if (!check.safe) {
      results.push({
        id,
        path: item.path,
        ok: false,
        error: `Safety check failed: ${check.reason}`,
      });
      continue;
    }

    // Ensure path still exists and matches
    try {
      await fs.lstat(item.path);
    } catch {
      results.push({
        id,
        path: item.path,
        ok: false,
        error: "Path no longer exists",
      });
      continue;
    }

    if (dryRun) {
      results.push({
        id,
        path: item.path,
        ok: true,
        bytesFreed: item.sizeBytes,
      });
      totalBytesFreed += item.sizeBytes;
      continue;
    }

    try {
      await moveToTrash(item.path);
      results.push({
        id,
        path: item.path,
        ok: true,
        bytesFreed: item.sizeBytes,
      });
      totalBytesFreed += item.sizeBytes;
    } catch (err) {
      results.push({
        id,
        path: item.path,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { results, totalBytesFreed };
}

export async function emptyTrash(): Promise<{
  ok: boolean;
  bytesFreed: number;
  error?: string;
}> {
  const trash = path.join(os.homedir(), ".Trash");
  const ctx = defaultSafetyContext();
  let bytesFreed = 0;

  try {
    const entries = await fs.readdir(trash);
    const { measureSize } = await import("../scanners/scan.js");

    for (const name of entries) {
      if (name === "." || name === "..") continue;
      const full = path.join(trash, name);
      const safety = isPathSafeToDelete(full, ctx);
      if (!safety.safe) continue;

      try {
        bytesFreed += await measureSize(full);
        await fs.rm(full, { recursive: true, force: true });
      } catch {
        // skip failed entries
      }
    }
    return { ok: true, bytesFreed };
  } catch (err) {
    return {
      ok: false,
      bytesFreed,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
