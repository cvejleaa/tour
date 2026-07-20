import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { leagueStandings, renderThankYouEmail, normalizeScoring } = require('./thankYouEmail');

describe('normalizeScoring', () => {
  it('udfylder manglende nøgler fra standard', () => {
    expect(normalizeScoring({ scoring: { stage: false } })).toEqual({
      stage: false, bonus: true, leagueBonus: true,
    });
  });
  it('oversætter gammelt format-felt', () => {
    expect(normalizeScoring({ format: 'bonusOnly' })).toEqual({ stage: false, bonus: true, leagueBonus: true });
    expect(normalizeScoring({ format: 'stageOnly' })).toEqual({ stage: true, bonus: false, leagueBonus: true });
  });
  it('uden scoring/format → alt tæller', () => {
    expect(normalizeScoring({})).toEqual({ stage: true, bonus: true, leagueBonus: true });
  });
});

describe('leagueStandings', () => {
  const membersById = {
    u1: { displayName: 'Mette', stagePoints: 100, bonusPoints: 8 },
    u2: { displayName: 'Jonas', stagePoints: 90, bonusPoints: 6 },
    u3: { displayName: 'Anders', stagePoints: 95, bonusPoints: 12 },
  };
  it('sorterer efter ligaens scoring (alt tæller)', () => {
    const league = { name: 'Kontoret', memberUids: ['u1', 'u2', 'u3'], scoring: { stage: true, bonus: true } };
    const std = leagueStandings(league, membersById);
    // Mette 108, Anders 107, Jonas 96
    expect(std.rows.map((r) => [r.name, r.points, r.rank])).toEqual([
      ['Mette', 108, 1], ['Anders', 107, 2], ['Jonas', 96, 3],
    ]);
    expect(std.memberCount).toBe(3);
  });
  it('respekterer scoring-valg (kun etape-point)', () => {
    const league = { name: 'X', memberUids: ['u1', 'u2'], scoring: { stage: true, bonus: false, leagueBonus: false } };
    const std = leagueStandings(league, membersById);
    expect(std.rows.map((r) => r.points)).toEqual([100, 90]); // kun stagePoints
  });
  it('giver delt placering ved lige point (begge får den bedste)', () => {
    const members = {
      a: { displayName: 'Nada', stagePoints: 312, bonusPoints: 0 },
      b: { displayName: 'Bibamus', stagePoints: 309, bonusPoints: 0 },
      c: { displayName: 'Valentina', stagePoints: 309, bonusPoints: 0 },
      d: { displayName: 'Sidste', stagePoints: 300, bonusPoints: 0 },
    };
    const league = { name: 'ITFL', memberUids: ['a', 'b', 'c', 'd'], scoring: { stage: true, bonus: false, leagueBonus: false } };
    const std = leagueStandings(league, members);
    // 312 → 1, 309+309 → begge 2, 300 → 4 (standard konkurrence-rangering)
    expect(std.rows.map((r) => [r.name, r.rank])).toEqual([
      ['Nada', 1], ['Bibamus', 2], ['Valentina', 2], ['Sidste', 4],
    ]);
  });
  it('springer ukendte medlemmer over', () => {
    const league = { name: 'X', memberUids: ['u1', 'ghost'], scoring: { stage: true, bonus: true } };
    const std = leagueStandings(league, membersById);
    expect(std.rows).toHaveLength(1);
    expect(std.rows[0].name).toBe('Mette');
  });
  it('lægger liga-bonus til når ligaen bruger den', () => {
    const league = { name: 'K', memberUids: ['u1', 'u2', 'u3'], scoring: { stage: true, bonus: true, leagueBonus: true } };
    // u3 (107) får +15 liga-bonus → 122, overhaler Mette (108) og Jonas (98).
    const std = leagueStandings(league, membersById, { u3: 15, u2: 2 });
    expect(std.rows.map((r) => [r.name, r.points])).toEqual([
      ['Anders', 122], ['Mette', 108], ['Jonas', 98],
    ]);
  });
  it('bruger gammelt format-felt (stageOnly tæller kun etape-point)', () => {
    const league = { name: 'Legacy', memberUids: ['u1', 'u3'], format: 'stageOnly' };
    const std = leagueStandings(league, membersById);
    expect(std.rows.find((r) => r.name === 'Mette').points).toBe(100);
    expect(std.rows.find((r) => r.name === 'Anders').points).toBe(95);
  });
  it('ignorerer liga-bonus når scoring.leagueBonus er slået fra', () => {
    const league = { name: 'K', memberUids: ['u1', 'u3'], scoring: { stage: true, bonus: true, leagueBonus: false } };
    const std = leagueStandings(league, membersById, { u3: 99 });
    expect(std.rows.find((r) => r.name === 'Anders').points).toBe(107); // uændret
  });
});

describe('renderThankYouEmail', () => {
  const data = {
    displayName: 'Anders',
    youUid: 'u3',
    gcPodium: { afterStage: 21, rows: [
      { rank: 1, rider: 'Pogacar', team: 'UAE Team Emirates', time: '80:00:00' },
      { rank: 2, rider: 'Vingegaard', team: 'Visma', time: '+2:30' },
      { rank: 3, rider: 'Evenepoel', team: 'Soudal', time: '+5:01' },
    ] },
    jerseys: { afterStage: 21, yellow: 'Pogacar', green: 'Girmay', polka: 'Ciccone', white: 'Evenepoel', teamLead: 'Visma' },
    facts: { etaper: 21, totalKm: 3320, distinctWinners: 12, topTeam: { team: 'UAE Team Emirates', wins: 5 } },
    stageWins: [
      { rider: 'Pogacar', team: 'UAE Team Emirates', wins: 5, stages: [4, 14, 15, 20, 21] },
      { rider: 'Philipsen', team: 'Alpecin', wins: 3, stages: [10, 13, 16] },
    ],
    leagues: [{ name: 'Kontoret', memberCount: 3, rows: [
      { uid: 'u1', name: 'Mette', points: 148, rank: 1 },
      { uid: 'u2', name: 'Jonas', points: 141, rank: 2 },
      { uid: 'u3', name: 'Anders', points: 137, rank: 3 },
    ] }],
  };
  const html = renderThankYouEmail(data);
  it('indeholder Tour-vinderen, trøjerne, etapesejrene og ligaen', () => {
    expect(html).toContain('Vinder af Tour de France 2026');
    expect(html).toContain('Pogacar');
    expect(html).toContain('Gul trøje');
    expect(html).toContain('Grøn trøje');
    expect(html).toContain('Girmay');
    expect(html).toContain('Etapesejre');
    expect(html).toContain('Philipsen');
    expect(html).toContain('Kontoret');
    expect(html).toContain('Anders');
  });
  it('markerer top 3 med medaljer og modtageren (· dig)', () => {
    expect(html).toContain('🥇');
    expect(html).toContain('🥈');
    expect(html).toContain('🥉');
    expect(html).toContain('· dig');
  });
  it('slutbemærkningen er "Vi ses måske til næste udgave!"', () => {
    expect(html).toContain('Vi ses måske til næste udgave!');
  });
  it('viser løbet i tal (etaper, distance, etapevindere)', () => {
    expect(html).toContain('3320 km');
    expect(html).toContain('forskellige etapevindere');
    expect(html).toContain('Mest vindende hold');
  });
  it('udelader gul trøje-banneret uden GC-podie', () => {
    const noGc = renderThankYouEmail({ ...data, gcPodium: null });
    expect(noGc).not.toContain('Vinder af Tour de France 2026');
    expect(noGc).toContain('Vi ses måske til næste udgave!');
  });
  it('er en komplet HTML-mail', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html.trim().endsWith('</html>')).toBe(true);
  });
});
