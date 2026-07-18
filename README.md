# Mac Storage Cleaner

Local TypeScript app that scans **only safe, regenerable junk** on your Mac and lets you move selected items to Trash. Frontend is a React UI; backend is a Node.js Fastify server with filesystem access.

> **Not a cloud website.** Browsers cannot delete Mac files. Run the local server and open the UI at `http://localhost:5173`.

## Safety

**Allowlist-only.** Nothing is scanned or deleted unless it sits under a known safe root. Every delete is re-checked on the server; the client only sends item IDs from the last scan.

### Included (v1)

| Category | Typical location |
|----------|------------------|
| App caches | `~/Library/Caches/*` |
| User logs | `~/Library/Logs/*` |
| Temp files (7+ days old) | `$TMPDIR`, `/tmp` (your files only) |
| Trash | `~/.Trash/*` |
| npm / Yarn / pnpm caches | `~/.npm/_cacache`, Yarn & pnpm cache dirs |
| Homebrew / pip caches | `~/Library/Caches/Homebrew`, `pip` |
| Chrome / Safari caches | Cache dirs only (not cookies/profiles) |
| Xcode DerivedData | `~/Library/Developer/Xcode/DerivedData` |
| iOS Simulator caches | `~/Library/Developer/CoreSimulator/Caches` |
| Simulator logs | `~/Library/Logs/CoreSimulator` |
| iOS / watchOS DeviceSupport | `~/Library/Developer/Xcode/* DeviceSupport` |
| Installers & executables | `~/Downloads`, `~/Desktop` — `.dmg`, `.pkg`, `.exe`, `.msi`, `.iso`, `.apk`, `.ipa`, `.app`, and extensionless `+x` binaries |

Results are grouped in the UI under **System & app junk**, **Simulator & Xcode**, and **Installers & executables** (review before deleting).

Only matching installer/executable names are deletable under Downloads/Desktop — PDFs, photos, and other documents stay denied.

### Never touched

- `/System`, `/usr`, `/bin`, `/sbin`, `/Library`, `/Applications`
- `~/Documents`, `~/Desktop`, `~/Downloads`, `~/Pictures`, `~/Movies`, `~/Music`
- `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.config`
- Symlinks that escape allowlisted roots
- Anything not owned by your user (in temp dirs)

Deletes **move to Trash** by default (recoverable). Empty Trash is a separate, explicit action.

## Requirements

- macOS
- Node.js 20+
- [pnpm](https://pnpm.io/) 10+

### Full Disk Access (optional but recommended)

Some folders under `~/Library` need **Full Disk Access**:

1. System Settings → Privacy & Security → Full Disk Access  
2. Enable access for **Terminal** (or iTerm / the app that runs Node)  
3. Re-run the scan

## Quick start

```bash
pnpm install
pnpm --filter @msc/shared build
pnpm dev
```

- API: `http://127.0.0.1:8787`
- UI: `http://localhost:5173` (proxies `/api` to the server)

Then click **Scan for junk**, select categories/items, and **Delete selected**.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start API + Vite UI |
| `pnpm build` | Build shared, server, and web |
| `pnpm test` | Run safety unit tests |
| `pnpm start` | Run compiled server only |

## Architecture

```
apps/server   Fastify API — scan, safety guard, move-to-Trash
apps/web      Vite + React + Tailwind UI
packages/shared   Zod schemas & shared types
```

Scan results live in an in-memory session; delete requests use item IDs from that session only.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Platform check |
| `GET` | `/api/disk` | Free / used / total |
| `GET` | `/api/scan/stream` | SSE scan progress + complete |
| `POST` | `/api/scan` | Non-streaming full scan |
| `POST` | `/api/delete` | `{ itemIds, dryRun? }` → Trash |
| `POST` | `/api/trash/empty` | Permanently empty Trash |

## License

MIT
