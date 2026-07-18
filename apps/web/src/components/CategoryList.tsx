import {
  CATEGORY_SECTION,
  SECTION_META,
  formatBytes,
  type CategoryResult,
  type CategorySection,
  type ScanItem,
} from "@msc/shared";
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

const SECTION_ORDER: CategorySection[] = [
  "general",
  "developer",
  "installers",
];

const SECTION_COLORS: Record<CategorySection, string> = {
  general: "bg-[var(--color-accent-3)]",
  developer: "bg-[var(--color-accent)]",
  installers: "bg-[var(--color-paper-2)]",
};

function CategorySectionBlock({
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
  const allSelected = itemIds.length > 0 && selectedCount === itemIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <section className="neo-border overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-3 py-3">
        <input
          type="checkbox"
          className="size-5 accent-[var(--color-ink)]"
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
          <span className="truncate font-bold">{category.label}</span>
          <span className="shrink-0 text-sm font-semibold">
            {formatBytes(category.totalBytes)}
            {category.itemCount > 0 ? ` · ${category.itemCount}` : ""}
            <span className="ml-2 inline-block font-black">
              {open ? "▾" : "▸"}
            </span>
          </span>
        </button>
      </div>

      {category.permissionDenied && (
        <p className="border-t-[3px] border-black bg-[var(--color-paper-2)] px-3 py-2 text-sm font-medium">
          Permission denied. Grant Full Disk Access in System Settings → Privacy
          & Security.
        </p>
      )}

      {category.error && !category.permissionDenied && (
        <p className="border-t-[3px] border-black bg-[var(--color-danger)]/15 px-3 py-2 text-sm font-medium">
          {category.error}
        </p>
      )}

      {open && category.items.length > 0 && (
        <ul className="max-h-64 overflow-y-auto border-t-[3px] border-black">
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
        <p className="border-t-[3px] border-black px-3 py-3 text-sm font-medium opacity-60">
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
    <li className="flex items-center gap-3 border-b border-black/15 px-3 py-2.5 last:border-b-0 hover:bg-[var(--color-paper)]">
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-[var(--color-ink)]"
        checked={checked}
        onChange={onToggle}
        aria-label={item.displayName}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{item.displayName}</p>
        <p className="truncate text-xs opacity-55" title={item.path}>
          {item.path}
        </p>
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums">
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
            className="neo-border flex items-center justify-between bg-white px-4 py-3 text-sm font-bold"
          >
            <span>{p.label ?? id}</span>
            <span className="opacity-60">
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
      <div className="neo-border neo-shadow bg-white px-6 py-10 text-center">
        <p className="text-2xl font-bold tracking-tight">Ready to scan</p>
        <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-relaxed opacity-70">
          Only safe caches, logs, temp files, Simulator/Xcode junk, and
          regenerable build data — never Documents, Downloads, or system files.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {SECTION_ORDER.map((sectionId) => {
        const sectionCats = categories
          .filter(
            (c) => (c.section ?? CATEGORY_SECTION[c.id]) === sectionId,
          )
          .sort((a, b) => b.totalBytes - a.totalBytes);

        if (sectionCats.length === 0) return null;

        const sectionBytes = sectionCats.reduce(
          (s, c) => s + c.totalBytes,
          0,
        );
        const meta = SECTION_META[sectionId];

        return (
          <div key={sectionId}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`neo-border px-2 py-0.5 text-xs font-black uppercase tracking-wide ${SECTION_COLORS[sectionId]}`}
                  >
                    {sectionId === "developer"
                      ? "Dev"
                      : sectionId === "installers"
                        ? "Review"
                        : "General"}
                  </span>
                  <h2 className="text-xl font-bold tracking-tight">
                    {meta.title}
                  </h2>
                </div>
                <p className="mt-1 max-w-xl text-sm font-medium opacity-65">
                  {meta.description}
                </p>
              </div>
              <span className="neo-border bg-white px-2 py-1 text-sm font-bold">
                {formatBytes(sectionBytes)}
              </span>
            </div>
            <div className="space-y-2">
              {sectionCats.map((cat) => (
                <CategorySectionBlock
                  key={cat.id}
                  category={cat}
                  selected={selected}
                  onToggleItem={onToggleItem}
                  onToggleCategory={onToggleCategory}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
