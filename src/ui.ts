import type { LogEntry } from "./logcat.js";
import { AndroidLogPriority } from "./logcat.js";

const BUFFER_MAX = 10_000;

const LEVEL_COLORS: Record<string, string> = {
    V: "var(--c-v)", D: "var(--c-d)", I: "var(--c-i)",
    W: "var(--c-w)", E: "var(--c-e)", F: "var(--c-f)",
};

export interface UIHandlers {
    onConnect(): void;
    onDisconnect(): void;
    onClear(): void;
    onSave(): void;
}

interface State {
    minPriority: AndroidLogPriority;
    tagFilter: string;
    searchText: string;
    autoScroll: boolean;
    buffer: LogEntry[];
    raf: number | null;
    pendingEntries: LogEntry[];
}

let state: State;
let logPane: HTMLElement;
let countEl: HTMLElement;
let statusEl: HTMLElement;
let btnConnect: HTMLButtonElement;
let btnDisconnect: HTMLButtonElement;
let btnSave: HTMLButtonElement;
let btnAutoscroll: HTMLButtonElement;

export function initUI(handlers: UIHandlers): void {
    logPane = document.getElementById("log-pane")!;
    countEl = document.getElementById("entry-count")!;
    statusEl = document.getElementById("status")!;
    btnConnect = document.getElementById("btn-connect") as HTMLButtonElement;
    btnDisconnect = document.getElementById("btn-disconnect") as HTMLButtonElement;
    btnSave = document.getElementById("btn-save") as HTMLButtonElement;
    btnAutoscroll = document.getElementById("btn-autoscroll") as HTMLButtonElement;

    state = {
        minPriority: AndroidLogPriority.Verbose,
        tagFilter: "",
        searchText: "",
        autoScroll: true,
        buffer: [],
        raf: null,
        pendingEntries: [],
    };

    btnConnect.addEventListener("click", handlers.onConnect);
    btnDisconnect.addEventListener("click", handlers.onDisconnect);
    document.getElementById("btn-clear")!.addEventListener("click", handlers.onClear);
    btnSave.addEventListener("click", handlers.onSave);

    btnAutoscroll.addEventListener("click", () => {
        state.autoScroll = !state.autoScroll;
        btnAutoscroll.classList.toggle("active", state.autoScroll);
        if (state.autoScroll) scrollToBottom();
    });

    logPane.addEventListener("scroll", () => {
        const atBottom = logPane.scrollHeight - logPane.scrollTop - logPane.clientHeight < 80;
        if (!atBottom && state.autoScroll) {
            state.autoScroll = false;
            btnAutoscroll.classList.remove("active");
        }
    });

    const tagInput = document.getElementById("tag-filter") as HTMLInputElement;
    tagInput.addEventListener("input", () => {
        state.tagFilter = tagInput.value.trim().toLowerCase();
        rebuildLog();
    });

    const searchInput = document.getElementById("search-input") as HTMLInputElement;
    searchInput.addEventListener("input", () => {
        state.searchText = searchInput.value;
        rebuildLog();
    });

    document.getElementById("level-btns")!.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest(".lvl-btn") as HTMLButtonElement | null;
        if (!btn) return;
        const p = Number(btn.dataset.priority) as AndroidLogPriority;
        state.minPriority = state.minPriority === p ? AndroidLogPriority.Verbose : p;
        updateLevelButtons();
        rebuildLog();
    });
}

export function setConnected(connected: boolean): void {
    btnConnect.disabled = connected;
    btnDisconnect.disabled = !connected;
    btnSave.disabled = !connected && state.buffer.length === 0;
}

export function setStatus(text: string): void {
    statusEl.textContent = text;
}

export function clearLog(): void {
    state.buffer = [];
    state.pendingEntries = [];
    if (state.raf !== null) { cancelAnimationFrame(state.raf); state.raf = null; }
    logPane.textContent = "";
    updateCount();
    btnSave.disabled = true;
}

export function getBuffer(): LogEntry[] {
    return state.buffer;
}

export function appendEntry(entry: LogEntry): void {
    state.buffer.push(entry);
    if (state.buffer.length > BUFFER_MAX) state.buffer.shift();

    if (passes(entry)) {
        state.pendingEntries.push(entry);
        scheduleDraw();
    }
    updateCount();
    btnSave.disabled = false;
}

function scheduleDraw(): void {
    if (state.raf !== null) return;
    state.raf = requestAnimationFrame(flushPending);
}

function flushPending(): void {
    state.raf = null;
    if (state.pendingEntries.length === 0) return;

    const frag = document.createDocumentFragment();
    for (const entry of state.pendingEntries) {
        frag.appendChild(buildRow(entry));
    }
    state.pendingEntries = [];

    // Trim DOM to BUFFER_MAX nodes
    while (logPane.childElementCount > BUFFER_MAX) {
        logPane.firstElementChild!.remove();
    }

    logPane.appendChild(frag);
    if (state.autoScroll) scrollToBottom();
}

function rebuildLog(): void {
    const frag = document.createDocumentFragment();
    for (const entry of state.buffer) {
        if (passes(entry)) frag.appendChild(buildRow(entry));
    }
    logPane.textContent = "";
    logPane.appendChild(frag);
    if (state.autoScroll) scrollToBottom();
}

function passes(entry: LogEntry): boolean {
    if (entry.priority < state.minPriority) return false;
    if (state.tagFilter && !entry.tag.toLowerCase().includes(state.tagFilter)) return false;
    return true;
}

function buildRow(entry: LogEntry): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "entry";
    row.dataset.level = entry.level;
    row.style.setProperty("--lc", LEVEL_COLORS[entry.level] ?? "var(--c-v)");

    const ts = span("ts", entry.raw.slice(0, 18));
    const pids = span("pids", `${String(entry.pid).padStart(6)} ${String(entry.tid).padStart(6)}`);
    const lvl = span("lvl", entry.level);
    const tag = span("tag", entry.tag);
    const sep = span("sep", ": ");
    const msg = span("msg", "");

    if (state.searchText) {
        msg.appendChild(highlighted(entry.message, state.searchText));
    } else {
        msg.textContent = entry.message;
    }

    row.append(ts, pids, lvl, tag, sep, msg);
    return row;
}

function span(cls: string, text: string): HTMLSpanElement {
    const el = document.createElement("span");
    el.className = cls;
    el.textContent = text;
    return el;
}

function highlighted(text: string, search: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const re = new RegExp(escRe(search), "gi");
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const mark = document.createElement("mark");
        mark.textContent = m[0];
        frag.appendChild(mark);
        last = re.lastIndex;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
}

function escRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateLevelButtons(): void {
    document.querySelectorAll(".lvl-btn").forEach((btn) => {
        const p = Number((btn as HTMLElement).dataset.priority) as AndroidLogPriority;
        btn.classList.toggle("below", p < state.minPriority);
        btn.classList.toggle("selected", p === state.minPriority);
    });
}

function updateCount(): void {
    countEl.textContent = `${state.buffer.length.toLocaleString()} entries`;
}

function scrollToBottom(): void {
    logPane.scrollTop = logPane.scrollHeight;
}
