import { formatBytes } from "@msc/shared";

type Props = {
  open: boolean;
  itemCount: number;
  totalBytes: number;
  deleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  itemCount,
  totalBytes,
  deleting,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] p-6 shadow-xl ring-1 ring-black/10">
        <h2
          id="confirm-title"
          className="font-[family-name:var(--font-display)] text-2xl"
        >
          Move to Trash?
        </h2>
        <p className="mt-3 text-[var(--color-ink-muted)]">
          {itemCount} item{itemCount === 1 ? "" : "s"} (
          <strong className="text-[var(--color-ink)]">
            {formatBytes(totalBytes)}
          </strong>
          ) will be moved to Trash. You can restore them from Trash if needed.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-ink-muted)] hover:bg-black/5"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Moving…" : "Move to Trash"}
          </button>
        </div>
      </div>
    </div>
  );
}
