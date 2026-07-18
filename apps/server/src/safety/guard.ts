import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { INSTALLER_EXTENSIONS } from "@msc/shared";

/**
 * Allowlist-only safety: a path is deletable only if it sits under an
 * allowlisted root AND does not match any hard-deny prefix.
 *
 * Exception: installer/executable files under Downloads or Desktop that
 * match a known extension (or .app bundle) may be deleted even though those
 * folders are otherwise denied.
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

const INSTALLER_EXT_SET = new Set(
  INSTALLER_EXTENSIONS.map((e) => e.toLowerCase()),
);

export function isInstallerFileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".app")) return true;
  const ext = path.extname(lower);
  return INSTALLER_EXT_SET.has(ext);
}

export function isUnderInstallerScanRoot(
  candidate: string,
  ctx: SafetyContext = defaultSafetyContext(),
): boolean {
  const resolved = path.normalize(candidate);
  const roots = [
    path.join(ctx.home, "Downloads"),
    path.join(ctx.home, "Desktop"),
  ].map((p) => path.normalize(p));
  return roots.some((root) => isUnder(root, resolved));
}

/**
 * True when path is an installer/executable under Downloads or Desktop.
 * Documents and other personal folders stay denied.
 */
export function isSafeInstallerPath(
  candidate: string,
  ctx: SafetyContext = defaultSafetyContext(),
): boolean {
  const resolved = path.normalize(candidate);
  if (!isUnderInstallerScanRoot(resolved, ctx)) return false;
  const downloads = path.normalize(path.join(ctx.home, "Downloads"));
  const desktop = path.normalize(path.join(ctx.home, "Desktop"));
  if (resolved === downloads || resolved === desktop) return false;

  const base = path.basename(resolved);
  if (isInstallerFileName(base)) return true;

  // Extensionless binary with execute bit (verified on disk)
  if (path.extname(base) === "") {
    try {
      const st = fs.statSync(resolved);
      if (st.isFile() && (st.mode & 0o111) !== 0) return true;
    } catch {
      return false;
    }
  }
  return false;
}

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
    path.join(home, "Library", "Developer", "Xcode", "iOS DeviceSupport"),
    path.join(home, "Library", "Developer", "Xcode", "watchOS DeviceSupport"),
    path.join(home, "Library", "Developer", "CoreSimulator", "Caches"),
    path.join(home, "Library", "Logs", "CoreSimulator"),
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
  options?: {
    allowlistedRoots?: string[];
    resolvedPath?: string;
  },
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

  const parts = normalized.split(path.sep);
  if (parts.includes("..")) {
    return { safe: false, reason: "path contains .." };
  }

  const resolved = options?.resolvedPath
    ? path.normalize(options.resolvedPath)
    : normalized;

  // Installer exception: .dmg/.exe/etc. under Downloads or Desktop only
  if (isSafeInstallerPath(resolved, ctx)) {
    return { safe: true, resolved };
  }

  const denyPrefixes = getDenyPrefixes(ctx);
  for (const deny of denyPrefixes) {
    if (isUnder(deny, resolved)) {
      return { safe: false, reason: `denied prefix: ${deny}`, resolved };
    }
  }

  const roots = options?.allowlistedRoots ?? getAllowlistedRoots(ctx);
  const underAllowlist = roots.some((root) => isUnder(root, resolved));
  if (!underAllowlist) {
    return { safe: false, reason: "not under any allowlisted root", resolved };
  }

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
