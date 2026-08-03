// functions/liveMap.test.js — live-kortets datalag (payload-form fra rigtig HAR).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { mapGroups, mapRoute, fetchLiveMapCore } = require('./liveMap.js');

// Uddrag af rigtigt telemetryPack-2026-2-payload (etape 2, 5. juli 2026).
const TELEMETRY = [{
  groups: [
    {
      id: 2, order: 3, name: 'Peloton', size: 0, relative: 221, speed: 50,
      latitude: 41.197, longitude: 1.627, completedDistance: 36640, remainingDistance: 131760,
      bibs: [], hasYellowJersey: false,
    },
    {
      id: 1, order: 0, name: 'Front of the Race', size: 3, relative: 0, speed: 49,
      latitude: 41.204, longitude: 1.662, completedDistance: 39750, remainingDistance: 128650,
      bibs: [{ bib: 114 }, { bib: 218 }, { bib: 224 }], hasYellowJersey: false,
    },
  ],
  date: '2026-07-05T14:44:31+02:00',
}];

const CHECKPOINTS = [
  { checkpoint: 2, latitude: 41.2, longitude: 1.4, length: 20 },
  { checkpoint: 1, latitude: 41.12, longitude: 1.23, length: 0 },
  { checkpoint: 3, latitude: 41.3, longitude: 1.7, length: 60 },
  { checkpoint: 4, latitude: null, longitude: 1.9 }, // ugyldig → filtreres
];

describe('mapGroups', () => {
  it('normaliserer og sorterer grupper efter tidsgab (forrest først)', () => {
    const { groups, date } = mapGroups(TELEMETRY);
    expect(date).toBe('2026-07-05T14:44:31+02:00');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      name: 'Front of the Race', gapSec: 0, size: 3, speed: 49,
      kmDone: 39.8, kmLeft: 128.7, bibs: [114, 218, 224],
    });
    expect(groups[1]).toMatchObject({ name: 'Peloton', gapSec: 221 });
  });
  it('tåler tomt/ugyldigt payload', () => {
    expect(mapGroups(null).groups).toEqual([]);
    expect(mapGroups([{}]).groups).toEqual([]);
  });
});

describe('mapRoute', () => {
  it('sorterer efter checkpoint og dropper punkter uden koordinater', () => {
    const route = mapRoute(CHECKPOINTS);
    expect(route).toEqual([[41.12, 1.23], [41.2, 1.4], [41.3, 1.7]]);
  });
});

describe('fetchLiveMapCore', () => {
  const mkFetch = (calls) => async (url) => {
    calls.push(url);
    const body = url.includes('checkpointList') ? CHECKPOINTS : TELEMETRY;
    return { ok: true, json: async () => body };
  };

  it('henter rute + grupper og cacher: telemetri kort, rute langt', async () => {
    const calls = [];
    const cache = new Map();
    const routeCache = new Map();
    let t = 1000;
    const opts = {
      stageNumber: 2, fetchImpl: mkFetch(calls), cache, routeCache, now: () => t,
    };
    const v1 = await fetchLiveMapCore(opts);
    expect(v1.ok).toBe(true);
    expect(v1.route).toHaveLength(3);
    expect(v1.groups[0].bibs).toEqual([114, 218, 224]);
    expect(calls).toHaveLength(2); // checkpointList + telemetryPack

    // Inden for 45 sek.: alt fra cache, ingen nye kald.
    t += 30000;
    await fetchLiveMapCore(opts);
    expect(calls).toHaveLength(2);

    // Efter 45 sek.: telemetrien genhentes, men RUTEN kommer fra rute-cachen.
    t += 30000;
    await fetchLiveMapCore(opts);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain('telemetryPack');
  });

  it('ugyldigt etapenummer og HTTP-fejl → ok:false (cachet)', async () => {
    expect((await fetchLiveMapCore({ stageNumber: 0, fetchImpl: async () => {} })).ok).toBe(false);
    const cache = new Map();
    const bad = await fetchLiveMapCore({
      stageNumber: 2, cache,
      fetchImpl: async () => ({ ok: false, status: 503 }),
    });
    expect(bad).toEqual({ ok: false, reason: 'http-503' });
    expect(cache.size).toBe(1); // fejlen caches → ingen hamring
  });
});
