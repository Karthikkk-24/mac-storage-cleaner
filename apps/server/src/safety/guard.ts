import os from "node:os";
import path from "node:path";

/**
 * Allowlist-only safety: a path is deletable only if it sits under an
 * allowlisted root AND does not match any hard-deny prefix.
 */

export type SafetyContext = {
  home: string;
  tmpdir: string;
  uid: number;
};

export function defaultSafetyContext(): SafetyContext {
  return {
    home: os.homedir(),
    tmpdir: os.tmpdir(),
    uid: typeof process.getuid === "function" ? process.getuid() : -1,
  };
}

/** Hard-deny prefixes relative to home (resolved at check time). */
const HOME_DENY_SUFFIXES = [
  "Documents",
  "Desktop",
  "Pictures",
  "Movies",
  "Music",
  "Downloads",
  ".ssh",
  ".gnupg",
  ".aws",
  ".config",
] as const;

/** Absolute system deny prefixes. */
const ABSOLUTE_DENY_PREFIXES = [
  "/System",
  "/usr",
  "/bin",
  "/sbin",
  "/private/var/db",
  "/Library",
  "/Applications",
] as const;

/**
 * Allowlisted roots. Paths must be under one of these (after realpath)
 * to be considered for delete. Category scanners further constrain roots.
 */
export function getAllowlistedRoots(ctx: SafetyContext = defaultSafetyContext()): string[] {
  const { home, tmpdir } = ctx;
  return [
    path.join(home, "Library", "Caches"),
    path.join(home, "Library", "Logs"),
    path.join(home, "Library", "Developer", "Xcode", "DerivedData"),
    path.join(home, ".Trash"),
    path.join(home, ".npm", "_cacache"),
    path.join(home, ".yarn", "cache"),
    path.join(home, "Library", "Caches", "Yarn"),
    path.join(home, "Library", "pnpm"),
    path.join(home, "Library", "Caches", "Homebrew"),
    path.join(home, "Library", "Caches", "pip"),
    path.join(home, "Library", "Caches", "Google", "Chrome"),
    path.join(home, "Library", "Caches", "com.apple.Safari"),
    tmpdir,
    "/tmp",
  ].map((p) => path.normalize(p));
}

function isUnder(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function getDenyPrefixes(ctx: SafetyContext): string[] {
  const homeDenies = HOME_DENY_SUFFIXES.map((s) =>
    path.normalize(path.join(ctx.home, s)),
  );
  return [...ABSOLUTE_DENY_PREFIXES.map((p) => path.normalize(p)), ...homeDenies];
}

export type SafetyResult =
  | { safe: true; resolved: string }
  | { safe: false; reason: string; resolved?: string };

/**
 * Normalize and validate a candidate delete path.
 * Callers should pass an already-absolute path; we reject `..` after normalize.
 */
export function isPathSafeToDelete(
  candidate: string,
  ctx: SafetyContext = defaultSafetyContext(),
  options?: { allowlistedRoots?: string[]; resolvedPath?: string },
): SafetyResult {
  if (!candidate || typeof candidate !== "string") {
    return { safe: false, reason: "empty path" };
  }

  if (candidate.includes("\0")) {
    return { safe: false, reason: "null byte in path" };
  }

  const normalized = path.normalize(candidate);

  if (!path.isAbsolute(normalized)) {
    return { safe: false, reason: "path must be absolute" };
  }

  // After normalize, reject any remaining .. segments (shouldn't happen for abs paths)
  const parts = normalized.split(path.sep);
  if (parts.includes("..")) {
    return { safe: false, reason: "path contains .." };
  }

  const resolved = options?.resolvedPath
    ? path.normalize(options.resolvedPath)
    : normalized;

  const denyPrefixes = getDenyPrefixes(ctx);
  for (const deny of denyPrefixes) {
    if (isUnder(deny, resolved)) {
      return { safe: false, reason: `denied prefix: ${deny}`, resolved };
    }
  }

  // System Library is denied; user Library is OK only under allowlisted subtrees
  const roots = options?.allowlistedRoots ?? getAllowlistedRoots(ctx);
  const underAllowlist = roots.some((root) => isUnder(root, resolved));
  if (!underAllowlist) {
    return { safe: false, reason: "not under any allowlisted root", resolved };
  }

  // Extra: never delete the allowlisted root itself if it's home or /
  if (resolved === path.normalize(ctx.home) || resolved === "/") {
    return { safe: false, reason: "refusing to delete home or root", resolved };
  }

  return { safe: true, resolved };
}

/** Check whether a path is under a specific category root (and overall safe). */
export function isPathUnderCategoryRoot(
  candidate: string,
  categoryRoots: string[],
  ctx: SafetyContext = defaultSafetyContext(),
): SafetyResult {
  const normalized = path.normalize(candidate);
  const underCategory = categoryRoots.some((root) =>
    isUnder(path.normalize(root), normalized),
  );
  if (!underCategory) {
    return { safe: false, reason: "not under category roots" };
  }
  return isPathSafeToDelete(normalized, ctx, {
    allowlistedRoots: getAllowlistedRoots(ctx),
  });
}

export { isUnder };
