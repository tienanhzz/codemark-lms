import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  handlers: new Map<string, (value?: unknown) => void>(),
  disconnect: vi.fn(),
  io: vi.fn(),
}));
vi.mock('socket.io-client', () => ({ io: fake.io }));

beforeEach(() => {
  vi.resetModules();
  fake.handlers.clear();
  fake.disconnect.mockReset();
  fake.io.mockReset().mockReturnValue({
    on: (event: string, handler: (value?: unknown) => void) => fake.handlers.set(event, handler),
    disconnect: fake.disconnect,
  });
  vi.stubEnv('NODE_ENV', 'production');
});
afterEach(() => vi.unstubAllEnvs());

describe('realtime recovery and privacy', () => {
  it('uses the same origin in production, including a loopback deployment', async () => {
    const { subscribeRealtime } = await import('../lib/realtime');
    const stop = subscribeRealtime({ onChange: vi.fn(), onStatus: vi.fn() });
    expect(fake.io).toHaveBeenCalledWith(window.location.origin, expect.objectContaining({
      path: '/socket.io', withCredentials: true,
    }));
    stop();
  });

  it('refetches authorized REST state after initial connection and reconnection', async () => {
    const { subscribeRealtime } = await import('../lib/realtime');
    const onChange = vi.fn(), onStatus = vi.fn();
    const stop = subscribeRealtime({ onChange, onStatus });
    expect(onStatus).toHaveBeenLastCalledWith(false);
    fake.handlers.get('connect')!();
    fake.handlers.get('disconnect')!();
    fake.handlers.get('connect')!();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenLastCalledWith(true);
    stop();
  });

  it('deduplicates at-least-once delivery and rejects malformed or private payloads', async () => {
    const { subscribeRealtime } = await import('../lib/realtime');
    const onChange = vi.fn();
    const stop = subscribeRealtime({ onChange, onStatus: vi.fn() });
    const event = { eventId: '00000000-0000-4000-8000-000000000001', eventType: 'state.changed' };
    const emit = fake.handlers.get('state.changed')!;
    emit(null);
    emit({ ...event, studentEmail: 'private@example.invalid' });
    emit({ ...event, eventId: 'invalid' });
    emit(event);
    emit(event);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    expect(fake.disconnect).toHaveBeenCalledOnce();
  });

  it('shares one socket and keeps it alive until the final subscriber leaves', async () => {
    const { subscribeRealtime } = await import('../lib/realtime');
    const a = subscribeRealtime({ onChange: vi.fn(), onStatus: vi.fn() });
    const b = subscribeRealtime({ onChange: vi.fn(), onStatus: vi.fn() });
    expect(fake.io).toHaveBeenCalledTimes(1);
    a();
    expect(fake.disconnect).not.toHaveBeenCalled();
    b();
    expect(fake.disconnect).toHaveBeenCalledOnce();
  });

  it('accepts server outbox invalidations and ignores duplicate deliveries', async () => {
    const { subscribeRealtime } = await import('../lib/realtime');
    const onChange = vi.fn();
    const stop = subscribeRealtime({ onChange, onStatus: vi.fn() });
    const emit = fake.handlers.get('state.changed')!;
    const event = { eventId: '00000000-0000-4000-8000-000000000002', action: 'course.updated', requestId: 'request-one' };
    emit({ ...event, studentEmail: 'private@example.invalid' });
    emit(event);
    emit(event);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });
});
