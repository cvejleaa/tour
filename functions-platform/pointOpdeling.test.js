import { describe, it, expect } from 'vitest';
import { opdelPoint, combiBonus, buildRoundContext } from './pointOpdeling.js';

// Ét regnestykke for "hvor kommer pointene fra". Det fandtes før to steder ad
// hver sin vej — og de var allerede uenige om puljebonussen.

const NU = Date.parse('2026-08-02T18:00:00Z');
const foer = NU - 60 * 60_000;

/**
 * Runde-kontekst bygget af den ÆGTE buildRoundContext, ikke i hånden.
 *
 * En håndbygget kontekst kender ikke de felter, funktionen udleder — fx om en
 * kamp står på combi-kuponen — og så består testen uden at røre den kode, den
 * påstår at teste. Den fejl har filen været i før.
 *
 * Kampe uden eksplicit kickoff får ét fælles tidspunkt, så de havner i samme
 * uge og dermed på samme kupon. Vil man teste en splittet runde, sætter man
 * kickoff selv.
 */
function ctx(matches) {
  return buildRoundContext(matches.map((m) => ({
    ...m,
    kickoff: 'kickoff' in m ? m.kickoff : foer,
  })));
}

describe('opdelPoint', () => {
  it('deler point op i 1X2 og Chancen', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } }]);
    // 3,5 for 1X2 (odds 2,5 + træf-bonus 1) + 2,0 fra Chancen = 5,5 på tippet.
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: 5.5 }], roundCtx, nowMs: NU });
    expect(res.p1x2).toBe(3.5);
    expect(res.chance).toBe(2);
    expect(res.total).toBe(5.5);
  });

  // Chancen UDLEDES. Serveren afregner med clampStake uden bank-loft, så en
  // genberegning ville give et andet tal — og delene ville ikke summe til
  // totalen, som stillingen viser.
  it('udleder Chancen af de gemte point, i stedet for at regne den ud igen', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } }]);
    // Et vildt indsats-tal på tippet må ikke påvirke resultatet — kun points gør.
    const res = opdelPoint({
      bets: [{ matchId: 'm1', pick: '1', points: 9.9, chanceStake: 999 }], roundCtx, nowMs: NU,
    });
    expect(res.p1x2).toBe(3);    // odds 2,0 + træf-bonus 1
    expect(res.chance).toBe(6.9);
    expect(res.total).toBe(9.9);
  });

  it('giver et negativt Chancen-tal, når indsatsen blev tabt', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: 'X', odds: { 1: 2.0, X: 4, 2: 4 } }]);
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: -3 }], roundCtx, nowMs: NU });
    expect(res.p1x2).toBe(0);   // ramte ikke
    expect(res.chance).toBe(-3);
    expect(res.total).toBe(0);  // gulvet — saldoen går aldrig i minus
  });

  it('tæller ikke kampe uden facit', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: null, odds: { 1: 2.5, X: 4, 2: 4 } }]);
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: 0 }], roundCtx, nowMs: NU });
    expect(res.kampe).toHaveLength(0);
    expect(res.total).toBe(0);
  });

  // De to filtre er ADSKILTE, og det er hele pointen. Rækken må ikke vises —
  // men POINTENE skal tælle. Blandede man dem, ville kickoff gate totalen, og
  // flytter ligaen en kamp tidligere end vores gemte tidspunkt, ville alle
  // tippere tavst miste deres point for den kamp i stillingen.
  it('viser ikke rækken, når kickoff ligger i fremtiden — men beholder pointene', () => {
    const roundCtx = ctx([{
      id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 }, kickoff: NU + 60 * 60_000,
    }]);
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: 3.5 }], roundCtx, nowMs: NU });
    expect(res.kampe).toHaveLength(0); // ikke synlig for andre
    expect(res.p1x2).toBe(3.5);        // men pointene er der (odds 2,5 + 1)
    expect(res.total).toBe(3.5);
  });

  // Et ulæseligt kickoff skal betyde "vis ikke", ikke "vis alligevel".
  it('viser ikke rækken, når kickoff mangler — men beholder pointene', () => {
    const roundCtx = ctx([{
      id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 }, kickoff: null,
    }]);
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: 2.5 }], roundCtx, nowMs: NU });
    expect(res.kampe).toHaveLength(0);
    expect(res.total).toBe(2.5);
  });

  // Combi regnes på alle AFGJORTE kampe, ikke kun de synlige. Ellers ville en
  // kamp med et ulæseligt kickoff koste spilleren hans rundebonus.
  it('giver stadig combi, når en af rundens kampe ikke må vises', () => {
    const roundCtx = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 }, kickoff: null },
    ]);
    const res = opdelPoint({
      bets: [
        { matchId: 'm1', pick: '1', points: 2 },
        { matchId: 'm2', pick: 'X', points: 3 },
      ],
      roundCtx,
      nowMs: NU,
    });
    expect(res.kampe).toHaveLength(1);    // kun m1 må vises
    expect(res.combi).toBeGreaterThan(0); // men bonussen er intakt
  });

  // TOTALEN ER STILLINGEN. Den regnes af de gemte bet-point, ikke af
  // rubrikkerne — ellers ville en ufuldstændig kamplæsning eller et slettet
  // kampdokument nulstille spillerens point, tavst. Rubrikkerne er
  // best-effort; totalen må aldrig være det.
  it('beholder pointene i totalen, selv om konteksten ikke kender kampen', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } }]);
    const res = opdelPoint({ bets: [{ matchId: 'ukendt', pick: '1', points: 5 }], roundCtx, nowMs: NU });
    expect(res.total).toBe(5);   // pointene overlever
    expect(res.p1x2).toBe(0);    // men kan ikke placeres i en rubrik
    expect(res.kampe).toHaveLength(0);
  });

  it('nulstiller ikke totalen, når runde-konteksten er helt tom', () => {
    const res = opdelPoint({
      bets: [{ matchId: 'm1', pick: '1', points: 4 }], roundCtx: null, nowMs: NU,
    });
    expect(res.total).toBe(4);
  });

  // Rubrikkerne er IKKE altid ét decimal i forvejen: chance er
  // (gemte point − afrundet odds), og summer af ét-decimals odds bærer
  // float-støj. Uden round1 pr. rubrik ville skærmen vise 3.3000000000000003.
  it('afrunder hver rubrik for sig', () => {
    const roundCtx = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 1.1, X: 4, 2: 4 } },
      { id: 'm2', round: 2, result: '1', odds: { 1: 1.1, X: 4, 2: 4 } },
      { id: 'm3', round: 3, result: '1', odds: { 1: 1.1, X: 4, 2: 4 } },
    ]);
    const res = opdelPoint({
      bets: [
        { matchId: 'm1', pick: '1', points: 2.1 },
        { matchId: 'm2', pick: '1', points: 2.1 },
        { matchId: 'm3', pick: '1', points: 2.1 },
      ],
      roundCtx,
      nowMs: NU,
    });
    expect(res.p1x2).toBe(6.3); // 3 × (1,1 + 1) — ikke 6.300000000000001
  });

  it('afrunder Chancen, som er en forskel mellem to tal', () => {
    // odds 3.33 → 1X2-point afrundes til 3,3 og får træf-bonus → 4,3.
    const roundCtx = ctx([{ id: 'm1', round: 1, result: 'X', odds: { 1: 4, X: 3.33, 2: 4 } }]);
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: 'X', points: 4.33 }], roundCtx, nowMs: NU });
    expect(res.p1x2).toBe(4.3);
    expect(res.chance).toBe(0);  // 4.33 − 4.3 = 0.03 → afrundet 0
  });

  it('lægger puljebonussen med i totalen', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } }]);
    const res = opdelPoint({
      bets: [{ matchId: 'm1', pick: '1', points: 2.5 }], roundCtx, puljeBonus: 24, nowMs: NU,
    });
    expect(res.pulje).toBe(24);
    expect(res.total).toBe(26.5);
  });

  // Den fejl, modulet findes for: tipsHistory regnede totalen UDEN pulje,
  // mens stillingen regnede den MED. Samme spiller, to tal, én fane imellem.
  it('regner totalen som stillingen gør — ikke som tipsHistory gjorde', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } }]);
    const bets = [{ matchId: 'm1', pick: '1', points: 2.5 }];
    const medPulje = opdelPoint({ bets, roundCtx, puljeBonus: 10, nowMs: NU });
    const udenPulje = opdelPoint({ bets, roundCtx, puljeBonus: 0, nowMs: NU });
    expect(medPulje.total - udenPulje.total).toBe(10);
  });

  // Gulvet er en FEATURE (saldoen går aldrig i minus), men det gør, at
  // rubrikkerne kan summe til noget helt andet end totalen. Fladen skal kunne
  // forklare det, og derfor leveres den rå sum ved siden af.
  it('leverer den rå sum ved siden af den gulvede total', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: 'X', odds: { 1: 2.0, X: 4, 2: 4 } }]);
    const res = opdelPoint({
      bets: [{ matchId: 'm1', pick: '1', points: -20 }], roundCtx, puljeBonus: 8.5, nowMs: NU,
    });
    expect(res.total).toBe(0);          // saldoen kan ikke gå i minus
    expect(res.raaTotal).toBe(-11.5);   // men regnestykket bag er synligt
  });

  it('lader rå sum og total være ens, når gulvet ikke rammer', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } }]);
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: 2.5 }], roundCtx, nowMs: NU });
    expect(res.raaTotal).toBe(res.total);
  });

  it('gulver totalen ved 0 og runder én gang', () => {
    const roundCtx = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 1.1, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: '1', odds: { 1: 1.1, X: 4, 2: 4 } },
    ]);
    const res = opdelPoint({
      bets: [
        { matchId: 'm1', pick: '2', points: -8.05 },
        { matchId: 'm2', pick: '2', points: -4.05 },
      ],
      roundCtx,
      nowMs: NU,
    });
    expect(res.total).toBe(0);
    expect(Number.isFinite(res.chance)).toBe(true);
  });

  // Rubrikkerne afrundes hver for sig, fordi de vises. Totalen afrundes én
  // gang. De to kan derfor afvige nogle tiendedele — det er KENDT og bundet,
  // ikke noget vi opdager i produktion.
  it('holder afvigelsen mellem summen af rubrikker og totalen under 0,2', () => {
    const roundCtx = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 1.17, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.33, 2: 4 } },
    ]);
    const res = opdelPoint({
      bets: [
        { matchId: 'm1', pick: '1', points: 1.24 },
        { matchId: 'm2', pick: 'X', points: 3.38 },
      ],
      roundCtx,
      puljeBonus: 0.05,
      nowMs: NU,
    });
    const sum = res.p1x2 + res.chance + res.combi + res.pulje;
    expect(Math.abs(sum - res.total)).toBeLessThanOrEqual(0.2);
  });
});

describe('combiBonus', () => {
  const runde = ctx([
    { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
    { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
  ]);

  it('giver bonus, når hele runden er tippet og ramt', () => {
    const bets = [{ matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }];
    expect(combiBonus(bets, runde)).toBeGreaterThan(0);
  });

  it('giver ingen bonus, når spilleren ikke tippede hele runden', () => {
    expect(combiBonus([{ matchId: 'm1', pick: '1' }], runde)).toBe(0);
  });

  it('giver ingen bonus, før hele runden er afgjort', () => {
    const halv = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: null, odds: { 1: 4, X: 3.0, 2: 4 } },
    ]);
    expect(combiBonus([{ matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }], halv)).toBe(0);
  });

  // To afgjorte runder skal LÆGGES SAMMEN. Med kun ét runde-fixture kunne
  // summen erstattes af "sidste runde vinder", uden at én test faldt.
  it('lægger bonus sammen på tværs af flere afgjorte runder', () => {
    const toRunder = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
      { id: 'm3', round: 2, result: '1', odds: { 1: 1.5, X: 4, 2: 4 } },
      { id: 'm4', round: 2, result: '2', odds: { 1: 4, X: 4, 2: 2.0 } },
    ]);
    const bets = [
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' },
      { matchId: 'm3', pick: '1' }, { matchId: 'm4', pick: '2' },
    ];
    // 2·√(2,0×3,0) + 2·√(1,5×2,0) = 4,9 + 3,5
    expect(combiBonus(bets, toRunder)).toBe(8.4);
  });

  // ÉN fejl må kun gange de RAMTE odds med. Seks kampe, fordi en to-kamps
  // runde med én fejl kun har ét ramt tip — og ét tip er ingen kupon.
  it('ganger kun de ramte odds ved én fejl', () => {
    const kampe = [0, 1, 2, 3, 4, 5].map((i) => ({
      id: `k${i}`, round: 9, result: '1', odds: { 1: 1.5, X: 4, 2: 4 },
    }));
    const seks = ctx(kampe);
    const tip = (forkerte) => kampe.map((m, i) => ({
      matchId: m.id, pick: i < forkerte ? 'X' : '1',
    }));
    expect(combiBonus(tip(0), seks)).toBe(6.8); // 2·√(1,5^6)
    expect(combiBonus(tip(1), seks)).toBe(5.5); // 2·√(1,5^5)
    expect(combiBonus(tip(4), seks)).toBe(3);   // 2·√(1,5^2) — hver ramt tæller
  });

  // Et tip på en SLETTET kamp må ikke smugles ind i en runde. Gør det det,
  // passer antallet ikke længere, og spilleren mister hele rundens bonus.
  it('ser bort fra tips på kampe, konteksten ikke kender', () => {
    const bets = [
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' },
      { matchId: 'slettet', pick: '1' },
    ];
    expect(combiBonus(bets, runde)).toBe(4.9); // 2·√(2,0×3,0) — den slettede tæller ikke
  });

  // Kampe UDEN rundenummer må aldrig give combi. Jeg påstod i en commit, at
  // det fulgte af sig selv — det gjorde det ikke. Uden vagten i
  // buildRoundContext samles de i én pseudo-runde, og bonussen udbetales for
  // kampe, der ikke hører sammen: to facit-kampe uden runde gav 9 point ud af
  // ingenting.
  it('giver ingen combi for kampe uden rundenummer', () => {
    const uden = {
      byMatch: {
        m1: { round: null, result: '1', odds: { 1: 3.0, X: 4, 2: 4 }, kickoff: foer },
        m2: { round: null, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 }, kickoff: foer },
      },
      rounds: {},
    };
    const bets = [{ matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }];
    expect(combiBonus(bets, uden)).toBe(0);

    // …men pointene tæller stadig i totalen.
    const res = opdelPoint({
      bets: [{ matchId: 'm1', pick: '1', points: 3 }, { matchId: 'm2', pick: 'X', points: 3 }],
      roundCtx: uden,
      nowMs: NU,
    });
    expect(res.combi).toBe(0);
    expect(res.total).toBe(6);
  });
});

// Hovedreglen efter august 2026: der er INTET kuponkrav. Den stod før kun
// prøvet ét sted, og en regel, der kun én test holder fast i, er en regel på
// vej ud igen.
describe('combiBonus — uden kuponkrav', () => {
  const runde = [
    { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
    { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
    { id: 'm3', round: 1, result: '2', odds: { 1: 4, X: 4, 2: 2.5 } },
  ];
  const c = () => ctx(runde);

  it('betaler for to ramte, selv om tredje kamp aldrig blev tippet', () => {
    // 2·√(2,0×3,0) = 4,9. Den glemte kamp koster ingenting.
    expect(combiBonus([
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' },
    ], c())).toBe(4.9);
  });

  it('giver præcis det samme, som hvis den tredje var tippet forkert', () => {
    const glemt = combiBonus([
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' },
    ], c());
    const forbi = combiBonus([
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }, { matchId: 'm3', pick: '1' },
    ], c());
    expect(glemt).toBe(forbi);
  });

  it('vokser, når man tipper og rammer flere', () => {
    const to = combiBonus([
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' },
    ], c());
    const tre = combiBonus([
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }, { matchId: 'm3', pick: '2' },
    ], c());
    expect(tre).toBeGreaterThan(to);
  });

  it('tæller et dublet-bet én gang', () => {
    const en = combiBonus([
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' },
    ], c());
    const dublet = combiBonus([
      { matchId: 'm1', pick: '1' }, { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' },
    ], c());
    expect(dublet).toBe(en);
  });

  it('venter stadig på, at hele kuponen er afgjort', () => {
    const halv = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: null, odds: { 1: 4, X: 3.0, 2: 4 } },
      { id: 'm3', round: 1, result: '2', odds: { 1: 4, X: 4, 2: 2.5 } },
    ]);
    expect(combiBonus([
      { matchId: 'm1', pick: '1' }, { matchId: 'm3', pick: '2' },
    ], halv)).toBe(0);
  });
});

describe('spejling mod src/lib', () => {
  // EN TABEL, ikke ét lykkeligt tilfælde. Med kun ét fixture — begge kampe
  // afgjorte, i fortiden, positiv total — kunne både kickoff-vagten og gulvet
  // ved 0 fjernes i den ene fil, uden at pariteten opdagede det. Hvert
  // tilfælde herunder rammer en gren, der ellers kunne drive fra hinanden.
  const tilfaelde = [
    ['almindelig runde med Chancen', {
      matches: [
        { id: 'm1', round: 1, result: '1', odds: { 1: 2.17, X: 4, 2: 4 } },
        { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.33, 2: 4 } },
      ],
      bets: [
        { matchId: 'm1', pick: '1', points: 5.42 },
        { matchId: 'm2', pick: 'X', points: 3.33 },
      ],
      puljeBonus: 7.5,
    }],
    ['kickoff i fremtiden — rækken skjules, pointene tæller', {
      matches: [{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 }, kickoff: NU + 3_600_000 }],
      bets: [{ matchId: 'm1', pick: '1', points: 2.5 }],
    }],
    ['kickoff mangler', {
      matches: [{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 }, kickoff: null }],
      bets: [{ matchId: 'm1', pick: '1', points: 2.5 }],
    }],
    ['negativ saldo — gulvet ved 0', {
      matches: [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2.0, X: 4, 2: 4 } }],
      bets: [{ matchId: 'm1', pick: '1', points: -9.5 }],
    }],
    ['ingen bets', { matches: [{ id: 'm1', round: 1, result: '1', odds: { 1: 2, X: 4, 2: 4 } }], bets: [] }],
    ['kun puljebonus', { matches: [], bets: [], puljeBonus: 24 }],
    ['ukendt kamp', {
      matches: [{ id: 'm1', round: 1, result: '1', odds: { 1: 2, X: 4, 2: 4 } }],
      bets: [{ matchId: 'ukendt', pick: '1', points: 5 }],
    }],
    // Combi-grenene, tabellen manglede: én fejl, flere runder og et tip på en
    // kamp, konteksten ikke kender. Uden dem kunne src-udgaven begynde at tælle
    // forbiere med som ramte, uden at spejlingen sagde et ord.
    ['runde med én fejl', {
      matches: [
        { id: 'm1', round: 1, result: '1', odds: { 1: 2.17, X: 4, 2: 4 } },
        { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.33, 2: 4 } },
      ],
      bets: [
        { matchId: 'm1', pick: '1', points: 2.17 },
        { matchId: 'm2', pick: '1', points: 0 },
      ],
    }],
    ['to afgjorte runder', {
      matches: [
        { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
        { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
        { id: 'm3', round: 2, result: '1', odds: { 1: 1.5, X: 4, 2: 4 } },
        { id: 'm4', round: 2, result: '2', odds: { 1: 4, X: 4, 2: 2.0 } },
      ],
      bets: [
        { matchId: 'm1', pick: '1', points: 2 }, { matchId: 'm2', pick: 'X', points: 3 },
        { matchId: 'm3', pick: '1', points: 1.5 }, { matchId: 'm4', pick: '2', points: 2 },
      ],
    }],
    ['slettet kamp oveni en fuld runde', {
      matches: [
        { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
        { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
      ],
      bets: [
        { matchId: 'm1', pick: '1', points: 2 }, { matchId: 'm2', pick: 'X', points: 3 },
        { matchId: 'slettet', pick: '1', points: 4 },
      ],
    }],
    ['kamp uden facit', {
      matches: [{ id: 'm1', round: 1, result: null, odds: { 1: 2, X: 4, 2: 4 } }],
      bets: [{ matchId: 'm1', pick: '1', points: 0 }],
    }],
    // Den nye gren: INTET kuponkrav. Uden dette tilfælde kunne den ene fil
    // begynde at kræve fuld kupon igen, mens den anden ikke gjorde — og
    // spilleren ville se ét tal på skærmen og et andet i stillingen.
    ['delvist tippet runde — kuponkravet findes ikke', {
      matches: [
        { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
        { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
        { id: 'm3', round: 1, result: '2', odds: { 1: 4, X: 4, 2: 2.5 } },
      ],
      bets: [
        { matchId: 'm1', pick: '1', points: 3 },
        { matchId: 'm2', pick: 'X', points: 4 },
      ],
    }],
    ['kun ét tip i en afgjort runde — ingen kupon at gange', {
      matches: [
        { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
        { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
      ],
      bets: [{ matchId: 'm1', pick: '1', points: 3 }],
    }],
    ['dublet-bet på samme kamp', {
      matches: [
        { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
        { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
      ],
      bets: [
        { matchId: 'm1', pick: '1', points: 3 },
        { matchId: 'm1', pick: '1', points: 3 },
        { matchId: 'm2', pick: 'X', points: 4 },
      ],
    }],
  ];

  for (const [navn, { matches, bets, puljeBonus = 0 }] of tilfaelde) {
    it(`server-spejlet matcher src-udgaven: ${navn}`, async () => {
      const src = await import('../src/lib/pointOpdeling.js');
      const roundCtx = ctx(matches);
      const arg = { bets, roundCtx, puljeBonus, nowMs: NU };
      expect(opdelPoint(arg)).toEqual(src.opdelPoint(arg));
      expect(combiBonus(bets, roundCtx)).toBe(src.combiBonus(bets, roundCtx));
    });
  }
});
