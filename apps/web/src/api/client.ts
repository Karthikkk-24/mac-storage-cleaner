import type {
  CategoryResult,
  DeleteResponse,
  DiskInfo,
  EmptyTrashResponse,
  HealthResponse,
  ScanCompleteEvent,
  ScanEvent,
} from "@msc/shared";

const API = "/api";

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

export async function fetchDisk(): Promise<DiskInfo> {
  const res = await fetch(`${API}/disk`);
  if (!res.ok) throw new Error("Failed to load disk info");
  return res.json();
}

export function scanStream(
  onEvent: (event: ScanEvent) => void,
  categoryIds?: string[],
): { abort: () => void } {
  const params = new URLSearchParams();
  if (categoryIds?.length) {
    params.set("categories", categoryIds.join(","));
  }
  const url = `${API}/scan/stream${params.toString() ? `?${params}` : ""}`;
  const es = new EventSource(url);

  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data) as ScanEvent;
      onEvent(data);
      if (data.type === "complete" || data.type === "error") {
        es.close();
      }
    } catch {
      // ignore malformed
    }
  };

  es.onerror = () => {
    onEvent({ type: "error", message: "Scan connection lost" });
    es.close();
  };

  return {
    abort: () => es.close(),
  };
}

export async function scanOnce(): Promise<ScanCompleteEvent> {
  const res = await fetch(`${API}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Scan failed");
  return res.json();
}

export async function deleteItems(
  itemIds: string[],
  dryRun = false,
): Promise<DeleteResponse> {
  const res = await fetch(`${API}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds, dryRun }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err === "object" && err && "error" in err
        ? JSON.stringify(err.error)
        : "Delete failed",
    );
  }
  return res.json();
}

export async function emptyTrash(): Promise<EmptyTrashResponse> {
  const res = await fetch(`${API}/trash/empty`, { method: "POST" });
  if (!res.ok) throw new Error("Empty trash failed");
  return res.json();
}

export type { CategoryResult, DiskInfo, ScanEvent };
