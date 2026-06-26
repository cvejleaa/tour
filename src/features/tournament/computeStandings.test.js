// ---------------------------------------------------------------------------
// Tests for computeGroupStandings og grupperEfterGruppe.
// Ingen Firebase – rene funktioner med testdata.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  computeGroupStandings,
  grupperEfterGruppe,
} from './computeStandings';

// --- Hjælper til at lave en testkamp ---
function lavKamp(homeTeam, awayTeam, status, hjemmeMål, udeMål, groupName = 'A') {
  return {
    round: 'group',
    groupName,
    homeTeam,
    awayTeam,
    status,
    result:
      status === 'finished' && hjemmeMål != null
        ? { home: hjemmeMål, away: udeMål }
        : null,
    kickoff: '2026-06-11T23:00:00Z',
  };
}

// ─── computeGroupStandings ────────────────────────────────────────────────

describe('computeGroupStandings', () => {
  it('registrerer alle hold fra kampe (også uden resultat)', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'scheduled', null, null),
    ];
    const stilling = computeGroupStandings(kampe);
    const hold = stilling.map((r) => r.team);
    expect(hold).toContain('ARG');
    expect(hold).toContain('BRA');
  });

  it('kampe uden status finished tæller ikke', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'scheduled', 2, 0),
      lavKamp('ARG', 'BRA', 'live', 1, 0),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    expect(arg.played).toBe(0);
    expect(arg.points).toBe(0);
  });

  it('kampe med status finished men null result tæller ikke', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', null, null),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    expect(arg.played).toBe(0);
    expect(arg.points).toBe(0);
  });

  it('sejr giver 3 point til vinder og 0 til taber', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 2, 1),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(arg.won).toBe(1);
    expect(arg.points).toBe(3);
    expect(arg.gf).toBe(2);
    expect(arg.ga).toBe(1);

    expect(bra.lost).toBe(1);
    expect(bra.points).toBe(0);
    expect(bra.gf).toBe(1);
    expect(bra.ga).toBe(2);
  });

  it('udesejr giver 3 point til udehold og 0 til hjemmehold', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 0, 3),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(bra.won).toBe(1);
    expect(bra.points).toBe(3);
    expect(arg.lost).toBe(1);
    expect(arg.points).toBe(0);
  });

  it('uafgjort giver 1 point til begge hold', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 1, 1),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(arg.drawn).toBe(1);
    expect(arg.points).toBe(1);
    expect(bra.drawn).toBe(1);
    expect(bra.points).toBe(1);
  });

  it('beregner målforskel korrekt', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 3, 1),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(arg.gd).toBe(2);   // 3 - 1
    expect(bra.gd).toBe(-2);  // 1 - 3
  });

  it('sorterer korrekt: point først, derefter målforskel', () => {
    // ARG: 3+1 = 4 point, gd = +2+0 = +2
    // BRA: 3 point, gd = +1
    // CHI: 0 point
    const kampe = [
      lavKamp('ARG', 'CHI', 'finished', 2, 0),
      lavKamp('ARG', 'BRA', 'finished', 1, 1), // ARG uafgjort med BRA
      lavKamp('BRA', 'CHI', 'finished', 2, 1),
    ];
    const stilling = computeGroupStandings(kampe);

    expect(stilling[0].team).toBe('ARG');  // 4 point, gd=+1
    expect(stilling[1].team).toBe('BRA');  // 4 point – nej: BRA har 3+1=4? Lad os tjekke
    // ARG: vandt CHI (+3pt), uafgjort BRA (+1pt) = 4pt, gf=3, ga=1, gd=+2
    // BRA: uafgjort ARG (+1pt), vandt CHI (+3pt) = 4pt, gf=3, ga=2, gd=+1
    // CHI: 0pt
    // Sortering: ARG og BRA begge 4pt → gd: ARG +2 > BRA +1 → ARG først
    expect(stilling[0].team).toBe('ARG');
    expect(stilling[1].team).toBe('BRA');
    expect(stilling[2].team).toBe('CHI');
  });

  it('bruger scorede mål som tiebreak når point og målforskel er ens', () => {
    // ARG og BRA: begge 3 point, gd = +2, men ARG scorede 4, BRA scorede 2
    const kampe = [
      lavKamp('ARG', 'CHI', 'finished', 4, 2),  // ARG vinder 4-2 (gd +2, gf 4)
      lavKamp('BRA', 'PER', 'finished', 2, 0),   // BRA vinder 2-0 (gd +2, gf 2)
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(arg.points).toBe(3);
    expect(bra.points).toBe(3);
    expect(arg.gd).toBe(2);
    expect(bra.gd).toBe(2);
    expect(arg.gf).toBe(4);
    expect(bra.gf).toBe(2);

    // ARG bør stå over BRA (flere scorede mål)
    const argIdx = stilling.indexOf(arg);
    const braIdx = stilling.indexOf(bra);
    expect(argIdx).toBeLessThan(braIdx);
  });

  it('bruger landenavn som endelig tiebreak', () => {
    // ARG (Argentina) og GER (Tyskland) – begge 3pt, gd=+2, gf=2
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 2, 0),
      lavKamp('GER', 'FRA', 'finished', 2, 0),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const ger = stilling.find((r) => r.team === 'GER');

    // Argentina < Tyskland alfabetisk → ARG bør stå øverst
    const argIdx = stilling.indexOf(arg);
    const gerIdx = stilling.indexOf(ger);
    expect(argIdx).toBeLessThan(gerIdx);
  });

  it('akkumulerer stats korrekt over flere kampe', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 2, 1), // ARG vinder
      lavKamp('ARG', 'CHI', 'finished', 1, 0), // ARG vinder
      lavKamp('BRA', 'CHI', 'finished', 0, 0), // uafgjort
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');

    expect(arg.played).toBe(2);
    expect(arg.won).toBe(2);
    expect(arg.drawn).toBe(0);
    expect(arg.lost).toBe(0);
    expect(arg.gf).toBe(3);
    expect(arg.ga).toBe(1);
    expect(arg.gd).toBe(2);
    expect(arg.points).toBe(6);
  });

  it('returnerer tom liste ved ingen kampe', () => {
    expect(computeGroupStandings([])).toEqual([]);
  });

  it('hvert række-objekt har de forventede felter', () => {
    const kampe = [lavKamp('ARG', 'BRA', 'finished', 1, 0)];
    const stilling = computeGroupStandings(kampe);
    const forventedeNøgler = ['team', 'played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'points'];
    for (const nøgle of forventedeNøgler) {
      expect(stilling[0]).toHaveProperty(nøgle);
    }
  });

  it('tæller korrekt med live-status (ikke finished)', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'live', 2, 0), // ignoreres
      lavKamp('ARG', 'CHI', 'finished', 1, 1), // tæller
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    // Kun den finished kamp tæller
    expect(arg.played).toBe(1);
    expect(arg.drawn).toBe(1);
    expect(arg.points).toBe(1);
  });

  it('ignorerer kamp med result.home ikke-numerisk', () => {
    const kampe = [
      {
        round: 'group',
        groupName: 'A',
        homeTeam: 'ARG',
        awayTeam: 'BRA',
        status: 'finished',
        result: { home: 'TBD', away: 0 },
        kickoff: '2026-06-11T23:00:00Z',
      },
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    expect(arg.played).toBe(0);
  });

  it('beregner gd korrekt for alle hold', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 3, 0), // ARG gd=+3, BRA gd=-3
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');
    expect(arg.gd).toBe(3);
    expect(bra.gd).toBe(-3);
    // Summen af alle gd bør altid være 0
    const totalGd = stilling.reduce((sum, r) => sum + r.gd, 0);
    expect(totalGd).toBe(0);
  });

  it('0-0 uafgjort registreres korrekt', () => {
    const kampe = [lavKamp('ARG', 'BRA', 'finished', 0, 0)];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');
    expect(arg.drawn).toBe(1);
    expect(arg.points).toBe(1);
    expect(arg.gf).toBe(0);
    expect(arg.ga).toBe(0);
    expect(bra.drawn).toBe(1);
  });

  it('ignorerer kamp med null homeTeam', () => {
    const kampe = [
      {
        round: 'group',
        groupName: 'A',
        homeTeam: null,
        awayTeam: 'BRA',
        status: 'finished',
        result: { home: 1, away: 0 },
        kickoff: '2026-06-11T23:00:00Z',
      },
    ];
    // hentHold(null) returnerer null → kampen springes over
    expect(() => computeGroupStandings(kampe)).not.toThrow();
  });
});

// ─── grupperEfterGruppe ───────────────────────────────────────────────────

describe('grupperEfterGruppe', () => {
  it('ignorerer ikke-gruppe-kampe', () => {
    const kampe = [
      { round: 'r32', groupName: null, homeTeam: 'ARG', awayTeam: 'BRA', status: 'pendingTeams', result: null },
      { round: 'group', groupName: 'A', homeTeam: 'MEX', awayTeam: 'USA', status: 'scheduled', result: null },
    ];
    const gruppeMap = grupperEfterGruppe(kampe);
    expect(gruppeMap.size).toBe(1);
    expect(gruppeMap.has('A')).toBe(true);
  });

  it('samler kampe under korrekt gruppenavn', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'scheduled', null, null, 'B'),
      lavKamp('PER', 'CHI', 'scheduled', null, null, 'B'),
      lavKamp('MEX', 'USA', 'scheduled', null, null, 'A'),
    ];
    const gruppeMap = grupperEfterGruppe(kampe);
    expect(gruppeMap.get('B')).toHaveLength(2);
    expect(gruppeMap.get('A')).toHaveLength(1);
  });

  it('sorterer grupper alfabetisk (A, B, C ...)', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'scheduled', null, null, 'C'),
      lavKamp('MEX', 'USA', 'scheduled', null, null, 'A'),
      lavKamp('GER', 'FRA', 'scheduled', null, null, 'B'),
    ];
    const gruppeMap = grupperEfterGruppe(kampe);
    const nøgler = [...gruppeMap.keys()];
    expect(nøgler).toEqual(['A', 'B', 'C']);
  });

  it('returnerer tom Map ved tom input', () => {
    const gruppeMap = grupperEfterGruppe([]);
    expect(gruppeMap.size).toBe(0);
  });

  it('ignorerer kampe uden groupName', () => {
    const kampe = [
      { round: 'group', groupName: null, homeTeam: 'ARG', awayTeam: 'BRA', status: 'scheduled', result: null },
      lavKamp('MEX', 'USA', 'scheduled', null, null, 'A'),
    ];
    const gruppeMap = grupperEfterGruppe(kampe);
    expect(gruppeMap.size).toBe(1);
    expect(gruppeMap.has('A')).toBe(true);
  });

  it('returnerer Map (ikke Array)', () => {
    const gruppeMap = grupperEfterGruppe([lavKamp('ARG', 'BRA', 'scheduled', null, null, 'A')]);
    expect(gruppeMap instanceof Map).toBe(true);
  });

  it('inkluderer kampe uden resultat i gruppen', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'scheduled', null, null, 'A'),
      lavKamp('CHI', 'PER', 'finished', 1, 0, 'A'),
    ];
    const gruppeMap = grupperEfterGruppe(kampe);
    expect(gruppeMap.get('A')).toHaveLength(2);
  });

  it('håndterer mange grupper (A-L)', () => {
    const grupper = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const kampe = grupper.map((g) => lavKamp('ARG', 'BRA', 'scheduled', null, null, g));
    const gruppeMap = grupperEfterGruppe(kampe);
    expect(gruppeMap.size).toBe(12);
    expect([...gruppeMap.keys()]).toEqual(grupper);
  });
});
