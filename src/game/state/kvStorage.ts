/**
 * Saves go to the Cribl app-scoped KV store. Apps run in a sandboxed iframe
 * where localStorage, sessionStorage, IndexedDB and cookies are unavailable.
 *
 * The KV store belongs to the app, not to a user, so each signed-in Cribl
 * user gets their own key (`<name>/users/<id>`); otherwise everyone playing
 * would share one save. KV values are opaque text: GET returns what the last
 * PUT stored. The fetch proxy scopes `CRIBL_API_URL/kvstore/*` to this app and
 * handles auth.
 *
 * Outside Cribl (a plain `npm run dev` tab, or tests) there is no API URL, so
 * the game runs without saving.
 */

import type { StateStorage } from 'zustand/middleware';

const READ_TIMEOUT_MS = 5000;
/** Settings sliders change state many times a second; write once it settles. */
const WRITE_DELAY_MS = 600;

const apiUrl = () =>
  typeof window !== 'undefined' && typeof window.CRIBL_API_URL === 'string'
    ? window.CRIBL_API_URL
    : null;

const keyUrl = (base: string, key: string) =>
  `${base}/kvstore/${key.split('/').map(encodeURIComponent).join('/')}`;

/** The signed-in user's own key. Without user info (e.g. a local harness), one shared key. */
async function userKey(name: string): Promise<string> {
  try {
    const user = await window.getCriblUser?.();
    if (user?.id) return `${name}/users/${user.id}`;
  } catch {
    // Fall through to the shared key.
  }
  return name;
}

export function kvStorage(): StateStorage {
  // Writes stay off until a read has settled cleanly: if the first read fails,
  // saving defaults over a good save would lose the player's progress.
  let writable = false;
  let lastWritten: string | null = null;
  let pending: { name: string; value: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const keys = new Map<string, Promise<string>>();
  const keyFor = (name: string) => {
    let k = keys.get(name);
    if (!k) keys.set(name, (k = userKey(name)));
    return k;
  };

  const flush = async () => {
    const base = apiUrl();
    const job = pending;
    pending = null;
    if (!base || !job || job.value === lastWritten) return;
    try {
      const res = await fetch(keyUrl(base, await keyFor(job.name)), {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: job.value,
      });
      if (res.ok) lastWritten = job.value;
    } catch {
      // Offline or the platform refused: keep playing, try again on the next change.
    }
  };

  return {
    async getItem(name) {
      const base = apiUrl();
      if (!base) return null;
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), READ_TIMEOUT_MS);
      try {
        const res = await fetch(keyUrl(base, await keyFor(name)), { signal: ctrl.signal });
        if (res.status === 404) {
          writable = true;
          return null;
        }
        if (!res.ok) return null;
        const text = await res.text();
        writable = true;
        lastWritten = text;
        return text || null;
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
    setItem(name, value) {
      if (!writable || !apiUrl() || value === lastWritten) return;
      pending = { name, value };
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), WRITE_DELAY_MS);
    },
    removeItem() {
      // Never called: the game has no "delete save" action, and a KV DELETE on
      // this platform must be a confirmed user action.
    },
  };
}
