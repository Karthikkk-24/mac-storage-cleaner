import { formatBytes, type CategoryResult, type ScanItem } from "@msc/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteItems,
  fetchDisk,
  fetchHealth,
  scanStream,
  type DiskInfo,
} from "./api/client";
import { CategoryList } from "./components/CategoryList";
import { ConfirmModal } from "./components/ConfirmModal";
import { DiskMeter } from "./components/DiskMeter";

type ProgressMap = Record<
  string,
  { bytesFound: number; itemCount: number; status: string; label?: string }
>;

export default function App() {
  const [disk, setDisk] = useState<DiskInfo | null>(null);
  const [diskLoading, setDiskLoading] = useState(true);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<CategoryResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [scanError, setScanError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showFdaHelp, setShowFdaHelp] = useState(false);
  const abortRef = useRef<{ abort: () => void } | null>(null);

  const refreshDisk = useCallback(async () => {
    setDiskLoading(true);
    try {
      const d = await fetchDisk();
      setDisk(d);
    } catch {
      setDisk(null);
    } finally {
      setDiskLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth()
      .then((h) => setHealthOk(h.ok && h.darwin))
      .catch(() => setHealthOk(false));
    refreshDisk();
  }, [refreshDisk]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const itemMap = useMemo(() => {
    const map = new Map<string, ScanItem>();
    for (const cat of categories) {
      for (const item of cat.items) map.set(item.id, item);
    }
    return map;
  }, [categories]);

  const selectedBytes = useMemo(() => {
    let total = 0;
    for (const id of selected) {
      total += itemMap.get(id)?.sizeBytes ?? 0;
    }
    return total;
  }, [selected, itemMap]);

  const hasPermissionIssues = categories.some((c) => c.permissionDenied);

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(category: CategoryResult, select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of category.items) {
        if (select) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  function startScan() {
    abortRef.current?.abort();
    setScanning(true);
    setScanError(null);
    setCategories([]);
    setSelected(new Set());
    setProgress({});
    setShowFdaHelp(false);

    abortRef.current = scanStream((event) => {
      if (event.type === "progress") {
        setProgress((prev) => ({
          ...prev,
          [event.categoryId]: {
            bytesFound: event.bytesFound,
            itemCount: event.itemCount,
            status: event.status,
            label: event.label,
          },
        }));
      } else if (event.type === "complete") {
        setCategories(event.categories);
        setScanning(false);
        setShowFdaHelp(event.categories.some((c) => c.permissionDenied));
        refreshDisk();
      } else if (event.type === "error") {
        setScanError(event.message);
        setScanning(false);
      }
    });
  }

  function cancelScan() {
    abortRef.current?.abort();
    setScanning(false);
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      const ids = [...selected];
      const result = await deleteItems(ids, false);
      const okCount = result.results.filter((r) => r.ok).length;
      const failCount = result.results.length - okCount;
      setToast(
        failCount === 0
          ? `Moved ${okCount} item(s) to Trash · ${formatBytes(result.totalBytesFreed)}`
          : `Moved ${okCount}, failed ${failCount} · ${formatBytes(result.totalBytesFreed)} freed`,
      );
      setConfirmOpen(false);
      setSelected(new Set());
      // Remove deleted items from UI
      const deletedIds = new Set(
        result.results.filter((r) => r.ok).map((r) => r.id),
      );
      setCategories((prev) =>
        prev.map((cat) => {
          const items = cat.items.filter((i) => !deletedIds.has(i.id));
          return {
            ...cat,
            items,
            itemCount: items.length,
            totalBytes: items.reduce((s, i) => s + i.sizeBytes, 0),
          };
        }),
      );
      await refreshDisk();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-28 pt-10 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-medium tracking-[0.2em] text-[var(--color-accent)] uppercase">
          Local · Safe categories only
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl tracking-tight sm:text-5xl">
          Mac Storage Cleaner
        </h1>
        <p className="mt-3 max-w-xl text-[var(--color-ink-muted)]">
          Find regenerable caches, logs, and temp files — then move them to
          Trash. System files and personal folders are never touched.
        </p>
      </header>

      {healthOk === false && (
        <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--color-danger)] ring-1 ring-red-200">
          API unreachable or not running on macOS. Start the server with{" "}
          <code className="rounded bg-black/5 px-1">pnpm dev</code>.
        </div>
      )}

      <DiskMeter disk={disk} loading={diskLoading} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!scanning ? (
          <button
            type="button"
            onClick={startScan}
            disabled={healthOk === false}
            className="rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            Scan for junk
          </button>
        ) : (
          <button
            type="button"
            onClick={cancelScan}
            className="rounded-xl bg-[var(--color-ink)] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Cancel scan
          </button>
        )}
        {scanning && (
          <span className="text-sm text-[var(--color-ink-muted)]">
            Scanning safe categories…
          </span>
        )}
        {scanError && (
          <span className="text-sm text-[var(--color-danger)]">{scanError}</span>
        )}
      </div>

      {(showFdaHelp || hasPermissionIssues) && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-[var(--color-warn)]">
          <p className="font-semibold">Full Disk Access may be required</p>
          <p className="mt-1">
            System Settings → Privacy & Security → Full Disk Access → enable for
            Terminal (or the app running Node). Then re-scan.
          </p>
        </div>
      )}

      <div className="mt-8">
        <CategoryList
          categories={categories}
          selected={selected}
          onToggleItem={toggleItem}
          onToggleCategory={toggleCategory}
          scanning={scanning}
          progress={progress}
        />
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-[var(--color-surface)]/95 px-4 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {selected.size} selected
              </p>
              <p className="font-[family-name:var(--font-display)] text-2xl">
                {formatBytes(selectedBytes)}
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-[var(--color-danger)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
              onClick={() => setConfirmOpen(true)}
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        itemCount={selected.size}
        totalBytes={selectedBytes}
        deleting={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
