import { z } from "zod";

export const CategoryIdSchema = z.enum([
  "user_caches",
  "user_logs",
  "tmp",
  "trash",
  "npm_cache",
  "yarn_cache",
  "pnpm_cache",
  "homebrew_cache",
  "pip_cache",
  "chrome_cache",
  "safari_cache",
  "xcode_derived",
  "simulator_caches",
  "simulator_logs",
  "ios_device_support",
  "watchos_device_support",
  "installers",
]);

export type CategoryId = z.infer<typeof CategoryIdSchema>;

export const CategorySectionSchema = z.enum([
  "general",
  "developer",
  "installers",
]);
export type CategorySection = z.infer<typeof CategorySectionSchema>;

/** Disk images, installers, and common executable download types. */
export const INSTALLER_EXTENSIONS = [
  ".dmg",
  ".pkg",
  ".mpkg",
  ".exe",
  ".msi",
  ".msix",
  ".iso",
  ".img",
  ".apk",
  ".ipa",
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".deb",
  ".rpm",
  ".appimage",
  ".run",
  ".bin",
] as const;

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  user_caches: "App caches",
  user_logs: "User logs",
  tmp: "Temp files",
  trash: "Trash",
  npm_cache: "npm cache",
  yarn_cache: "Yarn cache",
  pnpm_cache: "pnpm cache",
  homebrew_cache: "Homebrew cache",
  pip_cache: "pip cache",
  chrome_cache: "Chrome cache",
  safari_cache: "Safari cache",
  xcode_derived: "Xcode DerivedData",
  simulator_caches: "iOS Simulator caches",
  simulator_logs: "Simulator logs",
  ios_device_support: "iOS DeviceSupport",
  watchos_device_support: "watchOS DeviceSupport",
  installers: "Installers & executables",
};

export const CATEGORY_SECTION: Record<CategoryId, CategorySection> = {
  user_caches: "general",
  user_logs: "general",
  tmp: "general",
  trash: "general",
  npm_cache: "general",
  yarn_cache: "general",
  pnpm_cache: "general",
  homebrew_cache: "general",
  pip_cache: "general",
  chrome_cache: "general",
  safari_cache: "general",
  xcode_derived: "developer",
  simulator_caches: "developer",
  simulator_logs: "developer",
  ios_device_support: "developer",
  watchos_device_support: "developer",
  installers: "installers",
};

export const SECTION_META: Record<
  CategorySection,
  { title: string; description: string }
> = {
  general: {
    title: "System & app junk",
    description:
      "Caches, logs, temp files, Trash, and package-manager downloads you can safely regenerate.",
  },
  developer: {
    title: "Simulator & Xcode",
    description:
      "DerivedData, Simulator caches/logs, and old DeviceSupport folders. Regenerated when you build or plug in a device.",
  },
  installers: {
    title: "Installers & executables",
    description:
      "Disk images and installers in Downloads/Desktop (.dmg, .pkg, .exe, and similar). Review before deleting — you may still need them.",
  },
};

export const ScanItemSchema = z.object({
  id: z.string(),
  categoryId: CategoryIdSchema,
  path: z.string(),
  displayName: z.string(),
  sizeBytes: z.number().nonnegative(),
  kind: z.enum(["file", "dir"]),
  lastModified: z.number().optional(),
});

export type ScanItem = z.infer<typeof ScanItemSchema>;

export const CategoryResultSchema = z.object({
  id: CategoryIdSchema,
  label: z.string(),
  section: CategorySectionSchema,
  totalBytes: z.number().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  items: z.array(ScanItemSchema),
  error: z.string().optional(),
  permissionDenied: z.boolean().optional(),
});

export type CategoryResult = z.infer<typeof CategoryResultSchema>;

export const DiskInfoSchema = z.object({
  totalBytes: z.number().nonnegative(),
  freeBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative(),
  mountPoint: z.string(),
});

export type DiskInfo = z.infer<typeof DiskInfoSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  platform: z.string(),
  darwin: z.boolean(),
  home: z.string().optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ScanProgressEventSchema = z.object({
  type: z.literal("progress"),
  categoryId: CategoryIdSchema,
  label: z.string(),
  bytesFound: z.number().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  status: z.enum(["scanning", "done", "error", "skipped"]),
  message: z.string().optional(),
});

export type ScanProgressEvent = z.infer<typeof ScanProgressEventSchema>;

export const ScanCompleteEventSchema = z.object({
  type: z.literal("complete"),
  categories: z.array(CategoryResultSchema),
  totalBytes: z.number().nonnegative(),
  scanId: z.string(),
});

export type ScanCompleteEvent = z.infer<typeof ScanCompleteEventSchema>;

export const ScanErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});

export type ScanErrorEvent = z.infer<typeof ScanErrorEventSchema>;

export const ScanEventSchema = z.discriminatedUnion("type", [
  ScanProgressEventSchema,
  ScanCompleteEventSchema,
  ScanErrorEventSchema,
]);

export type ScanEvent = z.infer<typeof ScanEventSchema>;

export const DeleteRequestSchema = z.object({
  itemIds: z.array(z.string()).min(1),
  dryRun: z.boolean().optional().default(false),
});

export type DeleteRequest = z.infer<typeof DeleteRequestSchema>;

export const DeleteItemResultSchema = z.object({
  id: z.string(),
  path: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
  bytesFreed: z.number().nonnegative().optional(),
});

export type DeleteItemResult = z.infer<typeof DeleteItemResultSchema>;

export const DeleteResponseSchema = z.object({
  results: z.array(DeleteItemResultSchema),
  totalBytesFreed: z.number().nonnegative(),
  dryRun: z.boolean(),
});

export type DeleteResponse = z.infer<typeof DeleteResponseSchema>;

export const EmptyTrashResponseSchema = z.object({
  ok: z.boolean(),
  bytesFreed: z.number().nonnegative(),
  error: z.string().optional(),
});

export type EmptyTrashResponse = z.infer<typeof EmptyTrashResponseSchema>;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
