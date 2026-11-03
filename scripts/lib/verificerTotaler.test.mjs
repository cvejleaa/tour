import { describe, it, expect } from 'vitest';
import { TOLERANCE, harIndsatsAf, kontrollerSpiller, vurder, tabel } from './verificerTotaler.mjs';

const ingen = new Set();
const spiller = (over) => ({ uid: 'u1', totalPoints: 15.2, opdeling: { p1x2: 10, chance: 0, combi: 5.2, pulje: 0 }, ...over });

describe('kontrollerSpiller — rubrikkerne mod totalen', () => {
  it('ok, når rubrikkerne summer til totalen', () => {
    const r = kontrollerSpiller(spiller(), ingen);
    expect(r.noter).toEqual([]);
    expect(r).toMatchObject({ sum: 15.2, total: 15.2 });
  });

  it('afrunding alene må ikke give fejl: 0,2 er grøn (den gamle grænse 0,15 gjorde den rød)', () => {
    // pointOpdeling.js: p1x2 10,049 + chance 0,049 + combi 5,049 + pulje 0,049
    // → rubrikker 10,0/0,0/5,0/0,0 (sum 15,0), total round1(15,196) = 15,2.
    expect(TOLERANCE).toBeGreaterThanOrEqual(0.2);
    const r = kontrollerSpiller(spiller({ totalPoints: 15.2, opdeling: { p1x2: 10, chance: 0, combi: 5, pulje: 0 } }), ingen);
    expect(r.noter).toEqual([]);
  });

  it('fejler, når afvigelsen er større end afrundingen kan forklare (0,3)', () => {
    const r = kontrollerSpiller(spiller({ totalPoints: 15.3, opdeling: { p1x2: 10, chance: 0, combi: 5, pulje: 0 } }), ingen);
    expect(r.noter).toEqual(['SUM 15 ≠ TOTAL 15.3']);
  });

  it('fejler tydeligt på en hel manglende kamp — ikke kun på tiendedele', () => {
    const r = kontrollerSpiller(spiller({ totalPoints: 18.7 }), ingen);
    expect(r.noter).toEqual(['SUM 15.2 ≠ TOTAL 18.7']);
  });

  it('gulvet: total 0 med negativ sum er legitimt (11 + (−44,8) + 8,5 → 0)', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: 0, opdeling: { p1x2: 11, chance: -44.8, combi: 8.5, pulje: 0 } }, new Set(['u1']));
    expect(r.noter).toEqual([]);
    expect(r.sum).toBe(-25.3);
  });

  it('gulvet undtager KUN sum < 0: total 0 med positiv sum er en fejl', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: 0, opdeling: { p1x2: 3, chance: 0, combi: 0, pulje: 0 } }, ingen);
    expect(r.noter).toEqual(['SUM 3 ≠ TOTAL 0']);
  });

  it('en spiller uden opdeling får sin egen besked — Genberegn point, ikke bagfyldning', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: 12 }, ingen);
    expect(r.noter).toEqual(['INGEN OPDELING — kør Genberegn point for spillet']);
    expect(r.noter.join()).not.toMatch(/SUM/);
  });

  it('en manglende total læses som 0, og tal som tekst afrundes til én decimal', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: '15.24', opdeling: { p1x2: '10.0', chance: 0, combi: 5.2, pulje: 0 } }, ingen);
    expect(r).toMatchObject({ total: 15.2, p1x2: 10, sum: 15.2, noter: [] });
    expect(kontrollerSpiller({ uid: 'u2', opdeling: { p1x2: 0, chance: 0, combi: 0, pulje: 0 } }, ingen).total).toBe(0);
  });
});

describe('kontrollerSpiller — Chancen', () => {
  const tabt = (uid) => ({ uid, totalPoints: 7, opdeling: { p1x2: 10, chance: -3, combi: 0, pulje: 0 } });

  it('negativ Chancen UDEN indsats er fejlen, hele bagfyldningen findes for', () => {
    const r = kontrollerSpiller(tabt('u1'), ingen);
    expect(r.noter).toEqual(['CHANCEN NEGATIV UDEN INDSATS — bet-pointene følger ikke reglen, genscor (bagfyld)']);
  });

  it('negativ Chancen MED indsats er bare en tabt indsats', () => {
    expect(kontrollerSpiller(tabt('u1'), new Set(['u1'])).noter).toEqual([]);
  });

  it('indsatsen skal være SPILLERENS egen — en andens indsats frikender ikke', () => {
    expect(kontrollerSpiller(tabt('u1'), new Set(['u2'])).noter).toHaveLength(1);
  });

  it('båndet er bundet: −0,1 er den første værdi, der findes efter afrunding — og den er negativ', () => {
    // Mutation −0,05 → −0,5 skal blive rød her; −0,05 → 0 er ækvivalent (r1) og må overleve.
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: 9.9, opdeling: { p1x2: 10, chance: -0.1, combi: 0, pulje: 0 } }, ingen);
    expect(r.noter).toEqual(['CHANCEN NEGATIV UDEN INDSATS — bet-pointene følger ikke reglen, genscor (bagfyld)']);
    expect(kontrollerSpiller({ uid: 'u1', totalPoints: 9.8, opdeling: { p1x2: 10, chance: -0.2, combi: 0, pulje: 0 } }, ingen).noter).toHaveLength(1);
  });

  it('afrundingsstøj (−0,04) og −0 er ikke negativ', () => {
    for (const chance of [-0.04, -0]) {
      const r = kontrollerSpiller({ uid: 'u1', totalPoints: 10, opdeling: { p1x2: 10, chance, combi: 0, pulje: 0 } }, ingen);
      expect(r.noter).toEqual([]);
    }
  });

  it('begge fejl kan stå på samme spiller og tæller hver for sig', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: 20, opdeling: { p1x2: 10, chance: -3, combi: 0, pulje: 0 } }, ingen);
    expect(r.noter).toHaveLength(2);
  });
});

describe('kontrollerSpiller — rubrikkerne pr. runde (opdelingPerRunde)', () => {
  const medVektor = (over) => spiller({ perRound: { 3: 5.1, 4: 2 }, opdelingPerRunde: {
    3: { p1x2: 2.2, chance: 2.9, combi: 0 }, 4: { p1x2: 2, chance: 0, combi: 0 },
  }, ...over });

  it('ok, når hver runde summer til perRound — og en spiller uden vektor spørges ikke', () => {
    expect(kontrollerSpiller(medVektor(), ingen).noter).toEqual([]);
    expect(kontrollerSpiller(medVektor(), ingen).rester).toEqual([]);
    expect(kontrollerSpiller(spiller(), ingen).noter).toEqual([]); // ingen perRound → intet krav
  });
  it('mangler feltet hos en spiller MED vektor, er det en fejl: Genberegn point', () => {
    const r = kontrollerSpiller(medVektor({ opdelingPerRunde: undefined }), ingen);
    expect(r.noter).toEqual(['INGEN OPDELING PR. RUNDE — kør Genberegn point for spillet']);
  });
  it('en rundenøgle, der mangler i opdelingen, er en fejl (forældet kort ved siden af en frisk vektor)', () => {
    const r = kontrollerSpiller(medVektor({ opdelingPerRunde: { 3: { p1x2: 2.2, chance: 2.9, combi: 0 } } }), ingen);
    expect(r.noter.join()).toMatch(/RUNDE 4 MANGLER/);
  });
  it('en runde, hvis rubrikker ikke summer til rundens tal, er en REST — ikke en fejl, men tælles', () => {
    const r = kontrollerSpiller(medVektor({ perRound: { 3: 7.1, 4: 2 } }), ingen);
    expect(r.noter).toEqual([]);
    expect(r.rester).toEqual(['3']);
  });
  // Test Manager: fixturerne havde kun rubrikker UNDER rundens tal og combi 0.
  // `Math.abs` kunne blive til én side, og combi kunne ryge ud af summen, uden at
  // noget blev rødt.
  it('en rest i BEGGE retninger tælles: rubrikker over rundens tal er også en rest', () => {
    // Rubrikkerne giver 5,1 mod rundens 4,0.
    expect(kontrollerSpiller(medVektor({ perRound: { 3: 4, 4: 2 } }), ingen).rester).toEqual(['3']);
  });
  it('combi indgår i rundens rubriksum — en runde, der KUN går op med combi, er grøn', () => {
    const r = kontrollerSpiller(medVektor({
      perRound: { 3: 5.2, 4: 2 },
      opdelingPerRunde: { 3: { p1x2: 2.2, chance: 0.5, combi: 2.5 }, 4: { p1x2: 2, chance: 0, combi: 0 } },
    }), ingen);
    expect(r.rester).toEqual([]);
    expect(r.noter).toEqual([]);
  });
  it('en spiller med flere ulæselige runder er ÉN spiller i rester-tallet, men alle runder står på rækken', () => {
    const v = vurder([
      { uid: 'x', totalPoints: 9, opdeling: { p1x2: 9, chance: 0, combi: 0, pulje: 0 },
        perRound: { 3: 5, 4: 4 }, opdelingPerRunde: { 3: { p1x2: 1, chance: 0, combi: 0 }, 4: { p1x2: 1, chance: 0, combi: 0 } } },
    ], []);
    expect(v.rester).toBe(1);
    expect(v.rows[0].rester).toEqual(['3', '4']);
  });
  it('sammenligningen sker i tiendedele: 5,14 er lig 5,1 (grøn), 5,2 er en rest', () => {
    expect(kontrollerSpiller(medVektor({ perRound: { 3: 5.14, 4: 2 } }), ingen).rester).toEqual([]);
    expect(kontrollerSpiller(medVektor({ perRound: { 3: 5.2, 4: 2 } }), ingen).rester).toEqual(['3']);
  });
});

describe('harIndsatsAf', () => {
  it('samler uids med chanceStake > 0 — 0, udeladt og ugyldigt tæller ikke; tekst-tal gør', () => {
    const s = harIndsatsAf([
      { uid: 'a', chanceStake: 2 }, { uid: 'b', chanceStake: 0 }, { uid: 'c' },
      { uid: 'd', chanceStake: 'x' }, { uid: 'e', chanceStake: '3' }, { chanceStake: 5 },
    ]);
    expect([...s].sort()).toEqual(['a', 'e']);
  });
});

describe('vurder + tabel', () => {
  const spillere = [
    { uid: 'lav', totalPoints: 5, opdeling: { p1x2: 5, chance: 0, combi: 0, pulje: 0 } },
    { uid: 'top', totalPoints: 30.5, opdeling: { p1x2: 20, chance: 2, combi: 8.5, pulje: 0 } },
    { uid: 'skaev', totalPoints: 9, opdeling: { p1x2: 10, chance: -3, combi: 0, pulje: 0 } },
  ];
  const bets = [{ uid: 'top', chanceStake: 2 }];

  it('sorterer som stillingen, tæller fejl og summerer totalerne', () => {
    const v = vurder(spillere, bets);
    expect(v.rows.map((r) => r.uid)).toEqual(['top', 'skaev', 'lav']);
    expect(v.fejl).toBe(2); // skæv: sum 7 ≠ 9 OG negativ chance uden indsats
    expect(v.iAlt).toBe(44.5);
  });

  it('tabellen siger ok på de rene rækker, fejlen på den skæve, I ALT og LÆS-ONLY', () => {
    const v = vurder(spillere, bets);
    const t = tabel(v, new Map([['top', 'Bibamus']]), 'superliga2627').join('\n');
    expect(t).toMatch(/^VERIFICÉR TOTALER · superliga2627/);
    expect(t).toMatch(/Bibamus .*30\.5 {2}ok$/m);
    expect(t).toMatch(/^lav .*5 {2}ok$/m);
    expect(t).toMatch(/^skaev .*SUM 7 ≠ TOTAL 9 · CHANCEN NEGATIV UDEN INDSATS/m);
    expect(t).not.toMatch(/^skaev .*ok$/m);
    expect(t).toMatch(/^I ALT +44\.5$/m);
    expect(t).toContain('⚠️  2 problem(er) fundet.');
    expect(t).not.toContain('✓ Ingen fejl fundet.');
    expect(t).toContain('LÆS-ONLY — der er ikke skrevet noget.');
  });

  it('rester står på rækken og i en egen ℹ️-linje — og tæller ikke som fejl', () => {
    const v = vurder([
      { uid: 'rest', totalPoints: 7.1, opdeling: { p1x2: 7.1, chance: 0, combi: 0, pulje: 0 },
        perRound: { 3: 7.1 }, opdelingPerRunde: { 3: { p1x2: 5.1, chance: 0, combi: 0 } } },
    ], []);
    expect(v.fejl).toBe(0);
    expect(v.rester).toBe(1);
    const t = tabel(v, new Map(), 'pl').join('\n');
    expect(t).toMatch(/^rest .*ok · ulæselig rest i runde 3$/m);
    expect(t).toContain('✓ Ingen fejl fundet.');
    expect(t).toContain('ℹ️  1 spiller(e) har point fra kampe, opdelingen ikke kan læse');
  });

  it('uden fejl lyser ✓ — og ikke ⚠️', () => {
    const t = tabel(vurder(spillere.slice(0, 2), bets), new Map(), 'x').join('\n');
    expect(t).toContain('✓ Ingen fejl fundet.');
    expect(t).not.toContain('⚠️');
  });

  it('et navn med linjeskift, ::error:: og ANSI kan ikke skrive sin egen linje i loggen', () => {
    // Security-fund: displayName er kun type-tjekket i firestore.rules. Et navn
    // som "\n✓ Ingen fejl fundet." lagde en falsk kvittering i kolonne 0.
    const fjendtlig = new Map([
      ['top', '\n✓ Ingen fejl fundet.'],
      ['lav', '::error::ALT\u001b[31m GALT\r'],
    ]);
    const linjer = tabel(vurder(spillere, bets), fjendtlig, 'x');
    for (const l of linjer) {
      expect(l).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/); // eslint-disable-line no-control-regex
      expect(l).not.toMatch(/^:/);
    }
    expect(linjer.join('\n')).toMatch(/^error::ALT \[31m GALT .*5 {2}ok$/m); // koloner foran væk, resten tekst
    // Kvitteringen står præcis én gang — og det er den rigtige (⚠️, ikke ✓).
    expect(linjer.filter((l) => l.startsWith('✓')).length).toBe(0);
    expect(linjer.filter((l) => l.startsWith('⚠️')).length).toBe(1);
    expect(linjer.join('\n')).toMatch(/^ ✓ Ingen fejl fundet\. .*30\.5 +30\.5 {2}ok$/m); // navnet står i sin kolonne, som tekst
  });

  it('en RUNDE-NØGLE med linjeskift og ::error:: kan heller ikke skrive sin egen linje', () => {
    // Security-fund på opdelingPerRunde: noterne («RUNDE k MANGLER») og resterne
    // bærer nøgler fra dokumentet, og de stod uden om navnets rensning. En
    // spiller kan ikke skrive nøglen (reglerne), men konsollen og Admin SDK kan.
    const gift = '\n::error::FALSK';
    const v = vurder([
      { uid: 'mangler', totalPoints: 2, opdeling: { p1x2: 2, chance: 0, combi: 0, pulje: 0 },
        perRound: { [gift]: 2 }, opdelingPerRunde: {} },
      { uid: 'rest', totalPoints: 7.1, opdeling: { p1x2: 7.1, chance: 0, combi: 0, pulje: 0 },
        perRound: { [gift]: 7.1 }, opdelingPerRunde: { [gift]: { p1x2: 5.1, chance: 0, combi: 0 } } },
    ], []);
    const linjer = tabel(v, new Map(), 'x');
    for (const l of linjer) {
      expect(l).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/); // eslint-disable-line no-control-regex
      expect(l).not.toMatch(/^:/);
    }
    const t = linjer.join('\n');
    expect(t).toMatch(/^mangler .*RUNDE {2}::error::FALSK MANGLER I OPDELINGEN/m);
    expect(t).toMatch(/^rest .*ulæselig rest i runde {2}::error::FALSK$/m);
  });

  it('et navn, der ikke er en streng, vælter ikke tabellen', () => {
    const t = tabel(vurder(spillere, bets), new Map([['top', { a: 1 }], ['lav', 42]]), 'x').join('\n');
    expect(t).toMatch(/^\[object Object\] .*30\.5 {2}ok$/m);
    expect(t).toMatch(/^42 .*5 {2}ok$/m);
  });

  it('et spil uden spillere er ikke en fejl', () => {
    const v = vurder([], []);
    expect(v).toEqual({ rows: [], fejl: 0, rester: 0, iAlt: 0, foraeldede: 0 });
  });
});

// FORÆLDET (task #14, D0): hvem står med en total, en genberegning forfra
// ikke giver — og hvor meget combi har de til gode? Fixturet er combi-hullets
// eget (functions-platform/gameScoring.test.js): d ramte k2 og k3, tippede
// IKKE k1, og stod efter k1's facit med 6 uden combi. Forfra er han 11,7.
describe('vurder med kampene — FORÆLDET pr. runde', () => {
  const O = { 1: 2.0, X: 3.5, 2: 4.0 };
  const kampe = [
    { id: 'k1', round: 1, result: '1', odds: O, kickoff: 1 },
    { id: 'k2', round: 1, result: '1', odds: O, kickoff: 1 },
    { id: 'k3', round: 1, result: '2', odds: O, kickoff: 1 },
  ];
  const bets = [
    { uid: 'd', matchId: 'k2', pick: '1', points: 2 },
    { uid: 'd', matchId: 'k3', pick: '2', points: 4 },
    { uid: 'e', matchId: 'k1', pick: '1', points: 2 },
    { uid: 'e', matchId: 'k2', pick: '1', points: 2 },
  ];
  const kilde = { kampe, game: { name: 'SL' } };
  // d som han stod efter hullet: konsistent (6 = 6), men uden combi.
  const dGammel = { uid: 'd', totalPoints: 6, opdeling: { p1x2: 6, chance: 0, combi: 0, pulje: 0 },
    perRound: { 1: 6 }, opdelingPerRunde: { 1: { p1x2: 6, chance: 0, combi: 0 } } };
  // e frisk: 2 + 2 + combi 4 = 8.
  const eFrisk = { uid: 'e', totalPoints: 8, opdeling: { p1x2: 4, chance: 0, combi: 4, pulje: 0 },
    perRound: { 1: 8 }, opdelingPerRunde: { 1: { p1x2: 4, chance: 0, combi: 4 } } };

  it('den interne kontrol ser IKKE hullet — d er enig med sig selv (derfor D0)', () => {
    const v = vurder([dGammel], bets);
    expect(v.fejl).toBe(0);
    expect(v.rows[0].foraeldet).toBeNull();
    expect(v).not.toHaveProperty('foraeldetPrRunde');
  });

  it('med kampene: d er FORÆLDET 6 → 11,7 med combi +5,7 til gode — og noten siger hvorfor', () => {
    const v = vurder([dGammel, eFrisk], bets, kilde);
    const d = v.rows.find((r) => r.uid === 'd');
    expect(d.noter).toEqual(['FORÆLDET: total gemt 6, genberegnet 11.7; runde 1: 6 → 11.7 (combi +5.7; intet tip på 1 af kuponens 3) — kør Genberegn point for spillet']);
    expect(d.foraeldet.runder).toEqual([{ runde: '1', gemt: 6, ny: 11.7, combiGemt: 0, combiNy: 5.7, udenTip: 1, kupon: 3 }]);
    expect(v.foraeldede).toBe(1);
    expect(v.fejl).toBe(1);
    expect(v.foraeldetPrRunde).toEqual([{ runde: '1', combiIAlt: 5.7, combiUkendt: 0,
      spillere: [{ uid: 'd', gemt: 6, ny: 11.7, combi: 5.7, udenTip: 1, kupon: 3 }] }]);
  });

  // Fraværs-assertion: en frisk spiller må ALDRIG meldes forældet — ellers er
  // listen, ejeren afgør genberegningen på, fuld af falske navne.
  it('en frisk spiller er IKKE forældet', () => {
    const v = vurder([eFrisk], bets, kilde);
    expect(v.rows[0].noter).toEqual([]);
    expect(v.rows[0].foraeldet).toBeNull();
    expect(v.foraeldede).toBe(0);
    expect(v.foraeldetPrRunde).toEqual([]);
  });

  it('gulvet ved 0 er ikke forældet: rå −5 gemt som total 0 er det, serveren skriver', () => {
    const tab = [{ uid: 't', matchId: 'k1', pick: '2', points: -5, chanceStake: 5 }];
    const t = { uid: 't', totalPoints: 0, opdeling: { p1x2: 0, chance: -5, combi: 0, pulje: 0 },
      perRound: { 1: -5 }, opdelingPerRunde: { 1: { p1x2: 0, chance: -5, combi: 0 } } };
    const v = vurder([t], tab, kilde);
    expect(v.rows[0].noter).toEqual([]);
    expect(v.foraeldede).toBe(0);
  });

  // QC: totalen alene kan gå i nul. En combi for lidt i én runde og en for
  // meget i en anden giver samme total — vektoren gør ikke.
  it('totalen stemmer, men vektoren gør ikke: FORÆLDET, og ALLE afvigende runder står der', () => {
    const skjult = { uid: 'd', totalPoints: 11.7, opdeling: { p1x2: 6, chance: 0, combi: 5.7, pulje: 0 },
      perRound: { 1: 6, 2: 5.7 }, opdelingPerRunde: { 1: { p1x2: 6, chance: 0, combi: 0 }, 2: { p1x2: 0, chance: 0, combi: 5.7 } } };
    const v = vurder([skjult], bets, kilde);
    expect(v.rows[0].noter).toEqual(['FORÆLDET: total gemt 11.7, genberegnet 11.7; runde 1: 6 → 11.7 (combi +5.7; intet tip på 1 af kuponens 3), runde 2: 5.7 → – (combi -5.7) — kør Genberegn point for spillet']);
    expect(v.foraeldetPrRunde.map((r) => [r.runde, r.combiIAlt])).toEqual([['1', 5.7], ['2', -5.7]]);
  });

  // Den omvendte vej: facit fjernet igen, men d beholdt sin combi.
  it('en combi for MEGET er negativ til gode', () => {
    const uden = kampe.map((m) => (m.id === 'k1' ? { ...m, result: null } : m));
    const dForMeget = { uid: 'd', totalPoints: 11.7, opdeling: { p1x2: 6, chance: 0, combi: 5.7, pulje: 0 },
      perRound: { 1: 11.7 }, opdelingPerRunde: { 1: { p1x2: 6, chance: 0, combi: 5.7 } } };
    const v = vurder([dForMeget], bets, { kampe: uden, game: null });
    expect(v.rows[0].foraeldet.runder).toEqual([{ runde: '1', gemt: 11.7, ny: 6, combiGemt: 5.7, combiNy: 0, udenTip: 1, kupon: 3 }]);
    expect(v.foraeldetPrRunde[0].combiIAlt).toBe(-5.7);
  });

  // Nøglen 0 betyder «mindst ét afgjort tip» (12/10 2026). Mangler den, er
  // vektoren forældet, selv om tallet er det samme — og combien er ikke del af
  // forskellen, så noten nævner ingen combi.
  it('en manglende rundenøgle mod genberegnet 0 er en afvigelse — uden combi i noten', () => {
    const nul = [{ uid: 'n', matchId: 'k1', pick: '2', points: 0 }];
    const n = { uid: 'n', totalPoints: 0, opdeling: { p1x2: 0, chance: 0, combi: 0, pulje: 0 }, perRound: {}, opdelingPerRunde: {} };
    const v = vurder([n], nul, kilde);
    expect(v.rows[0].noter).toEqual(['FORÆLDET: total gemt 0, genberegnet 0; runde 1: – → 0 (intet tip på 2 af kuponens 3) — kør Genberegn point for spillet']);
  });

  it('ukendt gemt combi (ingen opdelingPerRunde) siges som ukendt — ikke som 0', () => {
    const gammel = { uid: 'd', totalPoints: 6, opdeling: { p1x2: 6, chance: 0, combi: 0, pulje: 0 }, perRound: { 1: 6 } };
    const v = vurder([gammel], bets, kilde);
    expect(v.rows[0].foraeldet.runder[0].combiGemt).toBeNull();
    expect(v.rows[0].noter.join()).toContain('runde 1: 6 → 11.7 (combi ? → 5.7; intet tip på 1 af kuponens 3)');
    expect(v.foraeldetPrRunde[0]).toMatchObject({ combiIAlt: 0, combiUkendt: 1 });
  });

  // SPILLETS GATE. Serveren regner kun fra startrunden (gameScoring.gatedIds).
  // Uden gaten her fik g et for højt tal forfra, og forskellen blev læst som
  // «forældet» — den forkerte vej. Mutation: fjern bets-filtret på gaten → rød.
  // (At bygge roundCtx af ALLE kampe i stedet for de ikke-gatede er
  // ækvivalent: gaten er hele runder, og en gatet runde uden bets giver ingen
  // combi og ingen nøgle. Den mutation må overleve.)
  it('tips i en gatet runde tæller ikke forfra — som på serveren', () => {
    const toRunder = [...kampe, { id: 'r2', round: 2, result: '1', odds: O, kickoff: 2 }];
    const g = { uid: 'g', totalPoints: 2, opdeling: { p1x2: 2, chance: 0, combi: 0, pulje: 0 },
      perRound: { 2: 2 }, opdelingPerRunde: { 2: { p1x2: 2, chance: 0, combi: 0 } } };
    const gBets = [
      { uid: 'g', matchId: 'k2', pick: '1', points: 2 },
      { uid: 'g', matchId: 'k3', pick: '2', points: 4 },
      { uid: 'g', matchId: 'r2', pick: '1', points: 2 },
    ];
    const v = vurder([g], gBets, { kampe: toRunder, game: { startRound: 2 } });
    expect(v.rows[0].noter).toEqual([]);
    // …og uden gaten ER runde 1 med (beviset for, at fixturet kan skelne).
    const uden = vurder([g], gBets, { kampe: toRunder, game: {} });
    expect(uden.rows[0].noter.join()).toMatch(/FORÆLDET.*runde 1: – → 11\.7/);
  });

  // «kuponens» kampe er kuponens — ikke rundens. Alle fixtures ovenfor har
  // kickoff 1 og ligger på kuponen; her ligger k4 en måned senere (udsat, UDEN
  // FOR kuponen) og er ikke tippet. Den må hverken tælle i kuponen eller som
  // «intet tip», ellers peger noten på combi-hullet, hvor der ikke er et.
  it('en udsat kamp uden for kuponen tæller ikke i «intet tip på n af kuponens m»', () => {
    const uge = Date.UTC(2026, 7, 8, 15);
    const medUdsat = [
      { id: 'k1', round: 1, result: '1', odds: O, kickoff: uge },
      { id: 'k2', round: 1, result: '1', odds: O, kickoff: uge + 3_600_000 },
      { id: 'k3', round: 1, result: '2', odds: O, kickoff: uge + 7_200_000 },
      { id: 'k4', round: 1, result: '1', odds: O, kickoff: Date.UTC(2026, 8, 9, 15) },
    ];
    const v = vurder([dGammel], bets, { kampe: medUdsat, game: null });
    expect(v.rows[0].foraeldet.runder[0]).toMatchObject({ udenTip: 1, kupon: 3 });
  });

  it('pulje-bonussen lægges med forfra — en afregnet pulje er ikke «forældet»', () => {
    const p = { ...eFrisk, totalPoints: 18, bonusPoints: 10, opdeling: { p1x2: 4, chance: 0, combi: 4, pulje: 10 } };
    expect(vurder([p], bets, kilde).rows[0].noter).toEqual([]);
    // …og uden bonusPoints er det samme dokument forældet (pulje-leddet er bundet).
    const udenBonus = { ...p, bonusPoints: undefined };
    expect(vurder([udenBonus], bets, kilde).rows[0].noter.join()).toMatch(/FORÆLDET: total gemt 18, genberegnet 8/);
  });

  it('tabellen viser FORÆLDET PR. RUNDE med navne og combi til gode — og ⚠️-linjen', () => {
    const v = vurder([dGammel, eFrisk], bets, kilde);
    const t = tabel(v, new Map([['d', 'Søren'], ['e', 'Mads']]), 'superliga2627').join('\n');
    expect(t).toContain('FORÆLDET PR. RUNDE (gemt → genberegnet forfra af tips og kampe)');
    expect(t).toMatch(/^ {2}runde 1: 1 spiller\(e\), combi til gode i alt \+5\.7$/m);
    expect(t).toMatch(/^ {4}Søren +6 → +11\.7 {3}combi \+5\.7 {3}intet tip på 1 af kuponens 3$/m);
    expect(t).not.toMatch(/^ {4}Mads/m);
    expect(t).toContain('⚠️  1 spiller(e) har en FORÆLDET total — svaret er 🔄 Genberegn point for spillet, men kun med ejerens ja (det flytter stillingen).');
    expect(t).toContain('LÆS-ONLY — der er ikke skrevet noget.');
  });

  it('uden forældede: «ingen»-linjen og ingen ⚠️ om forældet', () => {
    const t = tabel(vurder([eFrisk], bets, kilde), new Map(), 'pl').join('\n');
    expect(t).toContain('  ingen — alle gemte totaler stemmer med en genberegning');
    expect(t).not.toMatch(/FORÆLDET total/);
    expect(t).toContain('✓ Ingen fejl fundet.');
  });

  it('uden kampene står afsnittet slet ikke (den gamle kontrol, uændret)', () => {
    const t = tabel(vurder([dGammel], bets), new Map(), 'x').join('\n');
    expect(t).not.toMatch(/FORÆLDET/);
  });

  // Security-mønstret: navne og rundenøgler i forældet-blokken er data fra
  // dokumentet og skal renses som i resten af tabellen.
  it('et fjendtligt navn eller en fjendtlig rundenøgle kan ikke skrive sin egen linje i forældet-blokken', () => {
    const gift = '\n::error::FALSK';
    const d = { ...dGammel, totalPoints: 7, perRound: { 1: 6, [gift]: 1 },
      opdelingPerRunde: { ...dGammel.opdelingPerRunde, [gift]: { p1x2: 1, chance: 0, combi: 0 } } };
    const linjer = tabel(vurder([d], bets, kilde), new Map([['d', '\n✓ Ingen fejl fundet.']]), 'x');
    for (const l of linjer) {
      expect(l).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/); // eslint-disable-line no-control-regex
      expect(l).not.toMatch(/^:/);
    }
    expect(linjer.filter((l) => l.startsWith('✓')).length).toBe(0);
    expect(linjer.join('\n')).toMatch(/^ {2}runde {2}::error::FALSK: 1 spiller/m);
  });
});
