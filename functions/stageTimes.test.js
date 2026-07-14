// Tests for stageTimes — officielle starttider fra racecenter (ren logik).
import { describe, it, expect, vi } from 'vitest';
import {
  normTime, normDate, kickoffIso, mapOfficialStages, diffStageTimes, syncStageTimesCore,
} from './stageTimes.js';

describe('norm-hjælpere', () => {
  it('normTime: HH:MM:SS og HH:MM → HH:MM; skrald → null', () => {
    expect(normTime('13:25:00')).toBe('13:25');
    expect(normTime('9:05')).toBe('09:05');
    expect(normTime(null)).toBe(null);
    expect(normTime('abc')).toBe(null);
  });

  it('normDate: ISO-datotid → dato', () => {
    expect(normDate('2026-07-14T00:00:00+02:00')).toBe('2026-07-14');
    expect(normDate('')).toBe(null);
  });

  it('kickoffIso bygger Tour-tids-ISO (samme format som frontendens seed)', () => {
    expect(kickoffIso('2026-07-14', '13:15')).toBe('2026-07-14T13:15:00+02:00');
    expect(kickoffIso(null, '13:15')).toBe(null);
  });
});

describe('mapOfficialStages', () => {
  it('normaliserer og sorterer racecenter-payloadet', () => {
    const out = mapOfficialStages([
      { stage: 10, date: '2026-07-14T00:00:00+02:00', startTime: '13:15:00', endTime: '17:02:00', isCancelled: false },
      { stage: 2, date: '2026-07-05T00:00:00+02:00', startTime: '13:55:00' },
      { stage: 'x' },
    ]);
    expect(out.map((s) => s.stage)).toEqual([2, 10]);
    expect(out[1]).toMatchObject({ stage: 10, date: '2026-07-14', startTime: '13:15', endTime: '17:02', cancelled: false });
  });
});

describe('diffStageTimes', () => {
  const officiel = mapOfficialStages([
    { stage: 10, date: '2026-07-14T00:00:00+02:00', startTime: '13:15:00' },
    { stage: 11, date: '2026-07-15T00:00:00+02:00', startTime: '14:05:00' },
    { stage: 8, date: '2026-07-11T00:00:00+02:00', startTime: '13:00:00' },
  ]);

  it('finder etaper hvor tiden afviger — og kun dem', () => {
    const docs = [
      { id: '2026-stage-10', data: { number: 10, date: '2026-07-14', startTime: '13:25', status: 'scheduled' } },
      { id: '2026-stage-11', data: { number: 11, date: '2026-07-15', startTime: '14:05', status: 'scheduled' } },
    ];
    const changes = diffStageTimes(docs, officiel);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id: '2026-stage-10', number: 10,
      from: { startTime: '13:25' },
      to: { date: '2026-07-14', startTime: '13:15', kickoff: '2026-07-14T13:15:00+02:00' },
    });
  });

  it('rører ikke afgjorte etaper', () => {
    const docs = [{ id: '2026-stage-8', data: { number: 8, date: '2026-07-11', startTime: '13:25', status: 'done' } }];
    expect(diffStageTimes(docs, officiel)).toHaveLength(0);
  });

  it('fanger datoændring selvom klokkeslæt er ens', () => {
    const docs = [{ id: '2026-stage-11', data: { number: 11, date: '2026-07-16', startTime: '14:05', status: 'scheduled' } }];
    const changes = diffStageTimes(docs, officiel);
    expect(changes).toHaveLength(1);
    expect(changes[0].to.date).toBe('2026-07-15');
  });
});

describe('syncStageTimesCore', () => {
  function fakeDb(docs) {
    const writes = [];
    return {
      writes,
      collection: () => ({
        where: () => ({
          get: async () => ({
            docs: docs.map((d) => ({
              id: d.id,
              data: () => d.data,
              ref: { set: async (patch) => writes.push({ id: d.id, patch }) },
            })),
          }),
        }),
      }),
    };
  }
  const officialJson = [
    { stage: 10, date: '2026-07-14T00:00:00+02:00', startTime: '13:15:00' },
  ];
  const fetchOk = vi.fn().mockResolvedValue({ ok: true, json: async () => officialJson });

  it('retter afvigende etape (kickoff via toTimestamp)', async () => {
    const db = fakeDb([{ id: '2026-stage-10', data: { number: 10, date: '2026-07-14', startTime: '13:25', status: 'scheduled' } }]);
    const r = await syncStageTimesCore(db, {
      season: 2026, fetchImpl: fetchOk,
      toTimestamp: (iso) => `TS(${iso})`, serverTimestamp: 'NOW',
    });
    expect(r).toMatchObject({ ok: true, checked: 1, applied: 1 });
    expect(db.writes[0].patch).toMatchObject({
      date: '2026-07-14', startTime: '13:15',
      kickoff: 'TS(2026-07-14T13:15:00+02:00)', startTimeUpdatedAt: 'NOW',
    });
  });

  it('dryRun skriver intet men viser diffen', async () => {
    const db = fakeDb([{ id: '2026-stage-10', data: { number: 10, date: '2026-07-14', startTime: '13:25', status: 'scheduled' } }]);
    const r = await syncStageTimesCore(db, {
      season: 2026, fetchImpl: fetchOk, toTimestamp: (x) => x, dryRun: true,
    });
    expect(r.changes).toHaveLength(1);
    expect(r.applied).toBe(0);
    expect(db.writes).toHaveLength(0);
  });

  it('fejler pænt ved http-fejl', async () => {
    const db = fakeDb([]);
    const r = await syncStageTimesCore(db, {
      season: 2026, fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503 }), toTimestamp: (x) => x,
    });
    expect(r).toMatchObject({ ok: false, reason: 'http-503' });
  });
});
