# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server at http://localhost:5173
npm run build    # tsc type-check then Vite production build → dist/
npm run preview  # serve dist/ locally

npx tsc --noEmit # type-check only (no emit)

docker compose up -d   # build image and serve on http://localhost:8555
docker build -t weblogcat .
```

There are no tests.

## Architecture

This is a **pure browser app** — no backend. It streams Android logcat over **WebUSB** directly from the browser using the [ya-webadb](https://github.com/yume-chan/ya-webadb) library, so no `adb` binary is required.

**Data flow:**

```
WebUSB (USB cable)
  → AdbDaemonWebUsbDeviceManager   (adb-daemon-webusb)
  → AdbDaemonTransport.authenticate (RSA handshake)
  → Adb instance
  → Logcat.binary()                 (spawns `logcat -B` as subprocess)
  → ReadableStream<AndroidLogEntry>
  → streamLogcat() async generator  (logcat.ts)
  → appendEntry()                   (ui.ts)
  → RAF-batched DOM rows in #log-pane
```

**Source modules (`src/`):**

| File | Responsibility |
|---|---|
| `adb.ts` | Device picker, RSA auth, connect/disconnect. RSA-2048 key pairs generated with Web Crypto API and persisted in `localStorage` under key `weblogcat:adb-keys`. |
| `logcat.ts` | `streamLogcat(adb, signal)` — async generator that reads `Logcat.binary()` and yields `LogEntry` objects. Cancelled via `AbortSignal`. |
| `ui.ts` | All DOM state: 10 000-entry ring buffer, `requestAnimationFrame` draw batching, filter/search/level logic, re-render on filter change (`rebuildLog`). Module-level mutable state (no framework). |
| `main.ts` | Entry point. Wires `UIHandlers` to `connect`/`disconnect`/`saveLog`. Owns the `AbortController` and `Adb` instance. |

**Key constraints:**
- WebUSB requires a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts): `localhost` works in dev; production deployments need HTTPS.
- WebUSB only works in Chromium-based browsers (Chrome, Edge). Firefox and Safari do not support it.
- The ya-webadb packages use TypeScript variance annotations incompatible with strict TS 5.x checking — `"skipLibCheck": true` is set in `tsconfig.json` to work around this.

**Filtering logic (ui.ts):**
- Level filter: `minPriority` threshold — clicking a level button sets it; clicking the active button resets to `Verbose` (show all).
- Tag filter: case-insensitive substring match on `entry.tag`; hides non-matching rows.
- Search: case-insensitive highlight via `<mark>` in `entry.message`; does not hide rows.
- All three filters are applied together. Filter changes trigger `rebuildLog()` which clears and re-renders the entire buffer as a `DocumentFragment`.

**Docker:** Multi-stage — `node:22-alpine` builds, `nginx:alpine` serves. nginx config at `nginx.conf` sets 1-year immutable cache on Vite's content-hashed assets.
