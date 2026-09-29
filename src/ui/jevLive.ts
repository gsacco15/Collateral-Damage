// Ask the server for Jev's reading of the intelligence. Each reading is fetched once per page and shared by
// everything that needs it; the server and CDN cache it across visitors.
import { intelId, type IntelKey, type JevReply } from '../jev';

const cache = new Map<string, Promise<JevReply>>();

export function readIntel(key: IntelKey): Promise<JevReply> {
  const id = intelId(key);
  let p = cache.get(id);
  if (!p) {
    const q = new URLSearchParams({ target: key.target, hour: String(key.hour), day: key.day, watched: String(key.watched) });
    p = fetch(`/api/jev?${q}`, { signal: AbortSignal.timeout(12000) })
      .then(async (r) => {
        const ct = r.headers.get('content-type') ?? '';
        // No function here (e.g. the local dev server): Jev is offline, the built-in guess stands in.
        if (!ct.includes('application/json')) return { ok: false, reason: 'offline' } as JevReply;
        return (await r.json()) as JevReply;
      })
      .catch(() => ({ ok: false, reason: 'offline' }) as JevReply);
    cache.set(id, p);
    // Don't keep failures: try again next time.
    p.then((r) => {
      if (!r.ok) cache.delete(id);
    });
  }
  return p;
}
