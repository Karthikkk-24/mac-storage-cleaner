import {
  CATEGORY_SECTION,
  formatBytes,
  type CategoryResult,
  type ScanItem,
} from "@msc/shared";
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
        setCategories(
          event.categories.map((c) => ({
            ...c,
            section: c.section ?? CATEGORY_SECTION[c.id],
          })),
        );
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
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-32 pt-8 sm:px-6">
      <header className="mb-8">
        <div className="neo-border neo-shadow inline-block bg-[var(--color-accent-2)] px-3 py-1 text-xs font-black tracking-[0.12em] uppercase">
          Local · Safe only
        </div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Mac Storage
          <br />
          Cleaner
        </h1>
        <p className="mt-3 max-w-lg text-sm font-medium leading-relaxed opacity-70">
          Find regenerable junk — including Simulator & Xcode caches — then move
          it to Trash. System files and personal folders stay untouched.
        </p>
      </header>

      {healthOk === false && (
        <div className="neo-border neo-shadow mb-6 bg-[var(--color-danger)] px-4 py-3 text-sm font-bold text-white">
          API unreachable or not on macOS. Start with{" "}
          <code className="bg-black/20 px-1">pnpm dev</code>.
        </div>
      )}

      <DiskMeter disk={disk} loading={diskLoading} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!scanning ? (
          <button
            type="button"
            onClick={startScan}
            disabled={healthOk === false}
            className="neo-border neo-shadow neo-press bg-[var(--color-accent)] px-5 py-3 text-sm font-black uppercase tracking-wide disabled:opacity-40"
          >
            Scan for junk
          </button>
        ) : (
          <button
            type="button"
            onClick={cancelScan}
            className="neo-border neo-shadow neo-press bg-white px-5 py-3 text-sm font-black uppercase tracking-wide"
          >
            Cancel scan
          </button>
        )}
        {scanning && (
          <span className="text-sm font-bold opacity-60">Scanning…</span>
        )}
        {scanError && (
          <span className="text-sm font-bold text-[var(--color-danger)]">
            {scanError}
          </span>
        )}
      </div>

      {(showFdaHelp || hasPermissionIssues) && (
        <div className="neo-border neo-shadow-sm mt-4 bg-[var(--color-paper-2)] px-4 py-3 text-sm font-medium">
          <p className="font-black">Full Disk Access may be required</p>
          <p className="mt-1 opacity-80">
            System Settings → Privacy & Security → Full Disk Access → enable for
            Terminal (or the app running Node). Then re-scan.
          </p>
        </div>
      )}

      <div className="mt-10">
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
        <div className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-black bg-[var(--color-paper)] px-4 py-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide opacity-60">
                {selected.size} selected
              </p>
              <p className="text-2xl font-bold tracking-tight">
                {formatBytes(selectedBytes)}
              </p>
            </div>
            <button
              type="button"
              className="neo-border neo-shadow neo-press bg-[var(--color-danger)] px-5 py-3 text-sm font-black uppercase tracking-wide text-white"
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
        <div className="neo-border neo-shadow fixed bottom-28 left-1/2 z-50 -translate-x-1/2 bg-[var(--color-ink)] px-5 py-2.5 text-sm font-bold text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
