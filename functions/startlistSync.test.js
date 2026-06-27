// Tests for startlistSync — buildStartlistDoc + syncStartlistCore (ingen netværk).
import { describe, it, expect, vi } from 'vitest';
import { buildStartlistDoc, syncStartlistCore } from './startlistSync';

const PAYLOAD = {
  teams: [
    { code: 'TVL', name: 'Visma | Lease a Bike', announced: true, riders: [
      { name: 'Jonas Vingegaard', country: 'Danmark', leader: true },
      { name: 'Sepp Kuss', country: 'USA', leader: false },
      { name: '', country: 'X', leader: false }, // tom navn → frasorteres
    ] },
    { code: 'UEX', name: 'UAE Team Emirates - XRG', announced: false, riders: [] },
    { name: 'uden kode', announced: true, riders: [] }, // ingen kode → springes over
  ],
};

describe('buildStartlistDoc', () => {
  it('normaliserer hold og tæller udtagne', () => {
    const doc = buildStartlistDoc(PAYLOAD);
    expect(doc.total).toBe(3);
    expect(doc.announced).toBe(1); // kun TVL (holdet uden kode tælles ikke i byCode men i total)
    expect(Object.keys(doc.teams).sort()).toEqual(['TVL', 'UEX']);
    expect(doc.teams.TVL.riders).toEqual([
      { name: 'Jonas Vingegaard', country: 'Danmark', leader: true },
      { name: 'Sepp Kuss', country: 'USA', leader: false },
    ]);
    expect(doc.teams.UEX).toEqual({ name: 'UAE Team Emirates - XRG', announced: false, riders: [] });
  });

  it('tåler tomt/manglende payload', () => {
    expect(buildStartlistDoc(null)).toEqual({ teams: {}, announced: 0, total: 0 });
    expect(buildStartlistDoc({})).toEqual({ teams: {}, announced: 0, total: 0 });
  });
});

describe('syncStartlistCore', () => {
  it('henter fra proxyen og skriver config/startlist (mock fetch + db)', async () => {
    const set = vi.fn(() => Promise.resolve());
    const db = { collection: () => ({ doc: () => ({ set }) }) };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD }));

    const res = await syncStartlistCore({
      db, proxyUrl: 'https://proxy', season: 2026, fetchImpl, serverTimestamp: () => 'TS',
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://proxy/api/startlist');
    expect(res).toEqual({ announced: 1, total: 3 });
    const payload = set.mock.calls[0][0];
    expect(payload.season).toBe(2026);
    expect(payload.announced).toBe(1);
    expect(payload.updatedAt).toBe('TS');
    expect(payload.teams.TVL.announced).toBe(true);
    expect(set.mock.calls[0][1]).toEqual({ merge: true });
  });

  it('skriver IKKE når hentningen er helt tom (sikring mod at wipe data)', async () => {
    const set = vi.fn(() => Promise.resolve());
    const db = { collection: () => ({ doc: () => ({ set }) }) };
    const empty = { teams: [{ code: 'UEX', announced: false, riders: [] }] };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => empty }));

    const res = await syncStartlistCore({ db, proxyUrl: 'https://p', fetchImpl });
    expect(res).toMatchObject({ skipped: true });
    expect(set).not.toHaveBeenCalled();
  });

  it('kaster ved ikke-ok svar fra proxyen', async () => {
    const db = { collection: () => ({ doc: () => ({ set: vi.fn() }) }) };
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 502 }));
    await expect(syncStartlistCore({ db, proxyUrl: 'https://p', fetchImpl }))
      .rejects.toThrow(/HTTP 502/);
  });
});
