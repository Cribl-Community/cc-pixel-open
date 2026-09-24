import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kvStorage } from './kvStorage';

const API = 'https://cribl.test/api/v1';

/** A fake Cribl KV store behind `fetch`. */
function fakeKv(initial: Record<string, string> = {}, opts: { failReads?: boolean } = {}) {
  const store = new Map(Object.entries(initial));
  const calls: { method: string; url: string; body?: string }[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body as string | undefined });
    const key = decodeURIComponent(url.slice(`${API}/kvstore/`.length));
    if (method === 'GET') {
      if (opts.failReads) return new Response('boom', { status: 500 });
      const v = store.get(key);
      return v === undefined ? new Response('', { status: 404 }) : new Response(v);
    }
    if (method === 'PUT') {
      store.set(key, String(init?.body));
      return new Response('', { status: 200 });
    }
    return new Response('', { status: 405 });
  });
  return { store, calls, fetch };
}

describe('kvStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { CRIBL_API_URL: API });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads the save from the app KV store', async () => {
    const kv = fakeKv({ 'pixel-open-v1': '{"state":{"x":1},"version":2}' });
    vi.stubGlobal('fetch', kv.fetch);
    const s = kvStorage();
    expect(await s.getItem('pixel-open-v1')).toBe('{"state":{"x":1},"version":2}');
    expect(kv.calls[0]).toMatchObject({ method: 'GET', url: `${API}/kvstore/pixel-open-v1` });
  });

  it('coalesces rapid changes into one PUT and skips unchanged saves', async () => {
    const kv = fakeKv();
    vi.stubGlobal('fetch', kv.fetch);
    const s = kvStorage();
    expect(await s.getItem('save')).toBeNull();
    s.setItem('save', 'a');
    s.setItem('save', 'b');
    s.setItem('save', 'c');
    await vi.runAllTimersAsync();
    expect(kv.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    expect(kv.store.get('save')).toBe('c');
    s.setItem('save', 'c');
    await vi.runAllTimersAsync();
    expect(kv.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('never overwrites a save it could not read', async () => {
    const kv = fakeKv({ save: 'precious' }, { failReads: true });
    vi.stubGlobal('fetch', kv.fetch);
    const s = kvStorage();
    expect(await s.getItem('save')).toBeNull();
    s.setItem('save', 'defaults');
    await vi.runAllTimersAsync();
    expect(kv.calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(kv.store.get('save')).toBe('precious');
  });

  it('keeps a separate save for each signed-in user', async () => {
    vi.stubGlobal('window', {
      CRIBL_API_URL: API,
      getCriblUser: async () => ({ id: 'abrunner@cribl.io', username: 'abrunner' }),
    });
    const kv = fakeKv({ 'save/users/abrunner@cribl.io': 'mine', save: 'shared' });
    vi.stubGlobal('fetch', kv.fetch);
    const s = kvStorage();
    expect(await s.getItem('save')).toBe('mine');
    s.setItem('save', 'next');
    await vi.runAllTimersAsync();
    const put = kv.calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe(`${API}/kvstore/save/users/abrunner%40cribl.io`);
    expect(kv.store.get('save')).toBe('shared');
  });

  it('does nothing outside Cribl', async () => {
    vi.stubGlobal('window', {});
    const kv = fakeKv();
    vi.stubGlobal('fetch', kv.fetch);
    const s = kvStorage();
    expect(await s.getItem('save')).toBeNull();
    s.setItem('save', 'x');
    await vi.runAllTimersAsync();
    expect(kv.fetch).not.toHaveBeenCalled();
  });
});
