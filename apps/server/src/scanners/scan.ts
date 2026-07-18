import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { CategoryId, CategoryResult, ScanItem } from "@msc/shared";
import { CATEGORY_SECTION } from "@msc/shared";
import {
  defaultSafetyContext,
  isInstallerFileName,
  isPathSafeToDelete,
  isUnderInstallerScanRoot,
  type SafetyContext,
} from "../safety/guard.js";
import { itemIdForPath } from "../session.js";
import {
  CATEGORY_DEFINITIONS,
  expandRoots,
  type CategoryDefinition,
} from "./categories.js";

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".Trash",
  "Library",
  "Applications",
]);

const execFileAsync = promisify(execFile);

const LARGE_DIR_THRESHOLD = 200;

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function safeLstat(p: string) {
  try {
    return await fs.lstat(p);
  } catch {
    return null;
  }
}

async function dirEntryCount(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir);
    return entries.length;
  } catch {
    return 0;
  }
}

/** Fast size via `du -sk` (kilobytes). Falls back to recursive walk. */
export async function measureSize(target: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("du", ["-sk", target], {
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const kb = parseInt(stdout.trim().split(/\s+/)[0] ?? "0", 10);
    if (!Number.isNaN(kb)) return kb * 1024;
  } catch {
    // fall through
  }
  return walkSize(target);
}

async function walkSize(target: string): Promise<number> {
  const st = await safeLstat(target);
  if (!st) return 0;
  if (st.isSymbolicLink()) return 0;
  if (st.isFile()) return st.size;
  if (!st.isDirectory()) return 0;

  let total = 0;
  const queue = [target];
  while (queue.length > 0) {
    const dir = queue.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      try {
        if (ent.isSymbolicLink()) continue;
        if (ent.isDirectory()) {
          queue.push(full);
        } else if (ent.isFile()) {
          const s = await fs.lstat(full);
          total += s.size;
        }
      } catch {
        // skip inaccessible
      }
    }
  }
  return total;
}

function ownedByUser(stat: { uid: number }, ctx: SafetyContext): boolean {
  if (ctx.uid < 0) return true;
  return stat.uid === ctx.uid;
}

function isOldEnough(mtimeMs: number, minAgeDays?: number): boolean {
  if (minAgeDays == null) return true;
  const ageMs = Date.now() - mtimeMs;
  return ageMs >= minAgeDays * 24 * 60 * 60 * 1000;
}

export type ScanProgressCallback = (update: {
  categoryId: CategoryId;
  label: string;
  bytesFound: number;
  itemCount: number;
  status: "scanning" | "done" | "error" | "skipped";
  message?: string;
}) => void;

async function scanCategory(
  def: CategoryDefinition,
  ctx: SafetyContext,
  onProgress: ScanProgressCallback,
  signal?: AbortSignal,
): Promise<CategoryResult> {
  const roots = expandRoots(def, ctx.home, ctx.tmpdir);
  const items: ScanItem[] = [];
  let totalBytes = 0;
  let permissionDenied = false;
  let error: string | undefined;

  onProgress({
    categoryId: def.id,
    label: def.label,
    bytesFound: 0,
    itemCount: 0,
    status: "scanning",
  });

  try {
    for (const root of roots) {
      if (signal?.aborted) break;
      if (!(await pathExists(root))) continue;

      if (def.matchInstallers) {
        if (!isUnderInstallerScanRoot(root, ctx)) continue;

        const maxDepth = def.maxDepth ?? 4;
        const queue: { dir: string; depth: number }[] = [
          { dir: root, depth: 0 },
        ];

        while (queue.length > 0) {
          if (signal?.aborted) break;
          const { dir, depth } = queue.shift()!;

          let entries;
          try {
            entries = await fs.readdir(dir, { withFileTypes: true });
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "EPERM" || code === "EACCES") {
              permissionDenied = true;
              error = `Permission denied reading ${dir}`;
            }
            continue;
          }

          for (const ent of entries) {
            if (signal?.aborted) break;
            if (ent.name === "." || ent.name === "..") continue;
            if (ent.name.startsWith(".")) continue;
            if (SKIP_DIR_NAMES.has(ent.name)) continue;

            const full = path.join(dir, ent.name);
            if (ent.isSymbolicLink()) continue;

            const isAppBundle =
              ent.isDirectory() && ent.name.toLowerCase().endsWith(".app");
            const isInstallerName = isInstallerFileName(ent.name);

            let extensionlessExecutable = false;
            if (
              !isInstallerName &&
              ent.isFile() &&
              path.extname(ent.name) === ""
            ) {
              const stProbe = await safeLstat(full);
              if (
                stProbe &&
                !stProbe.isSymbolicLink() &&
                (stProbe.mode & 0o111) !== 0
              ) {
                extensionlessExecutable = true;
              }
            }

            const treatAsExecutable =
              (isInstallerName && (ent.isFile() || isAppBundle)) ||
              extensionlessExecutable;

            if (treatAsExecutable) {
              const check = isPathSafeToDelete(full, ctx);
              if (!check.safe) continue;

              const st = await safeLstat(full);
              if (!st) continue;
              if (!ownedByUser(st, ctx)) continue;
              if (!isOldEnough(st.mtimeMs, def.minAgeDays)) continue;

              let size = 0;
              try {
                size = isAppBundle || st.isDirectory()
                  ? await measureSize(full)
                  : st.size;
              } catch (err) {
                const code = (err as NodeJS.ErrnoException).code;
                if (code === "EPERM" || code === "EACCES") {
                  permissionDenied = true;
                }
                continue;
              }

              if (size <= 0) continue;

              items.push({
                id: itemIdForPath(full),
                categoryId: def.id,
                path: full,
                displayName: ent.name,
                sizeBytes: size,
                kind: isAppBundle || st.isDirectory() ? "dir" : "file",
                lastModified: st.mtimeMs,
              });
              totalBytes += size;

              onProgress({
                categoryId: def.id,
                label: def.label,
                bytesFound: totalBytes,
                itemCount: items.length,
                status: "scanning",
              });
              continue;
            }

            if (ent.isDirectory() && !isAppBundle && depth < maxDepth) {
              queue.push({ dir: full, depth: depth + 1 });
            }
          }
        }
        continue;
      }

      // Root itself must be under allowlist (not used for installer roots)
      const rootCheck = isPathSafeToDelete(root, ctx);
      if (!rootCheck.safe) continue;

      if (def.listChildren) {
        let entries;
        try {
          entries = await fs.readdir(root, { withFileTypes: true });
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "EPERM" || code === "EACCES") {
            permissionDenied = true;
            error = `Permission denied reading ${root}`;
          }
          continue;
        }

        for (const ent of entries) {
          if (signal?.aborted) break;
          if (ent.name === "." || ent.name === "..") continue;
          if (def.excludeBasenames?.includes(ent.name)) continue;

          const full = path.join(root, ent.name);
          const check = isPathSafeToDelete(full, ctx);
          if (!check.safe) continue;

          const st = await safeLstat(full);
          if (!st) continue;
          if (st.isSymbolicLink()) continue;
          if (!ownedByUser(st, ctx)) continue;
          if (!isOldEnough(st.mtimeMs, def.minAgeDays)) continue;

          let size = 0;
          try {
            if (st.isDirectory()) {
              const count = await dirEntryCount(full);
              size =
                count > LARGE_DIR_THRESHOLD
                  ? await measureSize(full)
                  : await walkSize(full);
            } else {
              size = st.size;
            }
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "EPERM" || code === "EACCES") permissionDenied = true;
            continue;
          }

          if (size <= 0) continue;

          items.push({
            id: itemIdForPath(full),
            categoryId: def.id,
            path: full,
            displayName: ent.name,
            sizeBytes: size,
            kind: st.isDirectory() ? "dir" : "file",
            lastModified: st.mtimeMs,
          });
          totalBytes += size;

          onProgress({
            categoryId: def.id,
            label: def.label,
            bytesFound: totalBytes,
            itemCount: items.length,
            status: "scanning",
          });
        }
      } else {
        // Treat entire root as one item
        const st = await safeLstat(root);
        if (!st || st.isSymbolicLink()) continue;
        if (!ownedByUser(st, ctx)) continue;

        let size = 0;
        try {
          size = st.isDirectory() ? await measureSize(root) : st.size;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "EPERM" || code === "EACCES") {
            permissionDenied = true;
            error = `Permission denied measuring ${root}`;
          }
          continue;
        }

        if (size <= 0) continue;

        items.push({
          id: itemIdForPath(root),
          categoryId: def.id,
          path: root,
          displayName: path.basename(root),
          sizeBytes: size,
          kind: st.isDirectory() ? "dir" : "file",
          lastModified: st.mtimeMs,
        });
        totalBytes += size;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Sort largest first
  items.sort((a, b) => b.sizeBytes - a.sizeBytes);

  const status = error && items.length === 0 ? "error" : "done";
  onProgress({
    categoryId: def.id,
    label: def.label,
    bytesFound: totalBytes,
    itemCount: items.length,
    status,
    message: error,
  });

  return {
    id: def.id,
    label: def.label,
    section: CATEGORY_SECTION[def.id],
    totalBytes,
    itemCount: items.length,
    items,
    error,
    permissionDenied: permissionDenied || undefined,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function runFullScan(
  onProgress: ScanProgressCallback,
  options?: {
    categoryIds?: CategoryId[];
    signal?: AbortSignal;
    ctx?: SafetyContext;
  },
): Promise<CategoryResult[]> {
  const ctx = options?.ctx ?? defaultSafetyContext();
  const defs = options?.categoryIds
    ? CATEGORY_DEFINITIONS.filter((d) => options.categoryIds!.includes(d.id))
    : CATEGORY_DEFINITIONS;

  return mapPool(defs, 4, (def) =>
    scanCategory(def, ctx, onProgress, options?.signal),
  );
}

export function getCategoryDefinitions() {
  return CATEGORY_DEFINITIONS.map((d) => ({
    id: d.id,
    label: d.label,
    roots: expandRoots(d, os.homedir(), os.tmpdir()),
  }));
}
