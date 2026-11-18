import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

type Subscriber = { onChange: () => void; onStatus: (connected: boolean) => void };
const subscribers = new Set<Subscriber>();
let socket: Socket | null = null;
let connected = false;
const seenEvents = new Set<string>();

function ensureSocket(): Socket {
  if (socket) return socket;
  const host = window.location.hostname;
  const origin =
    process.env.NODE_ENV === 'development' && (host === '127.0.0.1' || host === 'localhost')
      ? `${window.location.protocol}//${host}:8100`
      : window.location.origin;
  socket = io(origin, {
    path: '/socket.io',
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 5000,
  });
  socket.on('connect', () => {
    connected = true;
    subscribers.forEach((subscriber) => subscriber.onStatus(true));
    subscribers.forEach((subscriber) => subscriber.onChange());
  });
  socket.on('disconnect', () => {
    connected = false;
    subscribers.forEach((subscriber) => subscriber.onStatus(false));
  });
  socket.on('state.changed', (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    const event = payload as Record<string, unknown>;
    const keys = Object.keys(event);
    const validHint = (keys.length === 2 && event.eventType === 'state.changed' &&
        keys.every((key) => ['eventId', 'eventType'].includes(key))) ||
      (keys.length === 3 && typeof event.action === 'string' && typeof event.requestId === 'string' &&
        keys.every((key) => ['eventId', 'action', 'requestId'].includes(key)));
    if (!validHint || typeof event.eventId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.eventId) ||
        seenEvents.has(event.eventId)) return;
    seenEvents.add(event.eventId);
    if (seenEvents.size > 1000) seenEvents.delete(seenEvents.values().next().value!);
    subscribers.forEach((subscriber) => subscriber.onChange());
  });
  return socket;
}

export function subscribeRealtime(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  ensureSocket();
  subscriber.onStatus(connected);
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && socket) {
      socket.disconnect();
      socket = null;
      connected = false;
      seenEvents.clear();
    }
  };
}
