// functions/stageInfoSync.test.js — stageInfoUpdate + syncStageInfoCore.
// Proxy-fetch og Firestore mockes; ingen rigtig netværks-/db-trafik.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { stageInfoUpdate, syncStageInfoCore } = require('./tourSync.js');

describe('stageInfoUpdate', () => {
  it('skriver elevation + pointsAwarded når til stede', () => {
    const { update, hasElevation, hasAwards } = stageInfoUpdate({
      stage: 5, km: 158.3, type: 'flat', elevation: 1600,
      awards: { sprint: true, mountain: true },
    });
    expect(hasElevation).toBe(true);
    expect(hasAwards).toBe(true);
    expect(update.elevation).toBe(1600);
    expect(update.pointsAwarded).toEqual({ sprint: true, mountain: true });
    // Ikke-destruktivt: km/type lægges IKKE i update (rører ikke admin-felter).
    expect(update.km).toBeUndefined();
    expect(update.type).toBeUndefined();
  });

  it('udelader felter der mangler', () => {
    const { update, hasElevation, hasAwards } = stageInfoUpdate({ stage: 9, elevation: null, awards: {} });
    expect(hasElevation).toBe(false);
    expect(hasAwards).toBe(false);
    expect(update).toEqual({});
  });
});

// Minimal Firestore-mock der husker set()-kald.
function makeDb() {
  const writes = [];
  const db = {
    collection: () => ({
      doc: (id) => ({
        set: (data, opts) => { writes.push({ id, data, opts }); return Promise.resolve(); },
      }),
    }),
  };
  return { db, writes };
}

const PAYLOAD = {
  year: 2026,
  stages: [
    { stage: 1, km: 33, type: 'ttt', elevation: 200, awards: { sprint: false, mountain: false } },
    { stage: 5, km: 158.3, type: 'flat', elevation: 1600, awards: { sprint: true, mountain: true } },
    { stage: 6, km: 186, type: 'mountain', elevation: 4100, awards: { sprint: true, mountain: true } },
    { stage: 99, km: null, type: null, elevation: null, awards: {} }, // intet at skrive
  ],
};

function fakeFetch(ok = true, body = PAYLOAD, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('syncStageInfoCore', () => {
  it('skriver elevation+pointsAwarded pr. etape (mock fetch, ingen netværk)', async () => {
    const { db, writes } = makeDb();
    const fetchImpl = fakeFetch();
    const res = await syncStageInfoCore({
      db, proxyUrl: 'https://proxy.test', season: 2026, fetchImpl,
      serverTimestamp: () => 'TS',
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://proxy.test/api/stage-info');
    expect(res.season).toBe(2026);
    expect(res.checked).toBe(4);
    expect(res.updated).toBe(3); // stage 99 har intet at skrive
    // Doc-id'er er sæson-stage-N, og merge:true bruges (ikke-destruktivt).
    const s5 = writes.find((w) => w.id === '2026-stage-5');
    expect(s5.opts).toEqual({ merge: true });
    expect(s5.data.elevation).toBe(1600);
    expect(s5.data.pointsAwarded).toEqual({ sprint: true, mountain: true });
    expect(s5.data.km).toBeUndefined(); // rører ikke admin-redigerbare felter
    expect(writes.find((w) => w.id === '2026-stage-99')).toBeUndefined();
  });

  it('dryRun: skriver intet men returnerer preview', async () => {
    const { db, writes } = makeDb();
    const res = await syncStageInfoCore({
      db, proxyUrl: 'https://proxy.test', season: 2026, fetchImpl: fakeFetch(), dryRun: true,
    });
    expect(writes).toHaveLength(0);
    expect(res.dryRun).toBe(true);
    expect(res.updated).toBe(3);
    expect(res.stages.find((s) => s.stage === 5)).toMatchObject({
      stage: 5, elevation: 1600, pointsAwarded: { sprint: true, mountain: true },
    });
  });

  it('kaster ved HTTP-fejl fra proxyen', async () => {
    const { db } = makeDb();
    await expect(syncStageInfoCore({
      db, proxyUrl: 'https://proxy.test', season: 2026, fetchImpl: fakeFetch(false, {}, 500),
    })).rejects.toThrow(/HTTP 500/);
  });
});
