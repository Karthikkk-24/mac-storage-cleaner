import { formatBytes, type CategoryResult, type ScanItem } from "@msc/shared";
import { useState } from "react";

type Props = {
  categories: CategoryResult[];
  selected: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleCategory: (category: CategoryResult, select: boolean) => void;
  scanning?: boolean;
  progress?: Record<
    string,
    { bytesFound: number; itemCount: number; status: string; label?: string }
  >;
};

function CategorySection({
  category,
  selected,
  onToggleItem,
  onToggleCategory,
}: {
  category: CategoryResult;
  selected: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleCategory: (category: CategoryResult, select: boolean) => void;
}) {
  const [open, setOpen] = useState(category.totalBytes > 0);
  const itemIds = category.items.map((i) => i.id);
  const selectedCount = itemIds.filter((id) => selected.has(id)).length;
  const allSelected =
    itemIds.length > 0 && selectedCount === itemIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <section className="overflow-hidden rounded-xl bg-white/75 ring-1 ring-black/5 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-accent)]"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          disabled={itemIds.length === 0}
          onChange={() => onToggleCategory(category, !allSelected)}
          aria-label={`Select all in ${category.label}`}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="truncate font-medium">{category.label}</span>
          <span className="shrink-0 text-sm text-[var(--color-ink-muted)]">
            {formatBytes(category.totalBytes)}
            {category.itemCount > 0 ? ` · ${category.itemCount}` : ""}
            <span className="ml-2 inline-block transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>
              ›
            </span>
          </span>
        </button>
      </div>

      {category.permissionDenied && (
        <p className="border-t border-black/5 bg-amber-50 px-4 py-2 text-sm text-[var(--color-warn)]">
          Permission denied for some paths. Grant Full Disk Access to Terminal
          (or your Node process) in System Settings → Privacy & Security.
        </p>
      )}

      {category.error && !category.permissionDenied && (
        <p className="border-t border-black/5 px-4 py-2 text-sm text-[var(--color-danger)]">
          {category.error}
        </p>
      )}

      {open && category.items.length > 0 && (
        <ul className="max-h-64 overflow-y-auto border-t border-black/5">
          {category.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              checked={selected.has(item.id)}
              onToggle={() => onToggleItem(item.id)}
            />
          ))}
        </ul>
      )}

      {open && category.items.length === 0 && !category.error && (
        <p className="border-t border-black/5 px-4 py-3 text-sm text-[var(--color-ink-muted)]">
          Nothing found
        </p>
      )}
    </section>
  );
}

function ItemRow({
  item,
  checked,
  onToggle,
}: {
  item: ScanItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.03]">
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-[var(--color-accent)]"
        checked={checked}
        onChange={onToggle}
        aria-label={item.displayName}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.displayName}</p>
        <p className="truncate text-xs text-[var(--color-ink-muted)]" title={item.path}>
          {item.path}
        </p>
      </div>
      <span className="shrink-0 text-sm tabular-nums text-[var(--color-ink-muted)]">
        {formatBytes(item.sizeBytes)}
      </span>
    </li>
  );
}

export function CategoryList({
  categories,
  selected,
  onToggleItem,
  onToggleCategory,
  scanning,
  progress,
}: Props) {
  if (categories.length === 0 && scanning && progress) {
    return (
      <div className="space-y-2">
        {Object.entries(progress).map(([id, p]) => (
          <div
            key={id}
            className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3 text-sm ring-1 ring-black/5"
          >
            <span className="font-medium">
              {"label" in p && p.label ? String(p.label) : id}
            </span>
            <span className="text-[var(--color-ink-muted)]">
              {p.status === "scanning"
                ? `${formatBytes(p.bytesFound)}…`
                : p.status}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-xl bg-white/50 px-6 py-12 text-center ring-1 ring-black/5">
        <p className="font-[family-name:var(--font-display)] text-2xl">
          Ready to scan
        </p>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Only safe caches, logs, temp files, and regenerable build data are
          included — never Documents, Downloads, or system files.
        </p>
      </div>
    );
  }

  const sorted = [...categories].sort((a, b) => b.totalBytes - a.totalBytes);

  return (
    <div className="space-y-2">
      {sorted.map((cat) => (
        <CategorySection
          key={cat.id}
          category={cat}
          selected={selected}
          onToggleItem={onToggleItem}
          onToggleCategory={onToggleCategory}
        />
      ))}
    </div>
  );
}
