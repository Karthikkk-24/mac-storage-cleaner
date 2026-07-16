import { formatBytes, type DiskInfo } from "@msc/shared";

type Props = {
  disk: DiskInfo | null;
  loading?: boolean;
};

export function DiskMeter({ disk, loading }: Props) {
  if (loading || !disk) {
    return (
      <div className="neo-border neo-shadow rounded-none bg-[var(--color-paper-2)] p-5">
        <div className="h-4 w-40 animate-pulse bg-black/20" />
        <div className="mt-4 h-5 w-full animate-pulse bg-black/15" />
        <div className="mt-3 h-4 w-56 animate-pulse bg-black/15" />
      </div>
    );
  }

  const usedPct = Math.min(
    100,
    Math.round((disk.usedBytes / disk.totalBytes) * 100),
  );

  return (
    <div className="neo-border neo-shadow rounded-none bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.15em] uppercase">
            Disk usage
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {formatBytes(disk.freeBytes)}{" "}
            <span className="text-base font-semibold opacity-60">free</span>
          </p>
        </div>
        <span className="neo-border bg-[var(--color-accent-2)] px-3 py-1 text-sm font-bold">
          {usedPct}% used
        </span>
      </div>

      <div
        className="neo-border mt-4 h-6 overflow-hidden bg-[var(--color-paper)]"
        role="meter"
        aria-valuenow={usedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Disk usage"
      >
        <div
          className="h-full bg-[var(--color-accent)] transition-[width] duration-500"
          style={{ width: `${usedPct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
        <span>{formatBytes(disk.usedBytes)} used</span>
        <span>{formatBytes(disk.freeBytes)} free</span>
        <span className="opacity-60">of {formatBytes(disk.totalBytes)}</span>
      </div>
    </div>
  );
}
