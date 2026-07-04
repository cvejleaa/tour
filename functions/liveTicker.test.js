import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { mapPosts, fetchLiveTickerCore } = require('./liveTicker');

const RAW = [
  { id: 1, title: 'Etapen er i gang!', text: ['Afsted fra Barcelona.'], picto: 'liv_actual_start', publicationAt: '2026-07-04T17:05:00+02:00', pinned: false, highlight: true },
  { id: 2, title: 'Bedste tid: 22\'49\'\'', text: ['Ti sekunder hurtigere.'], picto: 'liv_finish', publicationAt: '2026-07-04T17:39:00+02:00', pinned: false, highlight: false },
  { id: 3, title: 'Velkommen', text: ['Dagens program.'], picto: 'liv_start', publicationAt: '2026-07-04T16:35:00+02:00', pinned: true, highlight: false },
  { id: 4, title: '', text: [] }, // tomt → filtreres fra
];

describe('mapPosts', () => {
  it('sorterer pinned først, derefter nyeste først, og filtrerer tomme fra', () => {
    const posts = mapPosts(RAW);
    expect(posts.map((p) => p.id)).toEqual([3, 2, 1]);
  });
  it('samler text-array til én streng og normaliserer felter', () => {
    const p = mapPosts(RAW).find((x) => x.id === 1);
    expect(p.text).toBe('Afsted fra Barcelona.');
    expect(p.highlight).toBe(true);
    expect(p.picto).toBe('liv_actual_start');
  });
  it('tåler ikke-array input', () => {
    expect(mapPosts(null)).toEqual([]);
    expect(mapPosts({})).toEqual([]);
  });
});

describe('fetchLiveTickerCore', () => {
  const okFetch = () => vi.fn().mockResolvedValue({ ok: true, json: async () => RAW });

  it('afviser ugyldigt etapenummer uden netværkskald', async () => {
    const f = okFetch();
    const res = await fetchLiveTickerCore({ stageNumber: 99, fetchImpl: f });
    expect(res).toEqual({ ok: false, reason: 'bad-stage' });
    expect(f).not.toHaveBeenCalled();
  });

  it('henter, mapper og cacher', async () => {
    const f = okFetch();
    const cache = new Map();
    let t = 1000;
    const now = () => t;
    const r1 = await fetchLiveTickerCore({ stageNumber: 1, fetchImpl: f, cache, now });
    expect(r1.ok).toBe(true);
    expect(r1.posts).toHaveLength(3);
    // Inden for cache-vinduet → intet nyt kald.
    t += 10000;
    await fetchLiveTickerCore({ stageNumber: 1, fetchImpl: f, cache, now });
    expect(f).toHaveBeenCalledTimes(1);
    // Efter vinduet → nyt kald.
    t += 60000;
    await fetchLiveTickerCore({ stageNumber: 1, fetchImpl: f, cache, now });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('HTTP-fejl gives videre som ok:false og caches (hamrer ikke)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const cache = new Map();
    const now = () => 5000;
    const res = await fetchLiveTickerCore({ stageNumber: 2, fetchImpl: f, cache, now });
    expect(res).toEqual({ ok: false, reason: 'http-403' });
    await fetchLiveTickerCore({ stageNumber: 2, fetchImpl: f, cache, now });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('netværksfejl fanges som ok:false', async () => {
    const f = vi.fn().mockRejectedValue(new Error('timeout'));
    const res = await fetchLiveTickerCore({ stageNumber: 3, fetchImpl: f });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('timeout');
  });
});
