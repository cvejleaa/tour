import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { buildTipsHistory, chanceUdfald, afregnetIndsats } from './tipsHistory';
import { groupByRound } from './footballRounds';

const { clampStake, scoreBet } = createRequire(import.meta.url)('../../../../functions-platform/superligaScoring.js');

// To runder à to kampe. Runde 1 spillet, runde 2 kun tippet.
const rounds = [
  {
    round: 1,
    matches: [
      { id: 'r1a', round: 1, home: 'AGF', away: 'OB', result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'r1b', round: 1, home: 'FCK', away: 'BIF', result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    ],
  },
  {
    round: 2,
    matches: [
      { id: 'r2a', round: 2, home: 'FCM', away: 'AGF', result: null, odds: { 1: 1.8, X: 4, 2: 4 } },
    ],
  },
];

describe('buildTipsHistory', () => {
  it('sammenstiller tips med facit + point og combi-bonus', () => {
    const bets = {
      r1a: { matchId: 'r1a', pick: '1', points: 2, chanceStake: 0 },   // ramt
      r1b: { matchId: 'r1b', pick: 'X', points: 3, chanceStake: 0 },   // ramt → runde 1 fuldt ramt
      r2a: { matchId: 'r2a', pick: '1', points: 0, chanceStake: 0 },   // afventer
    };
    const h = buildTipsHistory(rounds, bets);

    expect(h.totals.tipped).toBe(3);
    expect(h.totals.settled).toBe(2);       // kun runde 1 er spillet
    expect(h.totals.hits).toBe(2);
    expect(h.totals.hitRate).toBe(100);
    // Runde 1: begge ramt (tippet hele kuponen) → combi = 2·√(2,0×3,0) = 4,9.
    expect(h.rounds[0].roundBonus).toBe(4.9);
    // Point = bet-point (2+3+0) + combi (4,9) = 9,9.
    expect(h.totals.points).toBe(9.9);
  });

  // DEN FEJL, DER ALLEREDE FANDTES. "Point i alt" blev regnet her UDEN
  // puljebonussen og i stillingen MED den. Fra det øjeblik puljen afregnes,
  // viste Mine tips et lavere tal end Stilling for samme spiller — to formler
  // for det samme, én fane imellem.
  it('tæller puljebonussen med i totalen, ligesom stillingen gør', () => {
    const bets = {
      r1a: { matchId: 'r1a', pick: '1', points: 2, chanceStake: 0 },
      r1b: { matchId: 'r1b', pick: 'X', points: 3, chanceStake: 0 },
    };
    const uden = buildTipsHistory(rounds, bets);
    const med = buildTipsHistory(rounds, bets, 24);
    expect(med.totals.points - uden.totals.points).toBe(24);
  });

  it('behandler en manglende puljebonus som nul', () => {
    const bets = { r1a: { matchId: 'r1a', pick: '1', points: 2, chanceStake: 0 } };
    expect(buildTipsHistory(rounds, bets, undefined).totals.points)
      .toBe(buildTipsHistory(rounds, bets, 0).totals.points);
  });

  it('markerer afventende og ikke-ramte korrekt', () => {
    const bets = {
      r1a: { matchId: 'r1a', pick: '2', points: 0, chanceStake: 0 }, // forkert
      r2a: { matchId: 'r2a', pick: '1', points: 0, chanceStake: 5 }, // afventer + Chancen
    };
    const h = buildTipsHistory(rounds, bets);
    const r1a = h.rounds[0].rows.find((r) => r.id === 'r1a');
    const r2a = h.rounds[1].rows.find((r) => r.id === 'r2a');
    expect(r1a.hit).toBe(false);
    expect(r2a.settled).toBe(false);
    expect(r2a.isChance).toBe(true);
    // Runde 1 ikke fuldt tippet (r1b mangler) → ingen combi-bonus.
    expect(h.rounds[0].roundBonus).toBe(0);
  });

  it('tomt input giver nul-totaler', () => {
    const h = buildTipsHistory(rounds, {});
    expect(h.totals).toMatchObject({ tipped: 0, settled: 0, hits: 0, points: 0 });
  });
});

// roundSettled styrer, hvad "Mine tips" skriver om runden — og den var
// udækket: porten kunne gøres altid-sand uden en rød test.
describe('buildTipsHistory — roundSettled på KUPONEN, ikke runden', () => {
  const ug = (iso) => Date.parse(iso);
  const runde3 = (dFacit) => [
    { id: 'a', round: 3, home: 'AGF', away: 'OB', result: '1', odds: { 1: 2, X: 4, 2: 4 }, kickoff: ug('2026-08-07T17:00:00Z') },
    { id: 'b', round: 3, home: 'BIF', away: 'AaB', result: 'X', odds: { 1: 4, X: 3, 2: 4 }, kickoff: ug('2026-08-07T19:00:00Z') },
    { id: 'c', round: 3, home: 'FCK', away: 'FCM', result: '2', odds: { 1: 4, X: 4, 2: 3 }, kickoff: ug('2026-08-09T15:00:00Z') },
    { id: 'd', round: 3, home: 'SIF', away: 'VFF', result: dFacit, odds: { 1: 2, X: 4, 2: 4 }, kickoff: ug('2026-08-09T17:45:00Z') },
    // Udsat til september — uden for kuponen.
    { id: 'e', round: 3, home: 'OB', away: 'AGF', result: null, odds: { 1: 2, X: 4, 2: 4 }, kickoff: ug('2026-09-02T17:00:00Z') },
  ];
  const bets = { a: { pick: '1' }, b: { pick: 'X' }, c: { pick: '2' }, d: { pick: '1' } };

  it('er ikke afgjort, mens en af kuponens kampe mangler facit', () => {
    const h = buildTipsHistory(groupByRound(runde3(null)), bets);
    expect(h.rounds[0].roundSettled).toBe(false);
    expect(h.rounds[0].roundBonus).toBe(0);
  });

  // …men den venter IKKE på den udsatte kamp.
  it('er afgjort, når kuponens fire er afgjort — den udsatte tæller ikke med', () => {
    const h = buildTipsHistory(groupByRound(runde3('1')), bets);
    expect(h.rounds[0].roundSettled).toBe(true);
    expect(h.rounds[0].kupon).toBe(4);
    expect(h.rounds[0].udenfor).toHaveLength(1);
    expect(h.rounds[0].roundBonus).toBeGreaterThan(0);
  });
});


// --- Hvad chancen kostede eller gav ----------------------------------------
//
// Serveren gemmer kun SUMMEN på bettet (1X2-point + chance-delta), så deltaet
// skal regnes tilbage. Uden det stod en tabt chance som et bart rødt ✗: man
// kunne se, at man tabte, men ikke at det kostede fire point.
describe('chanceUdfald', () => {
  const kamp = (over = {}) => ({
    id: 'm', result: '1', odds: { 1: 3.9, X: 3.5, 2: 2 }, ...over,
  });

  it('giver null, når der ikke er sat en chance', () => {
    expect(chanceUdfald({ pick: '1', points: 3.9, chanceStake: 0 }, kamp())).toBeNull();
  });

  it('giver null, før kampen er afgjort', () => {
    expect(chanceUdfald({ pick: '1', chanceStake: 4 }, kamp({ result: null }))).toBeNull();
  });

  // Forkert tip: base er 0, så bettets points ER chance-tabet.
  it('regner tabet ud som −indsats', () => {
    const u = chanceUdfald({ pick: '2', points: -4, chanceStake: 4 }, kamp());
    expect(u).toMatchObject({ afregnet: true, delta: -4 });
  });

  // Rigtigt tip: points rummer BÅDE 1X2 og gevinsten, og kun deltaet må vises
  // som chancens bidrag. 3,9 for tippet + round(4 × 2,9) = 12 → 15,9.
  it('trækker 1X2-pointene fra, så kun gevinsten står tilbage', () => {
    const u = chanceUdfald({ pick: '1', points: 15.9, chanceStake: 4 }, kamp());
    expect(u.afregnet).toBe(true);
    expect(u.delta).toBe(12);
  });

  // UDEN GYLDIGE ODDS afregner serveren ikke chancen. Så findes tallet ikke,
  // og et fortegnstal ville være et gæt — hverken −4 (løgn) eller 0.
  it('melder "ikke afregnet", når kampen mangler odds', () => {
    const u = chanceUdfald({ pick: '2', points: 0, chanceStake: 4 }, kamp({ odds: null }));
    expect(u).toMatchObject({ afregnet: false, grund: 'ingen-odds', delta: 0 });
  });

  it('melder "ikke afregnet", når netop DET valgte udfald mangler odds', () => {
    const u = chanceUdfald({ pick: 'X', points: 0, chanceStake: 4 }, kamp({ result: 'X', odds: { 1: 2, 2: 3 } }));
    expect(u.afregnet).toBe(false);
  });

  // ET DELTA PÅ 0 ER IKKE DET SAMME SOM "IKKE AFREGNET". En gevinst på indsats
  // 1 til odds 1,1 giver Math.round(0,1) = 0. Afgjorde vi det på deltaet i
  // stedet for på oddsene, ville den række påstå, at chancen ikke var afgjort.
  it('kalder en gevinst på nul point afregnet', () => {
    const u = chanceUdfald({ pick: '1', points: 1.1, chanceStake: 1 }, kamp({ odds: { 1: 1.1, X: 3, 2: 3 } }));
    expect(u).toMatchObject({ afregnet: true, delta: 0 });
  });

  // Spillerdetaljens dokument gemmer kun { pick, points, chanceStake } og har
  // INGEN odds. Læste vi oddsene fra bettet, ville tallet være rigtigt i Mine
  // tips og forkert i spillerdetaljen for præcis det samme tip.
  it('tager oddsene fra kampen, ikke fra bettet', () => {
    const fraDetaljen = { pick: '2', points: -4, chanceStake: 4 }; // ingen odds på bettet
    expect(chanceUdfald(fraDetaljen, kamp()).delta).toBe(-4);
  });
});

describe('buildTipsHistory — chance-felterne på rækken', () => {
  const m = [{ id: 'm1', round: 1, home: 'AGF', away: 'OB', kickoff: new Date('2026-08-01T17:00:00Z'), result: '1', odds: { 1: 3.9, X: 3.5, 2: 2 } }];

  it('lægger delta og afregnet på rækken', () => {
    const h = buildTipsHistory(groupByRound(m), { m1: { pick: '2', points: -4, chanceStake: 4 } });
    const row = h.rounds[0].rows[0];
    expect(row.chanceDelta).toBe(-4);
    expect(row.chanceAfregnet).toBe(true);
    expect(row.isChance).toBe(true);
  });

  it('sætter afregnet: false, når kampen mangler odds', () => {
    const uden = [{ ...m[0], odds: null }];
    const h = buildTipsHistory(groupByRound(uden), { m1: { pick: '2', points: 0, chanceStake: 4 } });
    expect(h.rounds[0].rows[0].chanceAfregnet).toBe(false);
  });
});

// SCORINGSVINDUET. Facit står på KAMPEN, mens points skrives på BETTET af en
// trigger — så der går sekunder, hvor kampen er afgjort og bettet ikke er
// scoret. Uden en egen tilstand viste visningen dér det MODSATTE af sandheden.
describe('chanceUdfald — facit før pointene', () => {
  const kamp = { id: 'm', result: '1', odds: { 1: 3.9, X: 3.5, 2: 2 } };

  it('melder "afventer", når bettet endnu ikke er scoret', () => {
    const u = chanceUdfald({ pick: '2', chanceStake: 4 }, kamp); // intet points-felt
    expect(u).toEqual({ afregnet: false, grund: 'afventer', delta: 0 });
  });

  // Et forkert tip ville ellers give 0 − 0 = 0 → grønt "vundet", selv om
  // spilleren lige havde tabt fire point.
  it('påstår ikke, at en tabt chance blev vundet, mens den afventer', () => {
    const u = chanceUdfald({ pick: '2', chanceStake: 4 }, kamp);
    expect(u.afregnet).toBe(false);
    expect(u.delta).toBe(0);
  });

  // Og et rigtigt tip ville give 0 − 3,9 = −3,9 → rødt "tabt", selv om
  // spilleren lige havde vundet tolv.
  it('påstår ikke, at en vundet chance blev tabt, mens den afventer', () => {
    expect(chanceUdfald({ pick: '1', chanceStake: 4 }, kamp).delta).toBe(0);
  });

  // points: 0 er et RIGTIGT tal fra serveren — den skriver altid et, når den
  // har scoret. Kun null/undefined betyder "ikke scoret endnu".
  it('behandler et gemt nul som afregnet', () => {
    const u = chanceUdfald({ pick: '2', points: 0, chanceStake: 4 }, { ...kamp, result: '2', odds: { 1: 2, X: 3, 2: 1.2 } });
    expect(u.afregnet).toBe(true);
  });

  it('skelner de to grunde fra hinanden', () => {
    expect(chanceUdfald({ pick: '2', chanceStake: 4 }, kamp).grund).toBe('afventer');
    expect(chanceUdfald({ pick: '2', points: 0, chanceStake: 4 }, { ...kamp, odds: null }).grund).toBe('ingen-odds');
  });
});

// ---------------------------------------------------------------------------
// DEN AFREGNEDE INDSATS. Historikken skriver «⚡ 8 sat på spil», og tallet må
// ikke være feltet råt: gamle dokumenter kan bære en værdi fra før reglerne
// lukkede for klient-skrivning, og serveren afregnede den klippet. Et
// «100 sat på spil» ved siden af «✗ −8» ville være en løgn.
// ---------------------------------------------------------------------------
describe('afregnetIndsats — spejl af serverens clampStake uden saldo', () => {
  // PARITET med SERVERENS kode, ikke med en kopi af den: gameScoring kalder
  // scoreBet uden bank, så clampStake(x) uden bank ER den afregnede indsats.
  it('giver præcis det, serveren afregner med — for hver slags værdi', () => {
    const vaerdier = [0, 0.4, 0.9, 1, 1.5, 2, 4, 7.9, 8, 8.5, 9, 100, 1e9, -3, -0.5, '6', '100', 'abc', '', null, undefined, NaN, Infinity, true, [], {}];
    for (const v of vaerdier) {
      expect(afregnetIndsats(v), `chanceStake = ${String(v)}`).toBe(clampStake(v));
    }
  });

  // Og end-to-end mod scoreBet: et tabt tip koster præcis den indsats, rækken
  // viser — så «⚡ N sat på spil» og «✗ −N» altid står med samme N.
  it('et tabt tip koster præcis den viste indsats', () => {
    const odds = { 1: 2.2, X: 3.3, 2: 3.4 };
    for (const stake of [1, 4, 8, 9, 100, 0.9]) {
      // `+ 0`: −0 og 0 er det samme point, men ikke det samme for Object.is.
      expect(scoreBet({ pick: '1', chanceStake: stake }, '2', odds) + 0, `stake ${stake}`).toBe(-afregnetIndsats(stake) + 0);
    }
  });

  it('klipper til loftet, runder ned og giver 0 for alt under 1', () => {
    expect(afregnetIndsats(100)).toBe(8);
    expect(afregnetIndsats(8)).toBe(8);
    expect(afregnetIndsats(7.9)).toBe(7);
    expect(afregnetIndsats(0.9)).toBe(0);
    expect(afregnetIndsats(-3)).toBe(0);
    expect(afregnetIndsats(undefined)).toBe(0);
  });
});

describe('buildTipsHistory — chanceIndsats og isChance følger den afregnede indsats', () => {
  const m = [{ id: 'k', round: 1, home: 'A', away: 'B', result: '2', odds: { 1: 2.2, X: 3.3, 2: 3.4 } }];
  const raekke = (bet) => buildTipsHistory(groupByRound(m), { k: bet }).rounds[0].rows[0];

  it('en forfalsket indsats på 100 står som 8 — og er stadig en Chance', () => {
    const r = raekke({ pick: '1', points: -8, chanceStake: 100 });
    expect(r.chanceIndsats).toBe(8);
    expect(r.isChance).toBe(true);
    expect(r.chanceDelta).toBe(-8);
  });

  // En brøk under 1 afregnede serveren aldrig (clampStake → 0). Så er der
  // ingen Chance på rækken — heller ikke en «(heraf ⚡ +0)» på kampkortet.
  it('en indsats på 0,9 er ingen Chance', () => {
    const r = raekke({ pick: '2', points: 3.4, chanceStake: 0.9 });
    expect(r.chanceIndsats).toBe(0);
    expect(r.isChance).toBe(false);
    expect(chanceUdfald({ pick: '2', points: 3.4, chanceStake: 0.9 }, m[0])).toBeNull();
  });

  it('en almindelig indsats står uændret', () => {
    expect(raekke({ pick: '1', points: -5, chanceStake: 5 }).chanceIndsats).toBe(5);
    expect(raekke({ pick: '1', points: 0 }).chanceIndsats).toBe(0);
  });
});
