// ---------------------------------------------------------------------------
// Spejl-paritet: kickoff-beslutningerne i functions-platform/seedFootball.js
// SKAL svare ordret til src/lib/seedFootball.js — den daglige synk og den
// manuelle seed-vej skal give samme svar på samme kampprogram.
// Plus London-tid → UTC, hvor BST/GMT-skiftet midt i sæsonen er hele pointen.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import * as klient from '../src/lib/seedFootball.js';

const require = createRequire(import.meta.url);
const server = require('./seedFootball');

describe('kickoffMs — paritet med src/lib', () => {
  it('samme svar og samme afvisninger', () => {
    for (const ok of ['2026-08-21T19:00:00Z', '2026-08-21T20:00:00+01:00', 1755802800000, null, '']) {
      expect(server.kickoffMs(ok)).toBe(klient.kickoffMs(ok));
    }
    for (const daarlig of ['2026-08-21 20:00:00', 'vrøvl', '2026-08-21T20:00:00']) {
      expect(() => server.kickoffMs(daarlig)).toThrow();
      expect(() => klient.kickoffMs(daarlig)).toThrow();
    }
  });
});

describe('kickoffPlan — paritet med src/lib', () => {
  // Samme input (fixtures MED id, så klientens docId-opslag er identitet):
  // ændret tid, uændret, spillet, mangler — og ryd-forbuddet.
  const fixtures = [
    { id: 'r1-1', kickoff: '2026-08-21T19:00:00Z' }, // ændret
    { id: 'r1-2', kickoff: '2026-08-22T14:00:00Z' }, // uændret
    { id: 'r1-3', kickoff: '2026-08-22T16:30:00Z' }, // spillet → urørt
    { id: 'r1-4', kickoff: '2026-08-23T13:00:00Z' }, // aldrig seedet → alarm
  ];
  const nuvaerende = new Map([
    ['r1-1', { kickoffMs: Date.parse('2026-08-21T18:00:00Z') }],
    ['r1-2', { kickoffMs: Date.parse('2026-08-22T14:00:00Z') }],
    ['r1-3', { result: '1', kickoffMs: Date.parse('2026-08-22T15:00:00Z') }],
  ]);

  it('samme plan ad begge veje', () => {
    const s = server.kickoffPlan(fixtures, nuvaerende);
    const k = klient.kickoffPlan(fixtures, nuvaerende);
    expect(s).toEqual(k);
    expect(s.aendringer).toEqual([{ id: 'r1-1', fraMs: Date.parse('2026-08-21T18:00:00Z'), tilMs: Date.parse('2026-08-21T19:00:00Z') }]);
    expect(s.mangler).toEqual(['r1-4']);
    expect(s.spillet).toBe(1);
  });

  it('begge nægter at RYDDE en tid, der står', () => {
    const ryd = [{ id: 'r1-1', kickoff: null }];
    expect(() => server.kickoffPlan(ryd, nuvaerende)).toThrow(/bevidst/);
    expect(() => klient.kickoffPlan(ryd, nuvaerende)).toThrow(/bevidst/);
  });
});

describe('londonTilUtcMs — BST/GMT-skiftet er hele pointen', () => {
  it('sommer (BST, +01): 20:00 i London er 19:00Z', () => {
    expect(server.londonTilUtcMs('2026-08-21 20:00:00')).toBe(Date.parse('2026-08-21T19:00:00Z'));
  });
  it('vinter (GMT, +00): 20:00 i London er 20:00Z', () => {
    expect(server.londonTilUtcMs('2026-12-28 20:00:00')).toBe(Date.parse('2026-12-28T20:00:00Z'));
  });
  it('selve skiftedøgnet (25/10-2026): begge entydige sider af springet rammer rigtigt', () => {
    // 00:59 er stadig BST (23:59Z dagen før); 02:00 er GMT (02:00Z). En fast
    // offset ville flytte HVER vinterkamps deadline en time — det er fælden.
    // Timen 01:00-01:59 findes TO gange den nat og er tvetydig; algoritmen
    // vælger deterministisk GMT-læsningen. Ligegyldigt for kampstart — ingen
    // liga spiller kl. 1 om natten — men sagt her, så ingen "retter" det.
    expect(server.londonTilUtcMs('2026-10-25 00:59:00')).toBe(Date.parse('2026-10-24T23:59:00Z'));
    expect(server.londonTilUtcMs('2026-10-25 02:00:00')).toBe(Date.parse('2026-10-25T02:00:00Z'));
    // Foråret (29/3-2026-mønstret, her 2027): 00:59 GMT; 02:00 er BST (01:00Z).
    expect(server.londonTilUtcMs('2027-03-28 00:59:00')).toBe(Date.parse('2027-03-28T00:59:00Z'));
    expect(server.londonTilUtcMs('2027-03-28 02:00:00')).toBe(Date.parse('2027-03-28T01:00:00Z'));
  });
  it('ulæselig tid afvises højlydt', () => {
    expect(() => server.londonTilUtcMs('21/8-2026 20:00')).toThrow(/ulæselig/);
  });
});
