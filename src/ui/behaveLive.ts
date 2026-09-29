// Ask the server how Jev reads the city's behaviour (Living only). Each answer is fetched once per page and cached
// by the server and CDN across visitors. Never waited on: the rules act at once, Jev's answer nudges them on arrival.
import { cityId, type AfterMood, type Behaviour, type CityKey, type DistrictId } from '../jev';

type CityReply = { ok: true; kind: 'city'; districts: Behaviour['districts'] } | { ok: false; reason: string };
type AfterReply = { ok: true; kind: 'after'; mood: AfterMood } | { ok: false; reason: string };

const cache = new Map<string, Promise<CityReply | AfterReply>>();

function ask<T extends CityReply | AfterReply>(id: string, q: URLSearchParams): Promise<T> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/api/behave?${q}`, { signal: AbortSignal.timeout(15000) })
      .then(async (r) => {
        // No function here (e.g. the local preview): Jev is offline, the rules stand alone.
        if (!(r.headers.get('content-type') ?? '').includes('application/json')) return { ok: false, reason: 'offline' } as T;
        return (await r.json()) as T;
      })
      .catch(() => ({ ok: false, reason: 'offline' }) as T);
    cache.set(id, p);
  }
  return p as Promise<T>;
}

export const readCityMood = (k: CityKey) => ask<CityReply>(`city|${cityId(k)}`, new URLSearchParams({ kind: 'city', hour: String(k.hour), day: k.day, events: k.events.join(',') }));

export const readAfterMood = (district: DistrictId, hour: number, day: string, sev: string) =>
  ask<AfterReply>(`after|${district}|${hour}|${day}|${sev}`, new URLSearchParams({ kind: 'after', district, hour: String(hour), day, sev }));
