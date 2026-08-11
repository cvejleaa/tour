// ---------------------------------------------------------------------------
// EN LIGAS POINT, NÅR DEN STARTER SENERE END SPILLET.
//
// Tallene er ikke opfundet: `perRound` skrives af serveren sammen med totalen,
// og summen herunder skal give NØJAGTIG spillets total, når ligaen ikke har en
// startrunde. Gør den ikke det, står den samme spiller med to forskellige tal
// på to faner — den fejl, hele formen blev valgt for at undgå.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  ligaPoint, puljenTaeller, harRundeVektor, PULJE_MAKS_STARTRUNDE, UDEN_RUNDE,
} from './ligaPoint';
import { opdelPoint, buildRoundContext } from './pointOpdeling';

describe('ligaPoint', () => {
  const VEKTOR = { 1: 10, 2: 5, 3: -2, 4: 8 };

  it('lægger alle runder sammen uden en startrunde', () => {
    expect(ligaPoint(VEKTOR, null)).toBe(21);
    expect(ligaPoint(VEKTOR, undefined)).toBe(21);
  });

  it('udelader runderne FØR startrunden', () => {
    expect(ligaPoint(VEKTOR, 2)).toBe(11);
    expect(ligaPoint(VEKTOR, 3)).toBe(6);
    expect(ligaPoint(VEKTOR, 4)).toBe(8);
    expect(ligaPoint(VEKTOR, 5)).toBe(0);
  });

  it('tager startrunden SELV med', () => {
    // `r < startRunde` og ikke `<=`. Ligaen starter VED runde 2, ikke efter.
    expect(ligaPoint({ 2: 7 }, 2)).toBe(7);
  });

  // Samme beslutning som gatens: `foerStart` rører aldrig en kamp uden runde,
  // fordi `null < n` og `undefined < n` ikke svarer ens. Point fra sådan en
  // kamp må ikke forsvinde, bare fordi en liga starter sent.
  it('tager kampe uden rundenummer med, uanset startrunde', () => {
    const v = { 1: 10, [UDEN_RUNDE]: 3 };
    expect(ligaPoint(v, null)).toBe(13);
    expect(ligaPoint(v, 99)).toBe(3);
  });

  it('gulver ved 0 ÉN gang, på summen', () => {
    // En tabt Chancen i runde 5 må trække fra runde 4's gevinst. Gulvedes hver
    // runde for sig, ville ligaens total blive HØJERE end spillets.
    expect(ligaPoint({ 4: 8, 5: -20 }, null)).toBe(0);
    expect(ligaPoint({ 4: 8, 5: -3 }, null)).toBe(5);
  });

  it('ser bort fra nøgler, der ikke er runder', () => {
    expect(ligaPoint({ 1: 5, pulje: 34, ukendt: 100 }, null)).toBe(5);
  });

  it('tåler at vektoren mangler', () => {
    expect(ligaPoint(null, 2)).toBe(0);
    expect(ligaPoint(undefined, null, 5)).toBe(5);
  });
});

describe('puljen', () => {
  it('tæller med til og med den valgte grænse', () => {
    expect(ligaPoint({ 5: 10 }, 3, 34)).toBe(44);
    expect(ligaPoint({ 5: 10 }, 4, 34)).toBe(10);
  });

  it('tæller altid med for en liga uden startrunde', () => {
    expect(puljenTaeller(null)).toBe(true);
    expect(ligaPoint({ 1: 10 }, null, 34)).toBe(44);
  });

  it('følger grænsen på begge sider', () => {
    expect(puljenTaeller(PULJE_MAKS_STARTRUNDE)).toBe(true);
    expect(puljenTaeller(PULJE_MAKS_STARTRUNDE + 1)).toBe(false);
  });

  // GRÆNSEN ER ET VALG MED ET SLÆK — og slækket skal stå sort på hvidt.
  //
  // Superligaens `puljeLockAt` er 1. august 15:59 UTC, altså LIGE FØR runde 2
  // (første kamp 16:00 UTC). Strengt taget kunne kun en liga fra runde 2 have
  // haft alle medlemmer inde før deadline. Ejeren har valgt 3, altså ét rundes
  // slæk.
  //
  // TESTEN DOKUMENTERER — DEN BINDER IKKE. `puljeLockAt` er admin-sat
  // produktionsdata; flyttes deadlinen i admin, bliver intet her rødt. Datoen
  // herunder er en afskrift af, hvad der stod, da grænsen blev valgt, så
  // regnestykket bag slækket kan efterprøves — ikke en vagt mod ændringer.
  it('giver præcis ét rundes slæk i forhold til puljens deadline', () => {
    const PULJE_LUKKER = Date.parse('2026-08-01T15:59:00Z');
    const RUNDE_2_START = Date.parse('2026-08-01T16:00:00Z');
    expect(PULJE_LUKKER).toBeLessThan(RUNDE_2_START);
    // Deadline ligger før runde 2 → den "rene" grænse ville være 2.
    const RENE_GRAENSE = 2;
    expect(PULJE_MAKS_STARTRUNDE).toBe(RENE_GRAENSE + 1);
    // …og slækket er præcis én runde: en liga fra runde 3 beholder puljen,
    // en fra runde 4 gør ikke.
    expect(puljenTaeller(3)).toBe(true);
    expect(puljenTaeller(4)).toBe(false);
  });
});

describe('harRundeVektor', () => {
  it('skelner "ikke beregnet endnu" fra "nul point"', () => {
    // En spiller, der ikke er genberegnet, har feltet slet ikke. Fladen skal
    // kunne sige "ikke klar" i stedet for at påstå nul — samme mønster som
    // `opdeling` allerede har i gameStandings.js.
    expect(harRundeVektor(undefined)).toBe(false);
    expect(harRundeVektor(null)).toBe(false);
    expect(harRundeVektor([])).toBe(false);
    expect(harRundeVektor({})).toBe(true);
    expect(harRundeVektor({ 1: 5 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DEN BÆRENDE: SUMMEN SKAL RAMME SPILLETS EGEN TOTAL.
//
// `perRound` og `total` regnes af det samme kald, men ad hver sin vej: totalen
// af `raw + combi + pulje`, vektoren af bets grupperet på runde plus combi pr.
// runde. Driver de fra hinanden, ser en spiller ét tal i stillingen og et
// andet i sin liga — uden at noget fejler.
// ---------------------------------------------------------------------------
describe('runde-vektoren summer til spillets total', () => {
  const NU = Date.parse('2026-09-01T12:00:00Z');
  const KAMPE = [
    { id: 'm1', round: 1, result: '1', odds: { 1: 2.17, X: 4, 2: 4 }, kickoff: 1000 },
    { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.33, 2: 4 }, kickoff: 1100 },
    { id: 'm3', round: 2, result: '2', odds: { 1: 4, X: 4, 2: 2.5 }, kickoff: 2000 },
    { id: 'm4', round: 2, result: '1', odds: { 1: 1.9, X: 4, 2: 4 }, kickoff: 2100 },
  ];
  const BETS = [
    { matchId: 'm1', pick: '1', points: 5.42 },
    { matchId: 'm2', pick: 'X', points: 4.33 },
    { matchId: 'm3', pick: '2', points: 3.5 },
    { matchId: 'm4', pick: '2', points: -2 }, // tabt Chancen
  ];

  const kald = (puljeBonus = 0) => opdelPoint({
    bets: BETS, roundCtx: buildRoundContext(KAMPE), puljeBonus, nowMs: NU,
  });

  it('rammer totalen uden startrunde', () => {
    const o = kald(12);
    expect(ligaPoint(o.perRunde, null, 12)).toBe(o.total);
  });

  it('rammer totalen også uden pulje', () => {
    const o = kald(0);
    expect(ligaPoint(o.perRunde, null, 0)).toBe(o.total);
  });

  it('bliver MINDRE, når ligaen starter senere', () => {
    const o = kald(0);
    const hele = ligaPoint(o.perRunde, null, 0);
    const fra2 = ligaPoint(o.perRunde, 2, 0);
    expect(fra2).toBeLessThan(hele);
    // …og runde 1's andel er præcis forskellen.
    expect(Math.round((hele - fra2) * 10) / 10).toBe(o.perRunde['1']);
  });

  it('lægger rundens combi i DEN runde, den blev vundet i', () => {
    const o = kald(0);
    // Runde 1: begge ramt → combi. Runde 2: én ramt, én tabt → ingen combi.
    // Runde 1's andel skal derfor være større end de rå bet-point alene.
    expect(o.perRunde['1']).toBeGreaterThan(5.42 + 4.33);
    expect(o.perRunde['2']).toBeCloseTo(3.5 - 2, 1);
    // BÆRENDE: combien må ikke havne i runde 2 — så ville en liga fra runde 2
    // arve en bonus, den ikke var med til at vinde.
    expect(o.perRunde['2']).toBeLessThan(o.perRunde['1']);
  });

  // SPEJLBILLEDET af testen ovenfor — og den er ikke pynt. Fixturet ovenfor
  // vinder kun combi i runde 1, så mutationen "læg AL combi i runde 1" bestod
  // med grøn suite: der var ingen combi andre steder at flytte. Her vindes den
  // i runde 2, og BEGGE runder er sømmet fast med præcise tal.
  it('lægger combien i runde 2, når den vindes DÉR — og runde 1 får intet', () => {
    const bets = [
      { matchId: 'm1', pick: '1', points: 5.42 }, // ramt
      { matchId: 'm2', pick: '1', points: 0 },    // forbi → ingen combi i runde 1
      { matchId: 'm3', pick: '2', points: 3.5 },  // ramt
      { matchId: 'm4', pick: '1', points: 2.9 },  // ramt → combi i runde 2
    ];
    const o = opdelPoint({ bets, roundCtx: buildRoundContext(KAMPE), puljeBonus: 0, nowMs: NU });
    // Runde 1: KUN de rå point — 5,4. Får den så meget som en tiendedel combi,
    // er bonussen havnet i en runde, den ikke blev vundet i.
    expect(o.perRunde['1']).toBe(5.4);
    // Runde 2: rå 3,5 + 2,9 = 6,4 PLUS combi — altså skarpt over 6,4.
    expect(o.perRunde['2']).toBeGreaterThan(6.4);
    // …og en liga fra runde 2 får hele sin combi med.
    expect(ligaPoint(o.perRunde, 2, 0)).toBe(o.perRunde['2']);
  });
});
