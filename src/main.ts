import "./style.css";
import { connectDevice, disconnectDevice } from "./adb.js";
import { streamLogcat } from "./logcat.js";
import { initUI, setConnected, setStatus, clearLog, appendEntry, getBuffer } from "./ui.js";
import type { Adb } from "@yume-chan/adb";

let adb: Adb | null = null;
let controller: AbortController | null = null;

initUI({
    onConnect: () => void connect(),
    onDisconnect: () => void disconnect(),
    onClear: clearLog,
    onSave: saveLog,
});

async function connect(): Promise<void> {
    try {
        setStatus("Connecting…");
        adb = await connectDevice();
        controller = new AbortController();
        setConnected(true);
        setStatus(`Connected — ${adb.serial}`);

        for await (const entry of streamLogcat(adb, controller.signal)) {
            appendEntry(entry);
        }

        // stream ended cleanly (disconnect was requested)
        setStatus("Disconnected");
        setConnected(false);
        adb = null;
        controller = null;
    } catch (e) {
        if (e instanceof DOMException && (e.name === "NotFoundError" || e.name === "AbortError")) {
            setStatus("Not connected");
        } else {
            setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
        }
        setConnected(false);
        adb = null;
        controller = null;
    }
}

async function disconnect(): Promise<void> {
    controller?.abort();
    if (adb) {
        await disconnectDevice(adb);
    }
}

function saveLog(): void {
    const buffer = getBuffer();
    if (buffer.length === 0) return;

    const text = buffer.map((e) => e.raw).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const ts = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-") + "_" + [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
    ].join("-");

    const a = document.createElement("a");
    a.href = url;
    a.download = `logcat_${ts}.log`;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
