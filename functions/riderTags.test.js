// Tests for riderTags — AI-udledte rytter-karakteristika (ren logik).
import { describe, it, expect, vi } from 'vitest';
import {
  buildRiderTagPrompt,
  parseRiderTags,
  extractRiderTags,
  mergeAiTags,
  runEnrichRiderTags,
} from './riderTags.js';

describe('buildRiderTagPrompt', () => {
  it('samler titel + tekst pr. opslag og nævner etapenummeret', () => {
    const posts = [
      { title: 'Angreb!', text: 'Veistroffer er en klassisk baroudeur.' },
      { title: '', text: 'Philipsen tager spurten.' },
    ];
    const p = buildRiderTagPrompt(posts, 5);
    expect(p).toMatch(/etape 5/);
    expect(p).toMatch(/Angreb!\. Veistroffer/);
    expect(p).toMatch(/Philipsen tager spurten/);
  });
});

describe('parseRiderTags', () => {
  it('parser ren JSON og normaliserer tag til små bogstaver', () => {
    const out = parseRiderTags('{"tags":[{"rider":"Matthieu Veistroffer","tag":"Baroudeur","evidence":"klassisk baroudeur"}]}');
    expect(out).toEqual([{ rider: 'Matthieu Veistroffer', tag: 'baroudeur', evidence: 'klassisk baroudeur' }]);
  });

  it('griber JSON-blokken selv når svaret har ledsagende tekst/fence', () => {
    const raw = 'Her er resultatet:\n```json\n{"tags":[{"rider":"Jasper Philipsen","tag":"spurter"}]}\n```';
    const out = parseRiderTags(raw);
    expect(out).toEqual([{ rider: 'Jasper Philipsen', tag: 'spurter' }]);
  });

  it('springer poster uden rytter eller tag over, og tomt/ugyldigt → []', () => {
    expect(parseRiderTags('{"tags":[{"rider":"","tag":"spurter"},{"rider":"X","tag":""}]}')).toEqual([]);
    expect(parseRiderTags('ikke json')).toEqual([]);
    expect(parseRiderTags('')).toEqual([]);
  });
});

describe('mergeAiTags', () => {
  it('tilføjer nye tags og deduplikerer på rytter+tag+etape', () => {
    const existing = [{ rider: 'A', tag: 'spurter', stage: 4 }];
    const fresh = [{ rider: 'A', tag: 'spurter' }, { rider: 'B', tag: 'baroudeur', evidence: 'e' }];
    const merged = mergeAiTags(existing, fresh, 4, '2026-07-11T00:00:00Z');
    expect(merged).toHaveLength(2); // A/spurter/4 findes allerede → kun B tilføjes
    expect(merged[1]).toMatchObject({ rider: 'B', tag: 'baroudeur', stage: 4, evidence: 'e' });
  });

  it('samme rytter+tag på en ANDEN etape er et nyt tag', () => {
    const merged = mergeAiTags([{ rider: 'A', tag: 'spurter', stage: 4 }], [{ rider: 'A', tag: 'spurter' }], 5, 't');
    expect(merged).toHaveLength(2);
  });
});

describe('extractRiderTags', () => {
  it('kalder modellen og returnerer parsede tags', async () => {
    const anthropic = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"tags":[{"rider":"A","tag":"klatrer"}]}' }] }) } };
    const out = await extractRiderTags(anthropic, [{ text: 'A klatrer godt' }], 9);
    expect(out).toEqual([{ rider: 'A', tag: 'klatrer' }]);
    expect(anthropic.messages.create).toHaveBeenCalledOnce();
  });

  it('kanoniserer synonymer (sprinter → spurter, baroudeur → udbryder)', async () => {
    const anthropic = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"tags":[{"rider":"A","tag":"Sprinter"},{"rider":"B","tag":"baroudeur"}]}' }] }) } };
    const out = await extractRiderTags(anthropic, [{ text: 'x' }], 1);
    expect(out.map((t) => t.tag)).toEqual(['spurter', 'udbryder']);
  });
});

describe('runEnrichRiderTags', () => {
  function fakeDb(initial) {
    const store = { data: initial };
    const ref = {
      get: async () => ({ exists: store.data != null, data: () => store.data }),
      set: async (patch) => { store.data = { ...(store.data || {}), ...patch }; },
    };
    return { collection: () => ({ doc: () => ref }), _store: store };
  }
  const anthropicWith = (tags) => ({ messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ tags }) }] }) } });

  it('afviser ugyldigt etapenummer', async () => {
    const r = await runEnrichRiderTags(fakeDb(null), anthropicWith([]), { stageNumber: 99, fetchTicker: async () => ({ ok: true, posts: [{}] }) });
    expect(r).toMatchObject({ ok: false, reason: 'bad-stage' });
  });

  it('springer allerede-berigede etaper over (uden force)', async () => {
    const db = fakeDb({ enrichedStages: [5], aiRaw: [] });
    const r = await runEnrichRiderTags(db, anthropicWith([]), { stageNumber: 5, fetchTicker: async () => ({ ok: true, posts: [{}] }) });
    expect(r).toMatchObject({ ok: true, added: 0, reason: 'already-enriched' });
  });

  it('fejler pænt når tickeren er tom', async () => {
    const r = await runEnrichRiderTags(fakeDb(null), anthropicWith([]), { stageNumber: 5, fetchTicker: async () => ({ ok: false, reason: 'http-404' }) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no-ticker/);
  });

  it('skriver AI-tags og markerer etapen som beriget', async () => {
    const db = fakeDb(null);
    const r = await runEnrichRiderTags(db, anthropicWith([{ rider: 'Veistroffer', tag: 'baroudeur', evidence: 'e' }]), {
      stageNumber: 5, fetchTicker: async () => ({ ok: true, posts: [{ text: 'Veistroffer baroudeur' }] }), serverTimestamp: 'TS',
    });
    expect(r).toMatchObject({ ok: true, stage: 5, added: 1 });
    expect(db._store.data.enrichedStages).toEqual([5]);
    // baroudeur kanoniseres til udbryder ved skrivning.
    expect(db._store.data.aiRaw[0]).toMatchObject({ rider: 'Veistroffer', tag: 'udbryder', stage: 5 });
  });

  it('er idempotent: anden kørsel med force tilføjer ikke duplikater', async () => {
    const db = fakeDb(null);
    const opts = { stageNumber: 5, fetchTicker: async () => ({ ok: true, posts: [{ text: 'x' }] }), serverTimestamp: 'TS', force: true };
    await runEnrichRiderTags(db, anthropicWith([{ rider: 'A', tag: 'spurter' }]), opts);
    const r2 = await runEnrichRiderTags(db, anthropicWith([{ rider: 'A', tag: 'spurter' }]), opts);
    expect(r2.added).toBe(0);
    expect(db._store.data.aiRaw).toHaveLength(1);
  });
});
