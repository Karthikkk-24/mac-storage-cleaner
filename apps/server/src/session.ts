import { createHash } from "node:crypto";
import type { CategoryId, ScanItem } from "@msc/shared";

export function itemIdForPath(filePath: string): string {
  return createHash("sha256").update(filePath).digest("hex").slice(0, 24);
}

export type RegisteredItem = ScanItem & { registeredAt: number };

export class ScanSession {
  readonly scanId: string;
  private readonly items = new Map<string, RegisteredItem>();

  constructor(scanId: string) {
    this.scanId = scanId;
  }

  register(item: ScanItem): void {
    this.items.set(item.id, { ...item, registeredAt: Date.now() });
  }

  registerMany(items: ScanItem[]): void {
    for (const item of items) this.register(item);
  }

  get(id: string): RegisteredItem | undefined {
    return this.items.get(id);
  }

  getMany(ids: string[]): RegisteredItem[] {
    return ids
      .map((id) => this.items.get(id))
      .filter((x): x is RegisteredItem => x !== undefined);
  }

  clearCategory(categoryId: CategoryId): void {
    for (const [id, item] of this.items) {
      if (item.categoryId === categoryId) this.items.delete(id);
    }
  }

  clear(): void {
    this.items.clear();
  }

  size(): number {
    return this.items.size;
  }
}

let currentSession: ScanSession | null = null;

export function getSession(): ScanSession | null {
  return currentSession;
}

export function startSession(scanId: string): ScanSession {
  currentSession = new ScanSession(scanId);
  return currentSession;
}

export function clearSession(): void {
  currentSession = null;
}
