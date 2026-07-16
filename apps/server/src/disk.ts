import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiskInfo } from "@msc/shared";

const execFileAsync = promisify(execFile);

export async function getDiskInfo(): Promise<DiskInfo> {
  // df -kP / — portable-ish on macOS
  const { stdout } = await execFileAsync("df", ["-kP", "/"]);
  const lines = stdout.trim().split("\n");
  const data = lines[lines.length - 1];
  if (!data) {
    throw new Error("Unable to parse df output");
  }

  // Filesystem 1024-blocks Used Available Capacity Mounted on
  const parts = data.split(/\s+/);
  const totalKb = parseInt(parts[1] ?? "0", 10);
  const usedKb = parseInt(parts[2] ?? "0", 10);
  const availKb = parseInt(parts[3] ?? "0", 10);
  const mountPoint = parts[5] ?? "/";

  return {
    totalBytes: totalKb * 1024,
    usedBytes: usedKb * 1024,
    freeBytes: availKb * 1024,
    mountPoint,
  };
}
