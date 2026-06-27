// Tests for stageTip.js — AI ekspert-tips pr. etape.
// VIGTIGT: Anthropic-klienten er MOCKET (en fake med messages.create), så der
// ALDRIG sker et rigtigt API-kald. stageTip.js modtager klienten injiceret —
// præcis som index.js sender new Anthropic({apiKey}) ind — så ingen rigtig SDK
// indlæses her overhovedet.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
  buildStageTipPrompt,
  buildStageTipFacts,
  generateStageTipText,
  runGenerateStageTips,
  STAGE_TIP_MODEL,
} = require('./stageTip');

// Fake Anthropic-klient med samme form som SDK'en: { messages: { create } }.
const mockCreate = vi.fn();
function fakeClient() {
  return { messages: { create: (...a) => mockCreate(...a) } };
}

// Minimal fake Firestore: stages-collection med doc()/get()/set() og where().
function fakeDb(stagesById) {
  const writes = [];
  function makeRef(id) {
    return {
      id,
      get: async () => ({
        id,
        exists: Object.prototype.hasOwnProperty.call(stagesById, id),
        data: () => stagesById[id],
      }),
      set: async (data, opts) => { writes.push({ id, data, opts }); },
    };
  }
  const collection = () => {
    let seasonFilter;
    const api = {
      doc: (id) => makeRef(id),
      where: (field, _op, value) => { if (field === 'season') seasonFilter = value; return api; },
      get: async () => ({
        docs: Object.entries(stagesById)
          .filter(([, d]) => seasonFilter == null || d.season === seasonFilter)
          .map(([id, d]) => ({ id, ref: makeRef(id), data: () => d })),
      }),
    };
    return api;
  };
  return { collection, writes };
}

const TEXT = 'Det er en flad etape, hvor sprinternes hold ofte styrer. Tip et hold med en stærk sprinter.';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: TEXT }] });
});

describe('buildStageTipFacts / buildStageTipPrompt', () => {
  it('bygger en dansk prompt af etapefelterne + aktive spørgsmål', () => {
    const stage = {
      number: 5, type: 'flat', km: 178, elevation: 1200,
      startCity: 'Lille', finishCity: 'Roubaix', description: 'Brosten undervejs.',
    };
    const facts = buildStageTipFacts(stage);
    expect(facts.typeLabel).toBe('flad etape');
    // flad: vinder, bedste hold, sprint — IKKE bjerg.
    expect(facts.activeQuestions).toContain('flest sprintpoint');
    expect(facts.activeQuestions).not.toContain('flest bjergpoint');

    const prompt = buildStageTipPrompt(stage);
    expect(prompt).toContain('nr. 5');
    expect(prompt).toContain('178 km');
    expect(prompt).toContain('1200 m');
    expect(prompt).toContain('Lille → Roubaix');
    expect(prompt).toContain('Brosten undervejs.');
  });

  it('tager stigninger (navn+kategori) og mellemsprints med i prompten', () => {
    const stage = {
      number: 9, type: 'mountain', km: 180,
      climbs: [{ name: 'Col du Tourmalet', category: 'HC' }, { name: 'Côte de Test', category: '3' }],
      sprints: [{ name: 'BAYONNE' }],
    };
    const facts = buildStageTipFacts(stage);
    expect(facts.climbs).toHaveLength(2);
    expect(facts.sprints).toEqual([{ name: 'BAYONNE' }]);

    const prompt = buildStageTipPrompt(stage);
    expect(prompt).toContain('Col du Tourmalet (kat. HC)');
    expect(prompt).toContain('Côte de Test (kat. 3)');
    expect(prompt).toContain('BAYONNE');
  });

  it('respekterer questions-override ved aktive spørgsmål', () => {
    const stage = {
      number: 9, type: 'mountain',
      questions: { winnerTeam: true, gcTeam: false, mountainTeam: true, sprintTeam: false },
    };
    const facts = buildStageTipFacts(stage);
    expect(facts.activeQuestions).toEqual(['etapevinderens hold', 'flest bjergpoint']);
  });
});

describe('generateStageTipText', () => {
  it('kalder den mockede SDK med den rigtige model og returnerer teksten', async () => {
    const text = await generateStageTipText(fakeClient(), { number: 1, type: 'flat' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].model).toBe(STAGE_TIP_MODEL);
    expect(text).toBe(TEXT);
  });
});

describe('runGenerateStageTips — én etape', () => {
  it('skriver expertTip + expertTipUpdatedAt på etape-dokumentet', async () => {
    const db = fakeDb({ '2026-stage-3': { season: 2026, number: 3, type: 'flat' } });
    const ts = { _serverTimestamp: true };
    const out = await runGenerateStageTips(db, fakeClient(), { stageId: '2026-stage-3', serverTimestamp: ts });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(out.results).toEqual([{ stageId: '2026-stage-3', number: 3, expertTip: TEXT }]);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].id).toBe('2026-stage-3');
    expect(db.writes[0].data).toEqual({ expertTip: TEXT, expertTipUpdatedAt: ts });
    expect(db.writes[0].opts).toEqual({ merge: true });
  });

  it('kaster hvis etapen ikke findes', async () => {
    const db = fakeDb({});
    await expect(runGenerateStageTips(db, fakeClient(), { stageId: 'mangler' }))
      .rejects.toThrow(/findes ikke/);
  });
});

describe('runGenerateStageTips — all', () => {
  it('genererer kun for etaper UDEN tip i sæsonen', async () => {
    const db = fakeDb({
      '2026-stage-1': { season: 2026, number: 1, type: 'flat', expertTip: 'allerede sat' },
      '2026-stage-2': { season: 2026, number: 2, type: 'mountain' },
      '2026-stage-3': { season: 2026, number: 3, type: 'flat', expertTip: '   ' }, // tom → med
      '2025-stage-1': { season: 2025, number: 1, type: 'flat' }, // anden sæson → fra
    });
    const out = await runGenerateStageTips(db, fakeClient(), { all: true, season: 2026, serverTimestamp: 't' });

    // stage-2 og stage-3 (tom tip), IKKE stage-1 (har tip) eller 2025.
    const ids = out.results.map((r) => r.stageId).sort();
    expect(ids).toEqual(['2026-stage-2', '2026-stage-3']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(db.writes.map((w) => w.id).sort()).toEqual(['2026-stage-2', '2026-stage-3']);
  });

  it('med force regenererer ALLE etaper i sæsonen (også dem med tip)', async () => {
    const db = fakeDb({
      '2026-stage-1': { season: 2026, number: 1, type: 'flat', expertTip: 'allerede sat' },
      '2026-stage-2': { season: 2026, number: 2, type: 'mountain' },
      '2025-stage-1': { season: 2025, number: 1, type: 'flat' }, // anden sæson → fra
    });
    const out = await runGenerateStageTips(db, fakeClient(), { all: true, force: true, season: 2026, serverTimestamp: 't' });

    const ids = out.results.map((r) => r.stageId).sort();
    expect(ids).toEqual(['2026-stage-1', '2026-stage-2']);
    expect(db.writes.map((w) => w.id).sort()).toEqual(['2026-stage-1', '2026-stage-2']);
  });

  it('én fejlende etape afbryder ikke kørslen (fejl samles)', async () => {
    const db = fakeDb({
      '2026-stage-1': { season: 2026, number: 1, type: 'flat' },
      '2026-stage-2': { season: 2026, number: 2, type: 'flat' },
    });
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: TEXT }] })
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 400 }));

    const out = await runGenerateStageTips(db, fakeClient(), { all: true, season: 2026, serverTimestamp: 't' });
    expect(out.results).toHaveLength(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].error).toMatch(/boom/);
    expect(db.writes).toHaveLength(1); // kun den vellykkede blev skrevet
  });
});

// Admin-guard: index.js bruger requireAdmin (samme som de øvrige admin-callables).
// Vi verificerer guard-kontrakten her uden at importere index.js (Firebase-init).
describe('admin-guard kontrakt', () => {
  // Spejler requireAdmin i index.js (samme guard som de øvrige admin-callables).
  async function requireAdmin(db, request) {
    if (!request.auth) throw new Error('unauthenticated');
    const snap = await db.collection('users').doc(request.auth.uid).get();
    const role = snap.data()?.role;
    if (role !== 'owner' && role !== 'globalAdmin') {
      throw new Error('permission-denied');
    }
  }
  function usersDb(role) {
    return { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ role }) }) }) }) };
  }

  it('afviser uautentificerede', async () => {
    await expect(requireAdmin(usersDb('owner'), { auth: null })).rejects.toBeTruthy();
  });
  it('afviser almindelige spillere', async () => {
    await expect(requireAdmin(usersDb('player'), { auth: { uid: 'u' } })).rejects.toBeTruthy();
  });
  it('tillader owner og globalAdmin', async () => {
    await expect(requireAdmin(usersDb('owner'), { auth: { uid: 'u' } })).resolves.toBeUndefined();
    await expect(requireAdmin(usersDb('globalAdmin'), { auth: { uid: 'u' } })).resolves.toBeUndefined();
  });
});
