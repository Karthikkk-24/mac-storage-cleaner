import { formatBytes, type DiskInfo } from "@msc/shared";

type Props = {
  disk: DiskInfo | null;
  loading?: boolean;
};

export function DiskMeter({ disk, loading }: Props) {
  if (loading || !disk) {
    return (
      <div className="rounded-2xl bg-white/60 p-6 shadow-sm ring-1 ring-black/5 backdrop-blur">
        <div className="h-4 w-40 animate-pulse rounded bg-black/10" />
        <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-black/10" />
        <div className="mt-3 h-4 w-56 animate-pulse rounded bg-black/10" />
      </div>
    );
  }

  const usedPct = Math.min(
    100,
    Math.round((disk.usedBytes / disk.totalBytes) * 100),
  );
  const freePct = 100 - usedPct;

  return (
    <div className="rounded-2xl bg-white/70 p-6 shadow-sm ring-1 ring-black/5 backdrop-blur">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium tracking-wide text-[var(--color-ink-muted)] uppercase">
          Macintosh HD
        </p>
        <p className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)]">
          {formatBytes(disk.freeBytes)}{" "}
          <span className="text-lg text-[var(--color-ink-muted)]">free</span>
        </p>
      </div>

      <div
        className="mt-5 h-3.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
        role="meter"
        aria-valuenow={usedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Disk usage"
      >
        <div
          className="h-full rounded-full bg-[var(--color-meter-used)] transition-[width] duration-700 ease-out"
          style={{ width: `${usedPct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--color-ink-muted)]">
        <span>
          <span className="font-medium text-[var(--color-ink)]">
            {formatBytes(disk.usedBytes)}
          </span>{" "}
          used ({usedPct}%)
        </span>
        <span>
          <span className="font-medium text-[var(--color-accent)]">
            {formatBytes(disk.freeBytes)}
          </span>{" "}
          free ({freePct}%)
        </span>
        <span>of {formatBytes(disk.totalBytes)}</span>
      </div>
    </div>
  );
}
