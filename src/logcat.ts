import type { Adb } from "@yume-chan/adb";
import { Logcat, AndroidLogPriority, AndroidLogPriorityToCharacter } from "@yume-chan/android-bin";
import type { AndroidLogEntry } from "@yume-chan/android-bin";

export { AndroidLogPriority };

export interface LogEntry {
    timestamp: Date;
    pid: number;
    tid: number;
    /** Single character: V D I W E F */
    level: string;
    priority: AndroidLogPriority;
    tag: string;
    message: string;
    raw: string;
}

export async function* streamLogcat(adb: Adb, signal: AbortSignal): AsyncGenerator<LogEntry> {
    const logcat = new Logcat(adb);
    const reader = logcat.binary().getReader();
    const cancel = () => void reader.cancel();

    signal.addEventListener("abort", cancel, { once: true });

    try {
        while (true) {
            let result: { done: true; value: undefined } | { done: false; value: AndroidLogEntry };
            try {
                result = await reader.read() as typeof result;
            } catch {
                break;
            }
            if (result.done) break;

            const v = result.value;
            const level = AndroidLogPriorityToCharacter[v.priority] ?? "?";
            const ts = new Date(v.seconds * 1000 + Math.floor(v.nanoseconds / 1_000_000));
            const raw = `${fmtDate(ts)} ${String(v.pid).padStart(6)} ${String(v.tid).padStart(6)} ${level} ${v.tag}: ${v.message}`;

            yield { timestamp: ts, pid: v.pid, tid: v.tid, level, priority: v.priority, tag: v.tag, message: v.message, raw };
        }
    } finally {
        signal.removeEventListener("abort", cancel);
        try { reader.releaseLock(); } catch { /* ignore */ }
    }
}

function fmtDate(d: Date): string {
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
