import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { mapPosts, postStats, fetchLiveTickerCore, cleanText } = require('./liveTicker');

describe('cleanText', () => {
  it('konverterer <br /> til linjeskift (fejlen fra etape 1-tickeren)', () => {
    expect(cleanText('Lidl-Trek er 0,07 sekunder foran ved km 10,5!<br />Hvis Netcompany Ineos holder stand…'))
      .toBe('Lidl-Trek er 0,07 sekunder foran ved km 10,5!\nHvis Netcompany Ineos holder stand…');
    expect(cleanText('a<BR>b<br/>c')).toBe('a\nb\nc');
  });
  it('fjerner øvrige tags og afkoder gængse entities', () => {
    expect(cleanText('<p>Pogacar &amp; Vingegaard</p>')).toBe('Pogacar & Vingegaard');
    expect(cleanText('22&#39;49&quot;')).toBe('22’49"');
    expect(cleanText('a&nbsp;b')).toBe('a b');
  });
  it('kollapser overskydende linjeskift og trimmer', () => {
    expect(cleanText('  a<br /><br /><br />b  ')).toBe('a\n\nb');
  });
});

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

  it('sorterer efter FAKTISK tid, ikke streng — blandede offsets (etape 17-fejlen)', () => {
    // "15:20Z" er 17:20 dansk tid → NYERE end "17:10+02:00", men strengsortering
    // ville lægge den nederst (og limit ville skære finalen af).
    const mixed = [
      { id: 'a', title: 'Sidste 10 km', publicationAt: '2026-07-22T17:10:00+02:00' },
      { id: 'b', title: 'Stuyven vinder!', publicationAt: '2026-07-22T15:20:00Z' },
      { id: 'c', title: 'Podiet', publicationAt: '2026-07-22T15:35:00+00:00' },
    ];
    expect(mapPosts(mixed).map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('limit beholder de N reelt nyeste ved blandede offsets', () => {
    const mixed = [
      { id: 'old1', title: 'x', publicationAt: '2026-07-22T16:00:00+02:00' },
      { id: 'old2', title: 'x', publicationAt: '2026-07-22T16:30:00+02:00' },
      { id: 'finale', title: 'x', publicationAt: '2026-07-22T15:40:00Z' }, // 17:40 lokal
    ];
    expect(mapPosts(mixed, 2).map((p) => p.id)).toEqual(['finale', 'old2']);
  });

  it('lækker ikke det interne _epoch-felt', () => {
    for (const p of mapPosts(RAW)) expect(p).not.toHaveProperty('_epoch');
  });
});

describe('postStats', () => {
  it('tæller opslag, offset-varianter og finder nyeste/ældste', () => {
    const s = postStats([
      { publicationAt: '2026-07-22T17:10:00+02:00' },
      { publicationAt: '2026-07-22T15:20:00Z' },
      { title: 'uden tid' },
    ]);
    expect(s.total).toBe(3);
    expect(s.nullTime).toBe(1);
    expect(s.offsets).toEqual({ '+02:00': 1, Z: 1 });
    expect(s.newestAt).toBe('2026-07-22T15:20:00.000Z'); // 17:20 dansk tid
    expect(s.oldestAt).toBe('2026-07-22T15:10:00.000Z');
  });
  it('tåler ikke-array input', () => {
    expect(postStats(null).total).toBe(0);
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
    // Cache-buster mod letours CDN: URL'en skal variere pr. hentning.
    expect(f.mock.calls[0][0]).toContain('?_=1000');
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

describe('fetchLiveTickerCore — engelsk fallback når dansk feed går i stå (etape 17)', () => {
  // Dansk feed slutter 17:10; klokken er 17:45 → i stå. Engelsk har finalen.
  const T = Date.parse('2026-07-22T17:45:00+02:00');
  const DA = [
    { id: 'da1', title: '10 kilometer til mål', text: ['x'], publicationAt: '2026-07-22T17:05:00+02:00' },
    { id: 'da2', title: 'Pedersen er dagens mest angrebsivrige', text: ['x'], publicationAt: '2026-07-22T17:10:00+02:00' },
  ];
  const EN = [
    { id: 'en0', title: 'Km 50: peloton rolling', text: ['old'], publicationAt: '2026-07-22T15:00:00+02:00' }, // ældre end da → må IKKE med
    { id: 'en1', title: 'Philipsen wins stage 17!', text: ['Eleventh stage win.'], publicationAt: '2026-07-22T17:18:00+02:00' },
    { id: 'en2', title: 'Top 5', text: ['1. Philipsen'], publicationAt: '2026-07-22T17:19:00+02:00' },
  ];
  const feedFetch = (en = EN) => vi.fn().mockImplementation((url) => {
    if (url.includes('publication_da-')) return Promise.resolve({ ok: true, json: async () => DA });
    if (url.includes('publication_en-')) return Promise.resolve({ ok: true, json: async () => en });
    return Promise.resolve({ ok: false, status: 404 });
  });

  it('fletter KUN nyere engelske opslag ind, nyeste først', async () => {
    const f = feedFetch();
    const res = await fetchLiveTickerCore({ stageNumber: 17, fetchImpl: f, now: () => T });
    expect(res.ok).toBe(true);
    expect(res.posts.map((p) => p.id)).toEqual(['en2', 'en1', 'da2', 'da1']);
    expect(f.mock.calls.some(([u]) => u.includes('publication_en-2026-17'))).toBe(true);
  });

  it('oversætter fallback-opslagene via translateImpl', async () => {
    const translateImpl = vi.fn(async (posts) => posts.map((p) => ({ ...p, title: `DA: ${p.title}`, translated: true })));
    const res = await fetchLiveTickerCore({ stageNumber: 17, fetchImpl: feedFetch(), now: () => T, translateImpl });
    expect(translateImpl).toHaveBeenCalledTimes(1);
    expect(translateImpl.mock.calls[0][0].map((p) => p.id)).toEqual(['en2', 'en1']); // kun de nye
    const top = res.posts[0];
    expect(top.title).toBe('DA: Top 5');
    expect(top.translated).toBe(true);
    // Danske opslag urørte.
    expect(res.posts.find((p) => p.id === 'da2').title).toBe('Pedersen er dagens mest angrebsivrige');
  });

  it('fejlet oversættelse viser opslagene uoversat (hellere engelsk end intet)', async () => {
    const translateImpl = vi.fn().mockRejectedValue(new Error('AI nede'));
    const res = await fetchLiveTickerCore({ stageNumber: 17, fetchImpl: feedFetch(), now: () => T, translateImpl });
    expect(res.posts[0].title).toBe('Top 5');
    expect(res.posts[0].translated).toBeUndefined();
  });

  it('friskt dansk feed → INTET fallback-kald', async () => {
    const f = feedFetch();
    const freshNow = Date.parse('2026-07-22T17:12:00+02:00'); // 2 min efter nyeste da-opslag
    await fetchLiveTickerCore({ stageNumber: 17, fetchImpl: f, now: () => freshNow });
    expect(f.mock.calls.every(([u]) => u.includes('publication_da-'))).toBe(true);
  });

  it('fallback-fejl vælter ikke det danske feed', async () => {
    const f = vi.fn().mockImplementation((url) => {
      if (url.includes('publication_da-')) return Promise.resolve({ ok: true, json: async () => DA });
      return Promise.reject(new Error('en-feed nede'));
    });
    const res = await fetchLiveTickerCore({ stageNumber: 17, fetchImpl: f, now: () => T });
    expect(res.ok).toBe(true);
    expect(res.posts.map((p) => p.id)).toEqual(['da2', 'da1']);
  });
});
