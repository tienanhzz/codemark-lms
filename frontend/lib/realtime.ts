import { SOCKET_URL } from "./api";

type Listener = (...args: any[]) => void;

/** Event adapter for Spring's JSON WebSocket protocol; reconnects after outages. */
export class Socket {
  connected = false;
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private delay = 1000;
  constructor(url: string) { this.open(url); }
  private dispatch(event: string, data?: unknown) { this.listeners.get(event)?.forEach((listener) => listener(data)); }
  private open(base: string) {
    if (this.stopped) return;
    const url = new URL(base || window.location.origin);
    url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onmessage = (message) => {
      try {
        const frame = JSON.parse(String(message.data));
        if (frame.event === "connected") { this.connected = true; this.delay = 1000; this.dispatch("connect"); }
        this.dispatch(frame.event, frame.data);
      } catch { this.dispatch("error", { reason: "invalid_message" }); }
    };
    ws.onclose = (event) => {
      this.connected = false;
      this.dispatch("disconnect");
      if (event.code === 1008) { this.stopped = true; window.dispatchEvent(new Event("lms:unauthorized")); }
      if (!this.stopped) { this.retry = setTimeout(() => this.open(base), this.delay); this.delay = Math.min(this.delay * 2, 10000); }
    };
    ws.onerror = () => this.dispatch("connect_error");
  }
  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener); return this;
  }
  emit(event: string, data: unknown = {}) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event, data })); return this; }
  disconnect() { this.stopped = true; if (this.retry) clearTimeout(this.retry); this.ws?.close(); this.listeners.clear(); this.connected = false; }
}
export function io(url = SOCKET_URL, _options?: { withCredentials?: boolean }) { return new Socket(url); }
