import type { CategoryId } from "@msc/shared";
import { CATEGORY_LABELS } from "@msc/shared";
import os from "node:os";
import path from "node:path";

export type CategoryDefinition = {
  id: CategoryId;
  label: string;
  /** Absolute roots to scan (expanded at runtime). */
  roots: (home: string, tmpdir: string) => string[];
  /** If true, list immediate children as items instead of the root itself. */
  listChildren: boolean;
  /**
   * Recursively find installer/executable files under roots.
   * When set, listChildren / whole-root modes are ignored.
   */
  matchInstallers?: boolean;
  /** Max directory depth for matchInstallers walks (root = 0). */
  maxDepth?: number;
  /** Optional minimum age in days (mtime). */
  minAgeDays?: number;
  /** Skip these basename patterns under the roots. */
  excludeBasenames?: string[];
};

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: "user_caches",
    label: CATEGORY_LABELS.user_caches,
    roots: (home) => [path.join(home, "Library", "Caches")],
    listChildren: true,
    excludeBasenames: ["CloudKit", "com.apple.Keychains"],
  },
  {
    id: "user_logs",
    label: CATEGORY_LABELS.user_logs,
    roots: (home) => [path.join(home, "Library", "Logs")],
    listChildren: true,
    excludeBasenames: ["CoreSimulator"],
  },
  {
    id: "tmp",
    label: CATEGORY_LABELS.tmp,
    roots: (_home, tmpdir) => [tmpdir, "/tmp"],
    listChildren: true,
    minAgeDays: 7,
  },
  {
    id: "trash",
    label: CATEGORY_LABELS.trash,
    roots: (home) => [path.join(home, ".Trash")],
    listChildren: true,
  },
  {
    id: "npm_cache",
    label: CATEGORY_LABELS.npm_cache,
    roots: (home) => [path.join(home, ".npm", "_cacache")],
    listChildren: false,
  },
  {
    id: "yarn_cache",
    label: CATEGORY_LABELS.yarn_cache,
    roots: (home) => [
      path.join(home, "Library", "Caches", "Yarn"),
      path.join(home, ".yarn", "cache"),
    ],
    listChildren: false,
  },
  {
    id: "pnpm_cache",
    label: CATEGORY_LABELS.pnpm_cache,
    roots: (home) => [
      path.join(home, "Library", "pnpm", "cache"),
      path.join(home, "Library", "Caches", "pnpm"),
    ],
    listChildren: false,
  },
  {
    id: "homebrew_cache",
    label: CATEGORY_LABELS.homebrew_cache,
    roots: (home) => [path.join(home, "Library", "Caches", "Homebrew")],
    listChildren: false,
  },
  {
    id: "pip_cache",
    label: CATEGORY_LABELS.pip_cache,
    roots: (home) => [path.join(home, "Library", "Caches", "pip")],
    listChildren: false,
  },
  {
    id: "chrome_cache",
    label: CATEGORY_LABELS.chrome_cache,
    roots: (home) => [
      path.join(home, "Library", "Caches", "Google", "Chrome"),
    ],
    listChildren: true,
  },
  {
    id: "safari_cache",
    label: CATEGORY_LABELS.safari_cache,
    roots: (home) => [
      path.join(home, "Library", "Caches", "com.apple.Safari"),
    ],
    listChildren: false,
  },
  {
    id: "xcode_derived",
    label: CATEGORY_LABELS.xcode_derived,
    roots: (home) => [
      path.join(home, "Library", "Developer", "Xcode", "DerivedData"),
    ],
    listChildren: true,
  },
  {
    id: "simulator_caches",
    label: CATEGORY_LABELS.simulator_caches,
    roots: (home) => [
      path.join(home, "Library", "Developer", "CoreSimulator", "Caches"),
    ],
    listChildren: true,
  },
  {
    id: "simulator_logs",
    label: CATEGORY_LABELS.simulator_logs,
    roots: (home) => [path.join(home, "Library", "Logs", "CoreSimulator")],
    listChildren: true,
  },
  {
    id: "ios_device_support",
    label: CATEGORY_LABELS.ios_device_support,
    roots: (home) => [
      path.join(home, "Library", "Developer", "Xcode", "iOS DeviceSupport"),
    ],
    listChildren: true,
  },
  {
    id: "watchos_device_support",
    label: CATEGORY_LABELS.watchos_device_support,
    roots: (home) => [
      path.join(home, "Library", "Developer", "Xcode", "watchOS DeviceSupport"),
    ],
    listChildren: true,
  },
  {
    id: "installers",
    label: CATEGORY_LABELS.installers,
    roots: (home) => [
      path.join(home, "Downloads"),
      path.join(home, "Desktop"),
    ],
    listChildren: false,
    matchInstallers: true,
    maxDepth: 4,
  },
];

export function expandRoots(
  def: CategoryDefinition,
  home = os.homedir(),
  tmpdir = os.tmpdir(),
): string[] {
  return def.roots(home, tmpdir).map((p) => path.normalize(p));
}
