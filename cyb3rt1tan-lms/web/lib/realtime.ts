import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

type Subscriber = { onChange: () => void; onStatus: (connected: boolean) => void };
const subscribers = new Set<Subscriber>();
let socket: Socket | null = null;
let connected = false;

function ensureSocket(): Socket {
  if (socket) return socket;
  const host = window.location.hostname;
  const origin =
    host === '127.0.0.1' || host === 'localhost'
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
  });
  socket.on('disconnect', () => {
    connected = false;
    subscribers.forEach((subscriber) => subscriber.onStatus(false));
  });
  socket.on('state.changed', () => subscribers.forEach((subscriber) => subscriber.onChange()));
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
    }
  };
}
