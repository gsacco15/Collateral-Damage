// Asks Jev (TypeSafe) how the city's people are behaving: each district this hour, or the area round a strike.
// The API key stays here on the server. The page can only name an hour, a day and bucketed events (or a strike's
// district, hour and size): this function builds the question itself, so the endpoint can't be used to send Jev
// anything else. Answers are cached by Vercel's CDN, so each distinct question is paid for once, not once per visitor.
import { buildCity } from '../src/jev/city';
import { afterRequest, cityRequest, parseAfter, parseCity, readAfter, readCity } from '../src/jev/behave';
import { JEV_URL } from '../src/jev/intel';

export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

let world: ReturnType<typeof buildCity> | null = null;
const memo = new Map<string, string>();

const json = (body: unknown, status: number, cache = false) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cache ? 'public, max-age=3600, s-maxage=2592000, stale-while-revalidate=86400' : 'no-store',
    },
  });

export default async function handler(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind');
  const city = kind === 'city' ? parseCity(q) : null;
  const after = kind === 'after' ? parseAfter(q) : null;
  if (!city && !after) return json({ ok: false, reason: 'bad-request' }, 400);
  // A visitor's own key (from Settings, sent for this request only, never stored) comes first; then the site's.
  const own = req.headers.get('x-jev-key');
  const apiKey = own && /^[\w.-]{8,200}$/.test(own) ? own : (process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY);
  if (!apiKey) return json({ ok: false, reason: 'no-key' }, 503);

  const id = city ? `city|${city.hour}|${city.day}|${city.events.join(',')}` : `after|${after!.district}|${after!.hour}|${after!.day}|${after!.sev}`;
  const hit = memo.get(id);
  if (hit) return new Response(hit, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600, s-maxage=2592000' } });

  world ??= buildCity();
  const body = city ? cityRequest(world, city) : afterRequest(world, after!);
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(JEV_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
    } catch {
      return json({ ok: false, reason: 'upstream' }, 502);
    }
    if ((res.status === 429 || res.status === 529) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }
    if (!res.ok) return json({ ok: false, reason: 'upstream', status: res.status }, 502);
    try {
      const data = (await res.json()) as { answers: Record<string, unknown> };
      if (!data || typeof data.answers !== 'object') throw new Error('no answers');
      const out = JSON.stringify(city ? { ok: true, kind: 'city', districts: readCity(world, data) } : { ok: true, kind: 'after', mood: readAfter(data) });
      if (memo.size > 500) memo.clear();
      memo.set(id, out);
      return json(JSON.parse(out), 200, true);
    } catch {
      return json({ ok: false, reason: 'upstream', status: res.status }, 502);
    }
  }
  return json({ ok: false, reason: 'upstream', status: 429 }, 502);
}
