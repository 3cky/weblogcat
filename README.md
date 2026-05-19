# WebLogcat

Minimalistic browser-based Android logcat viewer. Streams device logs over **WebUSB** — no ADB binary or USB drivers required.

Try it out at https://3cky.github.io/weblogcat/

**Requires Chrome or Edge** (WebUSB is Chromium-only).

## Usage

1. Enable **USB debugging** on your Android device
2. Open the app and click **Connect** — select your device from the browser's USB picker
3. Accept the ADB authorization prompt on the device (once per browser)
4. Logs stream in real time

### Filters

| Control | Behavior |
|---|---|
| Level buttons (V D I W E F) | Click to set minimum level; click again to reset to Verbose |
| Tag | Case-insensitive substring match — hides non-matching rows |
| Search | Highlights matching text in messages; does not hide rows |

**Save** downloads the current buffer as `logcat_YYYY-MM-DD_HH-MM-SS.log`.  
Buffer holds the last 10 000 entries.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## Docker

```bash
docker compose up -d   # http://localhost:8555
```

## Credits

ADB protocol implementation by [yume-chan/ya-webadb](https://github.com/yume-chan/ya-webadb).
