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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="neo-border neo-shadow w-full max-w-md bg-[var(--color-paper)] p-6">
        <h2 id="confirm-title" className="text-2xl font-bold tracking-tight">
          Move to Trash?
        </h2>
        <p className="mt-3 text-sm font-medium leading-relaxed">
          {itemCount} item{itemCount === 1 ? "" : "s"} (
          <strong>{formatBytes(totalBytes)}</strong>) will be moved to Trash.
          You can restore them from Trash if needed.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="neo-border neo-shadow-sm neo-press bg-white px-4 py-2 text-sm font-bold"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="neo-border neo-shadow-sm neo-press bg-[var(--color-danger)] px-4 py-2 text-sm font-bold text-white"
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
