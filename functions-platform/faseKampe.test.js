// ---------------------------------------------------------------------------
// NÆSTE FASES KAMPE (faseKampe.js, D9). Hver regel V1-V12 har sin egen røde
// test, og testene kører mod den RIGTIGE kalender (scripts/games.mjs) og de
// rigtige hold (src/data/haandboldVm2027Hold.js) — testkalenderen i
// src/test/faseKalender.js har 48 hovedrundekampe fra dag 7, produktionen 36
// fra dag 8.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { GAMES } from '../scripts/games.mjs';
import { HAANDBOLD_VM2027_HOLD } from '../src/data/haandboldVm2027Hold.js';
import program from '../scripts/haandbold-vm2027-program.json';
import { klassificeredeKampe } from '../scripts/lib/haandboldProgram.mjs';
import { TEST_FASER_EN_KVARTRUNDE } from '../src/test/faseKalender.js';

const require = createRequire(import.meta.url);
const {
  kbhTilMs, rundeForDato, kampePrDag, kampId, planFaseKampe, opretFaseKampeCore, retKickoffCore,
  faseVagtTilstand, faseStatus, naestePaamindelseMs, MAKS_KAMPE,
} = require('./faseKampe');
const { recomputeSeasonElo, levendeElo } = require('./gameScoring');
const { forventerFaseKampe } = require('./facit');
const { faseFor } = require('./faser');
const { outcomeOdds, oddsParametre, sportProfil } = require('./superligaScoring');

const FieldValue = { serverTimestamp: () => '@ts', delete: () => '@delete' };
const ts = (ms) => ({ toMillis: () => ms, __ts: ms });

/** Det rigtige spil — med holdlisten, som seedet skrev den. */
function spil(over = {}) {
  const g = GAMES.find((x) => x.id === 'hvm2027');
  return {
    ...g, id: 'hvm2027', teams: HAANDBOLD_VM2027_HOLD.map((t) => ({ ...t })), ...over,
  };
}

/** Den indledende runde, som den står i produktion (48 kampe, kickoff som tidspunkt). */
function indledende({ facit = false } = {}) {
  return program.fixtures.map((f) => ({
    id: f.id, round: f.round, home: f.home, away: f.away, kickoff: Date.parse(f.kickoff),
    ...(facit ? { result: '1', homeGoals: 30, awayGoals: 25 } : {}),
  }));
}

/** dansk tid → ms (januar: UTC+1). */
const dk = (dato, tid) => Date.parse(`${dato}T${tid}:00+01:00`);
// 18/1 kl. 21 dansk: den indledende runde er næsten spillet, hovedrunden (20/1) ligger foran.
const NU = dk('2027-01-18', '21:00');
const k = (dato, tid, hjemme, ude) => ({ dato, tid, hjemme, ude });

describe('kbhTilMs — dansk tid ind, ms ud', () => {
  it('vinter (UTC+1) og sommer (UTC+2)', () => {
    expect(kbhTilMs('2027-01-20', '18:00')).toBe(Date.parse('2027-01-20T17:00:00Z'));
    expect(kbhTilMs('2027-07-01', '18:00')).toBe(Date.parse('2027-07-01T16:00:00Z'));
  });
  it('et tidspunkt, der ikke findes (forårets spring), og ugyldigt input giver null', () => {
    expect(kbhTilMs('2027-03-28', '02:30')).toBeNull();
    expect(kbhTilMs('2027-02-30', '18:00')).toBeNull();
    expect(kbhTilMs('2027-01-20', '24:00')).toBeNull();
    expect(kbhTilMs('2027-01-20', '18.00')).toBeNull();
    expect(kbhTilMs(null, '18:00')).toBeNull();
  });
  it('efterårets dobbelttime: den FØRSTE — så lukker tippet aldrig for sent', () => {
    expect(kbhTilMs('2027-10-31', '02:30')).toBe(Date.parse('2027-10-31T00:30:00Z'));
  });
});

describe('V4 — dagen udledes af den danske dato', () => {
  const g = spil();
  it('kalenderens dage — og en hviledag/en dato uden for turneringen giver null', () => {
    expect(rundeForDato(g, '2027-01-13')).toBe(1);
    expect(rundeForDato(g, '2027-01-20')).toBe(8);
    expect(rundeForDato(g, '2027-01-25')).toBe(13);
    // Kvartfinalerne er ÉN runde over to datoer (sidsteDato). Før: 26/1 → 14,
    // 27/1 → 15, semi 16, finale 17.
    expect(rundeForDato(g, '2027-01-26')).toBe(14);
    expect(rundeForDato(g, '2027-01-27')).toBe(14);
    expect(rundeForDato(g, '2027-01-28')).toBeNull(); // hviledag
    expect(rundeForDato(g, '2027-01-29')).toBe(15);
    expect(rundeForDato(g, '2027-01-31')).toBe(16);
    expect(rundeForDato(g, '2027-02-01')).toBeNull();
    expect(rundeForDato(g, '2027-01-12')).toBeNull();
  });
  // ANTAGELSEN, V4 hviler på (dagene inden i en fase ligger i træk), og den
  // B2 hviler på (kampe pr. RUNDE = antalKampe/runder): bundet mod Wikipedias
  // egne bokse for hovedrunde og knockout. Ændres programmet, bliver den rød.
  // PR. RUNDE, ikke pr. dato: kvartfinalerne er én runde med 2 kampe 26/1 og
  // 2 kampe 27/1 — pr. dato ville 2 ≠ 4 (QC B6: skrevet om, ikke slettet).
  it('hver hovedrunde- og knockout-boks i Wikipedias program giver en runde i den rigtige fase — med kalenderens antal pr. runde', () => {
    const { kampe } = klassificeredeKampe(readFileSync(new URL('../scripts/testdata/wiki-vm2027.wikitext', import.meta.url), 'utf8'));
    const NAVN = {
      hoved: 'Hovedrunde', kvart: 'Kvartfinaler', semi: 'Semifinaler', finale: 'Finaledag',
    };
    const senere = kampe.filter((x) => NAVN[x.fase]);
    expect(senere.length).toBe(36 + 4 + 2 + 2);
    const prRunde = new Map();
    const datoerPrRunde = new Map();
    for (const x of senere) {
      const r = rundeForDato(g, x.dato);
      expect(faseFor(g, r)?.navn, `${x.fase} ${x.dato}`).toBe(NAVN[x.fase]);
      prRunde.set(r, (prRunde.get(r) || 0) + 1);
      datoerPrRunde.set(r, new Set([...(datoerPrRunde.get(r) || []), x.dato]));
    }
    for (const [r, n] of prRunde) {
      expect(n, `runde ${r}`).toBe(kampePrDag(faseFor(g, r)));
    }
    // Runderne 8-16 har alle kampe på siden — og kun runde 14 går over to datoer.
    expect([...prRunde.keys()].sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(prRunde.get(14)).toBe(4);
    expect([...datoerPrRunde].filter(([, d]) => d.size > 1).map(([r, d]) => [r, [...d].sort()]))
      .toEqual([[14, ['2027-01-26', '2027-01-27']]]);
  });
  it('kampe pr. runde: 36/6 = 6, kvartfinalerne 4/1 = 4 (før 4/2 = 2), semi 2 — den indledende runde (48/7) har intet fast tal', () => {
    expect(kampePrDag(faseFor(g, 8))).toBe(6);
    expect(kampePrDag(faseFor(g, 14))).toBe(4);
    expect(kampePrDag(faseFor(g, 15))).toBe(2);
    expect(kampePrDag(faseFor(g, 16))).toBe(2);
    expect(kampePrDag(faseFor(g, 1))).toBeNull();
  });
});

describe('V10 — kamp-id som programmet', () => {
  it('kernens id for hver af de 48 kampe i den indledende runde = programmets id', () => {
    const perNavn = new Map(HAANDBOLD_VM2027_HOLD.map((t) => [t.name, t]));
    for (const f of program.fixtures) {
      expect(kampId(f.round, perNavn.get(f.home), perNavn.get(f.away))).toBe(f.id);
    }
    expect(program.fixtures.length).toBe(48);
  });
  // QC B9: id'et bygges af hbKode (kildens nøgle), ikke af short. De er ens i
  // dag, så paritetstesten ovenfor kan ikke se forskel — det kan denne.
  it('bygges af hbKode, ikke short', () => {
    expect(kampId(8, { short: 'XXX', hbKode: 'DEN' }, { short: 'YYY', hbKode: 'NOR' })).toBe('r8-den-nor');
  });
});

describe('V1 — kun et spil, der forventer fasekampe', () => {
  it('forventerFaseKampe: åbent/igangværende kampspil MED gyldig kalender', () => {
    expect(forventerFaseKampe(spil())).toBe(true);
    expect(forventerFaseKampe(spil({ status: 'live' }))).toBe(true);
    expect(forventerFaseKampe(spil({ status: 'finished' }))).toBe(false);
    expect(forventerFaseKampe({ type: 'football', status: 'live' })).toBe(false); // SL/PL: ingen kalender
    expect(forventerFaseKampe(spil({ faser: [{ ...spil().faser[0], fra: 2 }] }))).toBe(false); // ugyldig kalender
    expect(forventerFaseKampe(spil({ type: 'cycling' }))).toBe(false);
  });
  it('planen afviser HELE kaldet for et spil uden kalender, et afsluttet spil og en ukendt sport', () => {
    for (const g of [{ id: 'sl', type: 'football', status: 'live', teams: [] }, spil({ status: 'finished' })]) {
      expect(() => planFaseKampe(g, [], [], NU)).toThrow(/åbent eller igangværende kampspil med en gyldig fasekalender/);
    }
    expect(() => planFaseKampe(spil({ sport: 'handbold' }), [], [], NU)).toThrow(/som ikke er en kendt sport/);
    try { planFaseKampe(spil({ status: 'finished' }), [], [], NU); } catch (e) { expect(e.kode).toBe('failed-precondition'); }
  });
  it('højst MAKS_KAMPE ad gangen', () => {
    const mange = Array.from({ length: MAKS_KAMPE + 1 }, () => k('2027-01-20', '18:00', 'Danmark', 'Norge'));
    expect(() => planFaseKampe(spil(), [], mange, NU)).toThrow(/Højst 48/);
  });
});

describe('planFaseKampe — en hovedrundedag lægges ind', () => {
  const g = spil();
  it('gyldige kampe: id, dag, holdnavn fra listen, kickoff i dansk tid og etiket', () => {
    const p = planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge')], NU);
    expect(p.fejl).toEqual([]);
    expect(p.nye).toHaveLength(1);
    expect(p.nye[0]).toMatchObject({
      id: 'r8-den-nor', round: 8, home: 'Danmark', away: 'Norge', kickoff: Date.parse('2027-01-20T17:00:00Z'),
      etiket: 'Hovedrunde · dag 1', tid: 'ons 20/1 kl. 18.00',
    });
    expect(p.aftryk).toMatch(/^[0-9a-f]{32}$/);
  });

  // B8: «har en kamp i fasen før», ikke «har facit» — så hovedrunden kan
  // tørkøres ved generalprøven i december, før en eneste kamp er spillet.
  it('V9 (B8): hovedrunden kan planlægges, før den indledende runde har facit', () => {
    const p = planFaseKampe(g, indledende({ facit: false }), [k('2027-01-20', '18:00', 'Danmark', 'Norge')], NU);
    expect(p.fejl).toEqual([]);
  });

  it('V2: et ukendt hold, et hold uden elo, uden hbKode og en tvetydig hbKode afvises — med holdets navn', () => {
    const ingen = (hold) => planFaseKampe(spil({ teams: hold }), indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge')], NU).fejl;
    expect(planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Narnia')], NU).fejl[0].tekst)
      .toBe('«Narnia» står ikke i spillets holdliste');
    const medUden = (felt, v) => HAANDBOLD_VM2027_HOLD.map((t) => (t.name === 'Norge' ? { ...t, [felt]: v } : { ...t }));
    expect(ingen(medUden('elo', '1637'))[0].tekst).toMatch(/«Norge» har ingen elo, der er et tal/);
    expect(ingen(medUden('elo', undefined))[0].tekst).toMatch(/«Norge» har ingen elo/);
    expect(ingen(medUden('hbKode', undefined))[0].tekst).toMatch(/«Norge» har ingen hbKode/);
    expect(ingen(medUden('hbKode', 'DEN'))[0].tekst).toMatch(/hbKode «DEN» står på 2 hold/);
    const dobbelt = [...HAANDBOLD_VM2027_HOLD.map((t) => ({ ...t })), { ...HAANDBOLD_VM2027_HOLD.find((t) => t.name === 'Norge'), hbKode: 'NO2' }];
    expect(ingen(dobbelt)[0].tekst).toMatch(/«Norge» står 2 gange/);
    expect(planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', '', 'Norge')], NU).fejl[0].tekst).toBe('et hold mangler');
  });

  it('V3: samme hold to gange, og et hold, der allerede spiller dagen — også i samme kald', () => {
    expect(planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Norge', 'Norge')], NU).fejl[0].tekst)
      .toBe('Norge kan ikke møde sig selv');
    const findes = [...indledende(), { id: 'r8-den-swe', round: 8, home: 'Danmark', away: 'Sverige', kickoff: dk('2027-01-20', '20:30') }];
    expect(planFaseKampe(g, findes, [k('2027-01-20', '18:00', 'Norge', 'Danmark')], NU).fejl[0].tekst)
      .toBe('Danmark spiller allerede Hovedrunde · dag 1');
    const toGange = planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge'), k('2027-01-20', '20:30', 'Sverige', 'Norge')], NU);
    expect(toGange.fejl).toEqual([{ linje: 2, tekst: 'Norge spiller allerede Hovedrunde · dag 1' }]);
    expect(toGange.nye.map((n) => n.id)).toEqual(['r8-den-nor']);
    // En anden dag er fin.
    expect(planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge'), k('2027-01-21', '18:00', 'Sverige', 'Norge')], NU).fejl).toEqual([]);
  });

  it('V4: en dato, der ikke er en spilledag, afvises', () => {
    expect(planFaseKampe(g, indledende(), [k('2027-01-28', '18:00', 'Danmark', 'Norge')], NU).fejl[0].tekst)
      .toBe('2027-01-28 er ikke en spilledag i kalenderen');
  });

  it('V5: en kamp, der ikke kan nå at blive tippet, afvises — grænsen er nu + låsemarginen (60 s)', () => {
    const kickoff = dk('2027-01-20', '18:00');
    const linje = [k('2027-01-20', '18:00', 'Danmark', 'Norge')];
    expect(planFaseKampe(g, indledende(), linje, kickoff - 60_000).fejl[0].tekst).toMatch(/er passeret/);
    expect(planFaseKampe(g, indledende(), linje, kickoff - 60_001).fejl).toEqual([]);
    expect(planFaseKampe(g, indledende(), linje, dk('2027-01-20', '19:00')).fejl[0].tekst)
      .toBe('ons 20/1 kl. 18.00 er passeret — en kamp skal kunne tippes, før den går i gang');
  });

  it('V6: en kamp, der findes, overskrives aldrig', () => {
    const findes = [...indledende(), { id: 'r8-den-nor', round: 8, home: 'Danmark', away: 'Norge', kickoff: dk('2027-01-20', '18:00') }];
    // Samme id på en anden tid er stadig samme kamp — samme dag, samme hold,
    // så V3 afviser den; skrivningen selv er create (testet nedenfor).
    const p = planFaseKampe(g, findes, [k('2027-01-20', '20:30', 'Danmark', 'Norge')], NU);
    expect(p.fejl[0].tekst).toBe('Danmark spiller allerede Hovedrunde · dag 1');
    expect(p.nye).toEqual([]);
  });

  // V7 (ejerens valg 3/11): åben til dagens FØRSTE kickoff. Spilfører: kunne
  // man tilføje efter første kickoff, kunne Runde-Botten poste en halv dag.
  it('V7: en dag, der er gået i gang, kan ikke få flere kampe — en dag med kun fremtidige kampe kan', () => {
    const forste = dk('2027-01-20', '15:30');
    const findes = [...indledende(), { id: 'r8-isl-cro', round: 8, home: 'Island', away: 'Kroatien', kickoff: forste }];
    const linje = [k('2027-01-20', '20:30', 'Danmark', 'Norge')];
    expect(planFaseKampe(g, findes, linje, forste - 61_000).fejl).toEqual([]);
    const lukket = planFaseKampe(g, findes, linje, forste - 60_000);
    expect(lukket.fejl[0].tekst).toMatch(/Hovedrunde · dag 1 er gået i gang/);
    expect(lukket.fejl[0].tekst).toMatch(/konsollen/);
  });

  it('V8: fasen får højst antalKampe — 36 i hovedrunden', () => {
    const fyldt = [...indledende()];
    for (let i = 0; i < 36; i += 1) fyldt.push({ id: `x${i}`, round: 8 + (i % 6), home: `A${i}`, away: `B${i}`, kickoff: dk('2027-01-25', '23:00') });
    const p = planFaseKampe(g, fyldt.slice(0, 48 + 35), [k('2027-01-25', '18:00', 'Danmark', 'Norge'), k('2027-01-25', '20:30', 'Sverige', 'Island')], NU);
    expect(p.fejl).toContainEqual({ linje: 0, tekst: 'Hovedrunde har 35 kampe, og 2 til giver 37 — kalenderen siger 36' });
    // 35 + 1 = 36 er fint.
    expect(planFaseKampe(g, fyldt.slice(0, 48 + 35), [k('2027-01-25', '18:00', 'Danmark', 'Norge')], NU).fejl).toEqual([]);
  });

  it('V9: et hold uden en kamp i fasen før afvises', () => {
    const medGroenland = spil({ teams: [...HAANDBOLD_VM2027_HOLD.map((t) => ({ ...t })), { name: 'Grønland', hbKode: 'GRL', elo: 900 }] });
    expect(planFaseKampe(medGroenland, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Grønland')], NU).fejl[0].tekst)
      .toBe('Grønland har ingen kamp i den indledende runde');
  });

  // V11: prisen er den levende, UAFRUNDEDE Elo med sportens parametre.
  it('V11: odds = outcomeOdds på levendeElo — Tyskland mod Uruguay står til loftet 25', () => {
    const kampe = indledende({ facit: true });
    const p = planFaseKampe(g, kampe, [k('2027-01-20', '18:00', 'Tyskland', 'Uruguay')], NU);
    const profil = sportProfil(g);
    const { get } = levendeElo(g.teams, kampe, profil);
    expect(p.nye[0].eloHome).toBe(get('Tyskland'));
    expect(Number.isInteger(p.nye[0].eloHome)).toBe(false); // uafrundet — ikke eloCurrent
    expect(p.nye[0].odds).toEqual(outcomeOdds({ eloHome: get('Tyskland'), eloAway: get('Uruguay'), ...oddsParametre(profil) }));
    // Med start-Elo (1894 mod 838) ville udeholdet stå til 461,77 uden loft;
    // loftet i håndboldprofilen (oddsMax 25) giver 25.
    const start = planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Tyskland', 'Uruguay')], NU);
    expect(start.nye[0].odds['2']).toBe(25);
    expect(outcomeOdds({ eloHome: 1894, eloAway: 838, ...oddsParametre(profil), oddsMax: 1000 })['2']).toBe(461.77);
  });

  it('status: serveren tæller — fase for fase og de åbne dage, der mangler kampe', () => {
    const p = planFaseKampe(g, indledende(), [], NU);
    expect(p.nye).toEqual([]);
    expect(p.status.linjer[0]).toBe('Hovedrunde: 0 af 36 kampe er lagt ind.');
    expect(p.status.aabneDage[0]).toEqual({ runde: 8, etiket: 'Hovedrunde · dag 1 (ons 20/1)', dato: '2027-01-20', har: 0, forventet: 6 });
    // Den indledende runde er hel — og dag 7 (19/1) er stadig åben, men mangler intet.
    expect(p.status.aabneDage.some((d) => d.runde <= 7)).toBe(false);
  });
});

describe('advarslerne — det, ejeren skal vide, før han trykker', () => {
  const g = spil();
  it('«Ingen automatisk påmindelse»: lagt ind efter kl. 9 samme dag — og ikke, når påmindelsen kl. 9 når den', () => {
    const efter9 = dk('2027-01-20', '10:00');
    const p = planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge')], efter9);
    expect(p.advarsler[0]).toBe('Ingen automatisk påmindelse når de nye kampe (Danmark–Norge ons 20/1 kl. 18.00): påmindelsen kører kl. 9, og den næste er efter kampstart. Send den fra Admin → 🔔 Påmindelser.');
    const foer9 = dk('2027-01-20', '08:00');
    expect(planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge')], foer9).advarsler.join('\n'))
      .not.toMatch(/påmindelse/i);
    expect(planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge')], NU).advarsler.join('\n'))
      .not.toMatch(/påmindelse/i);
    expect(naestePaamindelseMs(dk('2027-01-20', '09:00'))).toBe(dk('2027-01-21', '09:00'));
    expect(naestePaamindelseMs(dk('2027-01-20', '08:59'))).toBe(dk('2027-01-20', '09:00'));
  });
  it('en halv dag: «x af 6» — og puls-linjen, så længe hovedrunden ikke er hel', () => {
    const p = planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge')], NU);
    expect(p.advarsler).toContain('Hovedrunde · dag 1 (ons 20/1): 1 af 6 kampe efter denne oprettelse. Læg helst hele dagen ind ad gangen — Tip-siden ser færdig ud med en halv dag.');
    expect(p.advarsler).toContain('Hovedrunde: 1 af 36 efter denne oprettelse. «Stadig med»-linjen i puljen og Runde-Botten fortæller først, hvilke pulje-hold der er ude, når alle 36 er lagt ind.');
    expect(p.puljeAfgoeres).toBe(false);
    expect(p.advarsler.join('\n')).not.toMatch(/afgøres/);
  });

  // Test Manager (d9puls, BØR 2): advarslernes NEGATIVE grene var ubundne —
  // hver betingelse kunne fjernes, og advarslen kom så også, hvor den lyver.
  const HR_DAG1 = [
    ['14:00', 'Tyskland', 'Danmark'], ['15:30', 'Frankrig', 'Serbien'], ['17:00', 'Norge', 'Sverige'],
    ['18:00', 'Spanien', 'Kroatien'], ['19:30', 'Egypten', 'Island'], ['20:30', 'Portugal', 'Slovenien'],
  ].map(([tid, h, u]) => k('2027-01-20', tid, h, u));

  it('en HEL dag giver ingen «x af 6»-advarsel — og en dag, oprettelsen ikke rører, heller ikke', () => {
    const p = planFaseKampe(g, indledende(), HR_DAG1, NU);
    expect(p.fejl).toEqual([]);
    expect(p.nye).toHaveLength(6);
    // Dag 1 er hel (6 af 6), dag 2-6 har 0 af 6 — men er ikke rørt af kaldet.
    expect(p.advarsler.join('\n')).not.toMatch(/kampe efter denne oprettelse/);
    expect(p.advarsler.join('\n')).not.toMatch(/dag \d \(/);
    // Pulslinjen for fasen står der stadig (6 af 36) — kontrollen, at listen ikke bare er tom.
    expect(p.advarsler).toContain('Hovedrunde: 6 af 36 efter denne oprettelse. «Stadig med»-linjen i puljen og Runde-Botten fortæller først, hvilke pulje-hold der er ude, når alle 36 er lagt ind.');
  });

  it('«stadig med»-advarslen kommer kun for en runde-pulje', () => {
    const officiel = spil({ pulje: { ...g.pulje, facitKilde: 'officiel' } });
    const p = planFaseKampe(officiel, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge')], NU);
    expect(p.fejl).toEqual([]);
    // Dags-advarslen kommer stadig — kun pulslinjen forsvinder.
    expect(p.advarsler).toContain('Hovedrunde · dag 1 (ons 20/1): 1 af 6 kampe efter denne oprettelse. Læg helst hele dagen ind ad gangen — Tip-siden ser færdig ud med en halv dag.');
    expect(p.advarsler.join('\n')).not.toMatch(/Stadig med/);
  });

  it('«stadig med»-advarslen kommer ikke, når fasen bliver HEL — og ikke for puljens egen facit-fase', () => {
    const hr = hovedrunde({ facit: false });
    const sidste = hr[hr.length - 1];
    const hel = planFaseKampe(g, [...indledende({ facit: true }), ...hr.slice(0, -1)], [k('2027-01-25', '21:00', sidste.home, sidste.away)], dk('2027-01-19', '23:00'));
    expect(hel.fejl).toEqual([]);
    expect(hel.advarsler.join('\n')).not.toMatch(/Stadig med/);
    // Facit-fasen (semifinalerne): én af to — puljen afgøres ikke, men den
    // fortæller ikke om «stadig med», for dér er puljen selve facit.
    expect(g.pulje.facitFase).toBe('Semifinaler');
    const enSf = planFaseKampe(g, KV, [k('2027-01-29', '17:30', 'Tyskland', 'Danmark')], NU_KO);
    expect(enSf.fejl).toEqual([]);
    expect(enSf.advarsler.join('\n')).not.toMatch(/Stadig med/);
  });

  it('puljeAfgoeres: false, når puljen allerede KUNNE afgøres før oprettelsen', () => {
    const sf = [
      { id: 'r15-ger-den', round: 15, home: 'Tyskland', away: 'Danmark', kickoff: dk('2027-01-29', '17:30'), result: '2', homeGoals: 29, awayGoals: 33 },
      { id: 'r15-swe-esp', round: 15, home: 'Sverige', away: 'Spanien', kickoff: dk('2027-01-29', '20:30'), result: '1', homeGoals: 30, awayGoals: 28 },
    ];
    const p = planFaseKampe(g, [...KV, ...sf], [k('2027-01-31', '14:30', 'Tyskland', 'Spanien'), k('2027-01-31', '17:30', 'Danmark', 'Sverige')], dk('2027-01-30', '12:00'));
    expect(p.fejl).toEqual([]);
    expect(p.puljeAfgoeres).toBe(false);
    expect(p.advarsler.join('\n')).not.toMatch(/afgøres/);
  });
});

// Knockout-faserne — det, der kun kan bevises i unit-tests før januar.
// Kvartfinalerne er ÉN runde (14) over tir 26/1 og ons 27/1; semifinalerne
// er runde 15 og finaledagen 16 (før: kvart 14 + 15, semi 16, finale 17).
const KV = [
  { id: 'r14-ger-srb', round: 14, home: 'Tyskland', away: 'Serbien', kickoff: dk('2027-01-26', '18:00'), result: '1', homeGoals: 31, awayGoals: 30 },
  { id: 'r14-den-nor', round: 14, home: 'Danmark', away: 'Norge', kickoff: dk('2027-01-26', '20:30'), result: 'X', homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } },
  { id: 'r14-fra-swe', round: 14, home: 'Frankrig', away: 'Sverige', kickoff: dk('2027-01-27', '18:00'), result: '2', homeGoals: 28, awayGoals: 29 },
  { id: 'r14-esp-cro', round: 14, home: 'Spanien', away: 'Kroatien', kickoff: dk('2027-01-27', '20:30'), result: '1', homeGoals: 27, awayGoals: 25 },
];
const NU_KO = dk('2027-01-27', '23:30');

/**
 * En hel hovedrunde: 24 hold i fire grupper à seks, hvert hold tre kampe
 * (gruppens tre første mod dens tre sidste, én modstander pr. spillerunde) —
 * 36 kampe over dag 8-13, seks pr. dag og hvert hold højst én gang pr. dag.
 * Kvartfinalernes otte hold er med.
 */
const HR_GRUPPER = [
  ['Tyskland', 'Danmark', 'Frankrig', 'Serbien', 'Norge', 'Sverige'],
  ['Spanien', 'Kroatien', 'Egypten', 'Island', 'Portugal', 'Slovenien'],
  ['Polen', 'Brasilien', 'Argentina', 'Tunesien', 'Italien', 'Færøerne'],
  ['Qatar', 'Japan', 'Chile', 'Tyrkiet', 'Kap Verde', 'Grækenland'],
];
function hovedrunde({ facit = true } = {}) {
  const par = [];
  for (let r = 0; r < 3; r += 1) {
    for (const g of HR_GRUPPER) for (let j = 0; j < 3; j += 1) par.push([g[j], g[3 + ((j + r) % 3)]]);
  }
  return par.map(([home, away], i) => {
    const round = 8 + Math.floor(i / 6);
    const dato = `2027-01-${20 + Math.floor(i / 6)}`;
    return {
      id: `hr-${i}`, round, home, away, kickoff: dk(dato, ['14:00', '15:30', '17:00', '18:00', '19:30', '20:30'][i % 6]),
      ...(facit ? { result: '1', homeGoals: 30, awayGoals: 25 } : {}),
    };
  });
}

describe('V9 — knockout: semifinalerne kan kun bestå af kvartfinalernes vindere', () => {
  const g = spil();
  it('vindere mod vindere: godkendt, og puljen afgøres, når begge semifinaler er der (B3)', () => {
    const p = planFaseKampe(g, KV, [k('2027-01-29', '17:30', 'Tyskland', 'Danmark'), k('2027-01-29', '20:30', 'Sverige', 'Spanien')], NU_KO);
    expect(p.fejl).toEqual([]);
    expect(p.puljeAfgoeres).toBe(true);
    expect(p.advarsler).toContain('Når du opretter disse, afgøres 🏆 Semifinalisterne, og bonussen skrives på stillingen med det samme.');
    // Kun den ene semifinale: ikke afgjort endnu.
    expect(planFaseKampe(g, KV, [k('2027-01-29', '17:30', 'Tyskland', 'Danmark')], NU_KO).puljeAfgoeres).toBe(false);
  });
  it('en vinder mod en taber, og to tabere, afvises', () => {
    expect(planFaseKampe(g, KV, [k('2027-01-29', '17:30', 'Tyskland', 'Norge')], NU_KO).fejl[0].tekst)
      .toBe('Tyskland–Norge parrer en vinder med en taber fra kvartfinalerne');
    expect(planFaseKampe(g, KV, [k('2027-01-29', '17:30', 'Serbien', 'Norge')], NU_KO).fejl[0].tekst)
      .toBe('Serbien og Norge tabte i kvartfinalerne — kun vinderne går videre til semifinalerne');
  });
  it('et hold, der ikke var i kvartfinalerne, afvises', () => {
    expect(planFaseKampe(g, KV, [k('2027-01-29', '17:30', 'Tyskland', 'Island')], NU_KO).fejl[0].tekst)
      .toBe('Island har ingen kamp i kvartfinalerne');
  });
  it('en kvartfinale uden facit, og en halv kvartfinalerunde, blokerer — med det, der mangler', () => {
    const udenFacit = KV.map((m, i) => (i === 3 ? { ...m, result: null, homeGoals: null, awayGoals: null } : m));
    expect(planFaseKampe(g, udenFacit, [k('2027-01-29', '17:30', 'Tyskland', 'Danmark')], NU_KO).fejl[0].tekst)
      .toBe('Kvartfinalerne er ikke afgjort: Spanien–Kroatien mangler facit (sæt det under ✍️)');
    // B8: uafgjort efter 60 min uden slut → fejlteksten peger på slutresultatet.
    const udenSlut = KV.map((m, i) => (i === 1 ? { ...m, slut: undefined } : m));
    expect(planFaseKampe(g, udenSlut, [k('2027-01-29', '17:30', 'Tyskland', 'Danmark')], NU_KO).fejl[0].tekst)
      .toBe('Kvartfinalerne er ikke afgjort: Danmark–Norge stod lige efter 60 min og mangler slutresultatet efter forlængelse (sæt det under ✍️)');
    expect(planFaseKampe(g, KV.slice(0, 3), [k('2027-01-29', '17:30', 'Tyskland', 'Danmark')], NU_KO).fejl[0].tekst)
      .toBe('Kvartfinalerne er ikke lagt helt ind (3 af 4 kampe) — semifinalerne kan først lægges ind, når alle vindere kendes');
  });
  it('finaledagen: to vindere (finalen) og to tabere (bronzen) — fasen rummer alle semifinalens hold', () => {
    const sf = [
      { id: 'r15-ger-den', round: 15, home: 'Tyskland', away: 'Danmark', kickoff: dk('2027-01-29', '17:30'), result: '2', homeGoals: 29, awayGoals: 33 },
      { id: 'r15-swe-esp', round: 15, home: 'Sverige', away: 'Spanien', kickoff: dk('2027-01-29', '20:30'), result: '1', homeGoals: 30, awayGoals: 28 },
    ];
    const p = planFaseKampe(g, [...KV, ...sf], [k('2027-01-31', '14:30', 'Tyskland', 'Spanien'), k('2027-01-31', '17:30', 'Danmark', 'Sverige')], dk('2027-01-30', '12:00'));
    expect(p.fejl).toEqual([]);
    expect(planFaseKampe(g, [...KV, ...sf], [k('2027-01-31', '17:30', 'Danmark', 'Spanien')], dk('2027-01-30', '12:00')).fejl[0].tekst)
      .toBe('Danmark–Spanien parrer en vinder med en taber fra semifinalerne');
  });
});

// QC på d9puls, Bør 1: create-only gør en tastefejl permanent — derfor afvises
// de to former, der ellers først blev en advarsel bagefter.
describe('V3/V8 — tastefejl, der ikke kan slettes, afvises før oprettelsen', () => {
  const g = spil();
  const foerKV = [...indledende({ facit: true }), ...hovedrunde()];
  const NU_HR_SLUT = dk('2027-01-25', '23:30');

  // Kvartfinalerne er nu ÉN runde over to datoer, så «dag 1/dag 2» er blevet
  // til «tirsdag/onsdag» i samme runde 14 — reglen (hele fasen) er den samme.
  it('V3 i knockout: et hold højst én gang i HELE fasen — kvartfinalerne går over to datoer', () => {
    // QC's eget forsøg: Danmark 26/1 og igen 27/1 i samme kald.
    const toDage = planFaseKampe(g, foerKV, [k('2027-01-26', '18:00', 'Danmark', 'Frankrig'), k('2027-01-27', '18:00', 'Danmark', 'Spanien')], NU_HR_SLUT);
    expect(toDage.fejl).toEqual([{ linje: 2, tekst: 'Danmark spiller allerede i kvartfinalerne (Danmark–Frankrig, Kvartfinaler) — et hold spiller højst én kamp i en knockout-fase' }]);
    expect(toDage.nye.map((n) => n.id)).toEqual(['r14-den-fra']);
    // Og mod en kamp, der allerede findes, på den anden dato.
    const findes = [...foerKV, { id: 'r14-den-nor', round: 14, home: 'Danmark', away: 'Norge', kickoff: dk('2027-01-26', '20:30') }];
    expect(planFaseKampe(g, findes, [k('2027-01-27', '18:00', 'Spanien', 'Danmark')], NU_HR_SLUT).fejl[0].tekst)
      .toBe('Danmark spiller allerede i kvartfinalerne (Danmark–Norge, Kvartfinaler) — et hold spiller højst én kamp i en knockout-fase');
    // Kontrol: to andre hold onsdag er fine — og havner i SAMME runde.
    const ons = planFaseKampe(g, findes, [k('2027-01-27', '18:00', 'Spanien', 'Kroatien')], NU_HR_SLUT);
    expect(ons.fejl).toEqual([]);
    expect(ons.nye.map((n) => [n.id, n.round])).toEqual([['r14-esp-cro', 14]]);
    // Og den anden vej: onsdagens kamp lagt ind FØR tirsdagens.
    const onsFoerst = [...foerKV, { id: 'r14-den-esp', round: 14, home: 'Danmark', away: 'Spanien', kickoff: dk('2027-01-27', '18:00') }];
    expect(planFaseKampe(g, onsFoerst, [k('2027-01-26', '18:00', 'Frankrig', 'Danmark')], NU_HR_SLUT).fejl[0].tekst)
      .toBe('Danmark spiller allerede i kvartfinalerne (Danmark–Spanien, Kvartfinaler) — et hold spiller højst én kamp i en knockout-fase');
  });

  it('V3 uden for knockout er stadig pr. dag — samme hold på to hovedrundedage er fint', () => {
    const p = planFaseKampe(g, indledende(), [k('2027-01-20', '18:00', 'Danmark', 'Norge'), k('2027-01-21', '18:00', 'Danmark', 'Sverige')], NU);
    expect(p.fejl).toEqual([]);
  });

  it('V8: bliver fasen HEL med en skæv fordeling (forbytning), afvises den — samme regel som pulsen', () => {
    const hr = hovedrunde({ facit: false });
    const sidste = hr[hr.length - 1];
    const uden = [...indledende({ facit: true }), ...hr.slice(0, -1)];
    const nu = dk('2027-01-19', '23:00');
    const dato = '2027-01-25';
    // Rigtig: den manglende kamp → hel og lige (3/3).
    expect(planFaseKampe(g, uden, [k(dato, '21:00', sidste.home, sidste.away)], nu).fejl).toEqual([]);
    // Forbyttet: Danmark (spiller ikke dag 13) i stedet for udeholdet — Danmark
    // får 4 kampe, udeholdet 2. Antallet passer (36), fordelingen ikke.
    expect(hr.filter((m) => m.round === 13).some((m) => m.home === 'Danmark' || m.away === 'Danmark')).toBe(false);
    const skaev = planFaseKampe(g, uden, [k(dato, '21:00', sidste.home, 'Danmark')], nu);
    expect(skaev.fejl).toEqual([{
      linje: 0,
      tekst: `«Hovedrunde» har 36 kampe, men holdene står ikke lige mange gange (Danmark 4, ${sidste.away} 2 — forventet 3). Ret tastningen — en oprettet kamp kan ikke slettes i appen.`,
    }]);
    // Ikke hel endnu (34 + 1): ingen fordelingsfejl — den kommer, når fasen bliver hel.
    expect(planFaseKampe(g, [...indledende({ facit: true }), ...hr.slice(0, -2)], [k(dato, '21:00', sidste.home, 'Danmark')], nu).fejl).toEqual([]);
  });
});

// --- Fake-Firestore med create-semantik -----------------------------------
// `skjulte`: dokumenter, der FINDES, men ikke var med i læsningen — en anden
// admin, der var hurtigere. Så kan atomiciteten (V6) bevises.
function makeDb(game, kampe, { skjulte = [] } = {}) {
  const docs = new Map(kampe.map((m) => [m.id, { ...m }]));
  for (const s of skjulte) docs.set(s.id, { ...s });
  const skjult = new Set(skjulte.map((s) => s.id));
  const opdateringer = [];
  let spilSkrivninger = 0;
  const kampRef = (id) => ({
    __id: id,
    async update(data, opts) { opdateringer.push({ id, data, opts }); docs.set(id, { ...docs.get(id), ...data }); },
  });
  const matchesCol = {
    async get() {
      return {
        docs: [...docs].filter(([id]) => !skjult.has(id)).map(([id, d]) => ({
          id, data: () => d, ref: kampRef(id), updateTime: `t-${id}`,
        })),
      };
    },
    doc: (id) => kampRef(id),
  };
  const gameRef = {
    async get() { return game ? { exists: true, data: () => game } : { exists: false, data: () => undefined }; },
    async set() { spilSkrivninger += 1; },
    async update() { spilSkrivninger += 1; },
    collection: (n) => { if (n !== 'matches') throw new Error(`uventet ${n}`); return matchesCol; },
  };
  return {
    _docs: docs,
    _opdateringer: opdateringer,
    get _spilSkrivninger() { return spilSkrivninger; },
    collection: (n) => { if (n !== 'games') throw new Error(`uventet ${n}`); return { doc: () => gameRef }; },
    batch() {
      const ops = [];
      return {
        create(ref, data) { ops.push({ op: 'create', id: ref.__id, data }); },
        set(ref, data) { ops.push({ op: 'set', id: ref.__id, data }); },
        update(ref, data) { ops.push({ op: 'update', id: ref.__id, data }); },
        async commit() {
          for (const o of ops) {
            if (o.op === 'create' && docs.has(o.id)) { const e = new Error('6 ALREADY_EXISTS: Document already exists'); e.code = 6; throw e; }
          }
          for (const o of ops) docs.set(o.id, o.op === 'create' ? o.data : { ...(docs.get(o.id) || {}), ...o.data });
        },
      };
    },
  };
}

describe('opretFaseKampeCore — tør-kørsel, aftryk og create-only', () => {
  const linjer = [k('2027-01-20', '18:00', 'Danmark', 'Norge'), k('2027-01-20', '20:30', 'Sverige', 'Island')];

  it('tør-kørsel er standard og skriver INTET', async () => {
    const db = makeDb(spil(), indledende());
    const res = await opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: linjer, nowMs: NU, tilTimestamp: ts });
    expect(res).toMatchObject({ dryRun: true, skrevet: false });
    expect(res.nye.map((n) => n.id)).toEqual(['r8-den-nor', 'r8-swe-isl']);
    expect(db._docs.size).toBe(48);
  });

  it('V12: skriver PRÆCIS kampens felter — kickoff som tidspunkt — og rører ikke spil-dokumentet', async () => {
    const db = makeDb(spil(), indledende());
    const toer = await opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: linjer, nowMs: NU, tilTimestamp: ts });
    const res = await opretFaseKampeCore(db, FieldValue, {
      gameId: 'hvm2027', kampe: linjer, nowMs: NU, tilTimestamp: ts, dryRun: false, aftryk: toer.aftryk,
    });
    expect(res).toMatchObject({ dryRun: false, skrevet: true });
    const d = db._docs.get('r8-den-nor');
    expect(Object.keys(d).sort()).toEqual(['away', 'eloAway', 'eloHome', 'home', 'kickoff', 'odds', 'round', 'updatedAt']);
    expect(d).toMatchObject({ round: 8, home: 'Danmark', away: 'Norge', updatedAt: '@ts' });
    expect(d.kickoff.__ts).toBe(Date.parse('2027-01-20T17:00:00Z'));
    expect(db._spilSkrivninger).toBe(0);
    expect(res.puljeAfregnet).toBeUndefined();
  });

  it('uden aftryk, eller med et forældet, skrives intet', async () => {
    const db = makeDb(spil(), indledende());
    await expect(opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: linjer, nowMs: NU, tilTimestamp: ts, dryRun: false }))
      .rejects.toMatchObject({ kode: 'failed-precondition', message: expect.stringMatching(/kun efter en tør-kørsel/) });
    await expect(opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: linjer, nowMs: NU, tilTimestamp: ts, dryRun: false, aftryk: 'gammelt' }))
      .rejects.toMatchObject({ kode: 'failed-precondition', message: expect.stringMatching(/Noget er ændret siden tør-kørslen/) });
    expect(db._docs.size).toBe(48);
  });

  // B11: et facit sat MELLEM tør-kørsel og skriv flytter Elo og dermed odds —
  // så passer aftrykket ikke, og svaret er «vis igen», ikke en generisk fejl.
  it('et facit sat mellem tør-kørsel og skriv giver «noget er ændret — vis igen»', async () => {
    const kampe = indledende();
    const db = makeDb(spil(), kampe);
    const toer = await opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: linjer, nowMs: NU, tilTimestamp: ts });
    const id = kampe.find((m) => m.home === 'Danmark' || m.away === 'Danmark').id;
    db._docs.set(id, { ...db._docs.get(id), result: '2', homeGoals: 25, awayGoals: 30 });
    await expect(opretFaseKampeCore(db, FieldValue, {
      gameId: 'hvm2027', kampe: linjer, nowMs: NU, tilTimestamp: ts, dryRun: false, aftryk: toer.aftryk,
    })).rejects.toMatchObject({ kode: 'failed-precondition', message: expect.stringMatching(/vis igen/) });
    expect(db._docs.has('r8-den-nor')).toBe(false);
  });

  it('en liste med fejl skrives ikke — heller ikke de gyldige linjer', async () => {
    const db = makeDb(spil(), indledende());
    const med = [...linjer, k('2027-01-28', '18:00', 'Polen', 'USA')];
    const toer = await opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: med, nowMs: NU, tilTimestamp: ts });
    expect(toer.fejl).toHaveLength(1);
    await expect(opretFaseKampeCore(db, FieldValue, {
      gameId: 'hvm2027', kampe: med, nowMs: NU, tilTimestamp: ts, dryRun: false, aftryk: toer.aftryk,
    })).rejects.toMatchObject({ kode: 'invalid-argument' });
    expect(db._docs.size).toBe(48);
  });

  // V6: create, ikke set. En anden admin oprettede samme kamp mellem læsning
  // og skrivning: HELE batchen fejler, og den anden kamp skrives heller ikke.
  // Bytter man create ud med set, overskrives den hurtigeres kamp — rødt her.
  it('V6: atomisk create — findes én af kampene, skrives ingen af dem, og den eksisterende er urørt', async () => {
    const hurtigere = { id: 'r8-den-nor', round: 8, home: 'Danmark', away: 'Norge', kickoff: dk('2027-01-20', '18:00'), odds: { 1: 1.5, X: 9, 2: 3 }, af: 'den anden' };
    const db = makeDb(spil(), indledende(), { skjulte: [hurtigere] });
    const toer = await opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: linjer, nowMs: NU, tilTimestamp: ts });
    await expect(opretFaseKampeCore(db, FieldValue, {
      gameId: 'hvm2027', kampe: linjer, nowMs: NU, tilTimestamp: ts, dryRun: false, aftryk: toer.aftryk,
    })).rejects.toMatchObject({ kode: 'failed-precondition', message: 'En af kampene blev oprettet imens — vis igen. Intet er oprettet.' });
    expect(db._docs.get('r8-den-nor')).toEqual(hurtigere);
    expect(db._docs.has('r8-swe-isl')).toBe(false);
  });

  // V11-beviset: ÉN pris. Efter oprettelsen ompriser recomputeSeasonElo
  // (tør-kørsel) INGEN af de nye kampe — de er allerede prist af det tal, den
  // selv bruger. Prisede kernen af det afrundede eloCurrent, flyttede de sig.
  it('efter oprettelsen ændrer recomputeSeasonElo (tør) intet på de nye kampe', async () => {
    const kampe = indledende({ facit: true }).map((m) => ({ ...m, kickoff: ts(m.kickoff) }));
    const g = spil({ eloCurrent: { Danmark: 9999 } });
    const db = makeDb(g, kampe);
    const nu = dk('2027-01-19', '23:00');
    const toer = await opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: linjer, nowMs: nu, tilTimestamp: ts });
    await opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: linjer, nowMs: nu, tilTimestamp: ts, dryRun: false, aftryk: toer.aftryk });
    const res = await recomputeSeasonElo(db, FieldValue, 'hvm2027', nu, { dryRun: true });
    expect(res.aendringer.filter((a) => ['r8-den-nor', 'r8-swe-isl'].includes(a.id))).toEqual([]);
  });

  // B3: når semifinalerne gør puljen afgjort, afregnes den STRAKS — på
  // kamplisten, som den står efter skrivningen.
  it('B3: fuldender oprettelsen facit-fasen, kaldes settlePuljeBets med de nye kampe — ellers ikke', async () => {
    const kald = [];
    const settle = async (db, FV, gameId, matches) => { kald.push({ gameId, ids: matches.map((m) => m.id) }); return { settled: 3 }; };
    const sf = [k('2027-01-29', '17:30', 'Tyskland', 'Danmark'), k('2027-01-29', '20:30', 'Sverige', 'Spanien')];
    const db = makeDb(spil(), KV);
    const toer = await opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: sf, nowMs: NU_KO, tilTimestamp: ts, settle });
    expect(kald).toEqual([]);
    const res = await opretFaseKampeCore(db, FieldValue, {
      gameId: 'hvm2027', kampe: sf, nowMs: NU_KO, tilTimestamp: ts, settle, dryRun: false, aftryk: toer.aftryk,
    });
    expect(res.puljeAfregnet).toEqual({ settled: 3 });
    expect(kald).toHaveLength(1);
    expect(kald[0].ids).toEqual(expect.arrayContaining(['r15-ger-den', 'r15-swe-esp', 'r14-ger-srb', 'r14-esp-cro']));
    // Kun den ene semifinale: ingen afregning.
    const kald2 = [];
    const db2 = makeDb(spil(), KV);
    const t2 = await opretFaseKampeCore(db2, FieldValue, { gameId: 'hvm2027', kampe: sf.slice(0, 1), nowMs: NU_KO, tilTimestamp: ts });
    await opretFaseKampeCore(db2, FieldValue, {
      gameId: 'hvm2027', kampe: sf.slice(0, 1), nowMs: NU_KO, tilTimestamp: ts, dryRun: false, aftryk: t2.aftryk,
      settle: async () => { kald2.push(1); return { settled: 0 }; },
    });
    expect(kald2).toEqual([]);
  });

  it('B3: fejler afregningen, er kampene stadig oprettet — og svaret siger det', async () => {
    const sf = [k('2027-01-29', '17:30', 'Tyskland', 'Danmark'), k('2027-01-29', '20:30', 'Sverige', 'Spanien')];
    const db = makeDb(spil(), KV);
    const settle = async () => { throw new Error('Firestore haltede'); };
    const toer = await opretFaseKampeCore(db, FieldValue, { gameId: 'hvm2027', kampe: sf, nowMs: NU_KO, tilTimestamp: ts, settle });
    const res = await opretFaseKampeCore(db, FieldValue, {
      gameId: 'hvm2027', kampe: sf, nowMs: NU_KO, tilTimestamp: ts, settle, dryRun: false, aftryk: toer.aftryk,
    });
    expect(res.skrevet).toBe(true);
    expect(res.puljeAfregnet).toEqual({ settled: 0, fejl: 'Firestore haltede' });
    expect(db._docs.has('r15-ger-den')).toBe(true);
  });

  it('ukendt spil og manglende id', async () => {
    await expect(opretFaseKampeCore(makeDb(null, []), FieldValue, { gameId: 'x', kampe: [] })).rejects.toMatchObject({ kode: 'not-found' });
    await expect(opretFaseKampeCore(makeDb(null, []), FieldValue, { gameId: '', kampe: [] })).rejects.toMatchObject({ kode: 'invalid-argument' });
  });
});

describe('retKickoffCore — ret en tastefejl i kickoff (QC B1)', () => {
  const kamp = { id: 'r8-den-nor', round: 8, home: 'Danmark', away: 'Norge', kickoff: dk('2027-01-20', '20:30'), odds: { 1: 1.4, X: 9, 2: 4 } };
  const kald = (db, over = {}) => retKickoffCore(db, FieldValue, {
    gameId: 'hvm2027', matchId: 'r8-den-nor', tid: '18:00', nowMs: NU, tilTimestamp: ts, ...over,
  });

  it('tør-kørsel viser før → efter i dansk tid og skriver intet; skrivningen kræver aftrykket', async () => {
    const db = makeDb(spil(), [kamp]);
    const toer = await kald(db);
    expect(toer).toMatchObject({ dryRun: true, skrevet: false, foer: { tid: 'ons 20/1 kl. 20.30' }, efter: { tid: 'ons 20/1 kl. 18.00' } });
    expect(db._opdateringer).toEqual([]);
    await expect(kald(db, { dryRun: false })).rejects.toMatchObject({ kode: 'failed-precondition' });
    const res = await kald(db, { dryRun: false, aftryk: toer.aftryk });
    expect(res.skrevet).toBe(true);
    expect(db._opdateringer).toHaveLength(1);
    expect(Object.keys(db._opdateringer[0].data).sort()).toEqual(['kickoff', 'updatedAt']);
    expect(db._opdateringer[0].data.kickoff.__ts).toBe(dk('2027-01-20', '18:00'));
    expect(db._opdateringer[0].opts).toEqual({ lastUpdateTime: 't-r8-den-nor' });
  });
  // Security på d9puls, Bør 1: aftrykket binder den NYE tid. Før kunne et
  // skrive-kald med tør-kørslens aftryk sende en anden tid end den viste.
  it('skrive-kaldet skal sende SAMME tid som tør-kørslen — en anden tid med samme aftryk afvises', async () => {
    const db = makeDb(spil(), [kamp]);
    const toer = await kald(db, { tid: '19:00' });
    await expect(kald(db, { tid: '23:45', dryRun: false, aftryk: toer.aftryk }))
      .rejects.toMatchObject({ kode: 'failed-precondition', message: expect.stringMatching(/ændret siden tør-kørslen/) });
    expect(db._opdateringer).toEqual([]);
    // To tider giver to aftryk — og den viste tid kan skrives.
    expect((await kald(db, { tid: '23:45' })).aftryk).not.toBe(toer.aftryk);
    await kald(db, { tid: '19:00', dryRun: false, aftryk: toer.aftryk });
    expect(db._opdateringer[0].data.kickoff.__ts).toBe(dk('2027-01-20', '19:00'));
  });
  it('en kamp med facit, eller en kamp, der er gået i gang, kan ikke få kickoff rettet', async () => {
    await expect(kald(makeDb(spil(), [{ ...kamp, result: '1', homeGoals: 30, awayGoals: 28 }])))
      .rejects.toMatchObject({ kode: 'failed-precondition', message: expect.stringMatching(/har facit/) });
    await expect(kald(makeDb(spil(), [kamp]), { nowMs: kamp.kickoff - 60_000 }))
      .rejects.toMatchObject({ kode: 'failed-precondition', message: expect.stringMatching(/er gået i gang/) });
  });
  it('SENERE kun til en tid, der kan tippes; TIDLIGERE altid (det kan kun lukke for tips) — med advarsel, når den er passeret', async () => {
    const tidlig = { ...kamp, kickoff: dk('2027-01-20', '18:00') };
    const nu = dk('2027-01-20', '17:00');
    // 17:00 → 20:30 senere: fint. 16:30 tidligere og passeret: lukker — og siger det.
    const senere = await kald(makeDb(spil(), [tidlig]), { tid: '20:30', nowMs: nu });
    expect(senere.advarsler).toEqual([]);
    const passeret = await kald(makeDb(spil(), [tidlig]), { tid: '16:30', nowMs: nu });
    expect(passeret.advarsler[0]).toMatch(/tippet på kampen lukker i samme øjeblik/);
    expect(passeret.advarsler[0]).toMatch(/Tips, der blev afgivet efter den rigtige kampstart, står stadig/);
  });
  it('samme tid, ugyldig tid og et spil uden kalender afvises', async () => {
    await expect(kald(makeDb(spil(), [kamp]), { tid: '20:30' })).rejects.toMatchObject({ kode: 'invalid-argument' });
    await expect(kald(makeDb(spil(), [kamp]), { tid: '25:00' })).rejects.toMatchObject({ kode: 'invalid-argument' });
    await expect(kald(makeDb({ id: 'sl', type: 'football', status: 'live' }, [kamp])))
      .rejects.toMatchObject({ kode: 'failed-precondition' });
  });
});

// D9.4 — UDEBLIVELSES-VAGTEN.
describe('faseVagtTilstand — alarm kl. 12 dagen før, kun mens dagen kan få kampe', () => {
  const g = spil();
  const kl12DagenFoer = dk('2027-01-19', '12:00');
  const afgjort = indledende({ facit: true });
  it('grænsen: 11:59 dagen før er intet, 12:00 er en alarm pr. dag (id r8)', () => {
    expect(faseVagtTilstand(g, afgjort, kl12DagenFoer - 60_000).alarmer).toEqual([]);
    const t = faseVagtTilstand(g, afgjort, kl12DagenFoer);
    expect(t.alarmer).toHaveLength(1);
    expect(t.alarmer[0].kampId).toBe('r8');
    expect(t.alarmer[0].besked).toBe('«Håndbold-VM 2027» · Hovedrunde · dag 1 (ons 20/1): 0 af 6 kampe er lagt ind. Læg resten ind før dagens første kamp: Admin → 🗓️ Spil-tidsplan → 📥 Læg næste fases kampe ind (tør-kørsel først). Uden kampene kan dagen ikke tippes.');
  });
  // B2: en HALV dag (3 af 6) er også en alarm — ikke kun en tom dag.
  it('en halv dag (3 af 6) giver alarm; en hel dag giver ingen', () => {
    const tre = [...afgjort, ...['a', 'b', 'c'].map((x, i) => ({ id: `r8-${x}`, round: 8, home: `H${i}`, away: `U${i}`, kickoff: dk('2027-01-20', '20:30') }))];
    expect(faseVagtTilstand(g, tre, kl12DagenFoer).alarmer[0].besked).toMatch(/3 af 6 kampe/);
    const seks = [...afgjort, ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `r8-${i}`, round: 8, home: `H${i}`, away: `U${i}`, kickoff: dk('2027-01-20', '20:30') }))];
    expect(faseVagtTilstand(g, seks, kl12DagenFoer).alarmer).toEqual([]);
  });
  // B2: når dagen ikke længere kan få kampe, er det en advarsel — ikke en
  // alarm, der mailes hver 6. time, og som ingen kan løse i appen.
  it('en dag, der er gået i gang med for få kampe, er en ADVARSEL, ikke en alarm', () => {
    const tre = [...indledende(), ...[0, 1, 2].map((i) => ({ id: `r8-${i}`, round: 8, home: `H${i}`, away: `U${i}`, kickoff: dk('2027-01-20', '15:30') }))];
    const t = faseVagtTilstand(g, tre, dk('2027-01-20', '15:30'));
    expect(t.alarmer.map((a) => a.kampId)).not.toContain('r8');
    expect(t.advarsler[0]).toBe('Hovedrunde · dag 1 (ons 20/1) mangler 3 kampe (3 af 6) og kan ikke længere få dem i appen. Er en kamp aflyst, er det i orden; ellers tal med udvikleren.');
  });
  it('kortets linjer: fasens status og hvornår næste alarm går', () => {
    const t = faseVagtTilstand(g, indledende(), NU);
    expect(t.linjer).toContain('Hovedrunde: 0 af 36 kampe er lagt ind.');
    expect(t.linjer).toContain('Næste dag uden alle kampe: Hovedrunde · dag 1 (ons 20/1) — alarmen går fra tir 19/1 kl. 12.00, hvis kampene ikke er lagt ind — dog tidligst, når den indledende runde er afgjort.');
    expect(t.udtoemt).toBe(false);
    // Er den indledende runde afgjort, er der intet at vente på.
    expect(faseVagtTilstand(g, afgjort, NU).linjer)
      .toContain('Næste dag uden alle kampe: Hovedrunde · dag 1 (ons 20/1) — alarmen går fra tir 19/1 kl. 12.00, hvis kampene ikke er lagt ind.');
  });

  // QC på d9puls, Bør 2: kl. 12 dagen før lå FØR løsningen var mulig for en
  // fases første dag — den indledende runds sidste kamp starter 19/1 kl. 20.30,
  // og alarmen gik kl. 13.25. Alarmen må kun stå, mens løsningen er mulig.
  it('en fases FØRSTE dag alarmerer først, når fasen før er afgjort — så står det som en linje', () => {
    // Situationen 19/1 kl. 13.25: dag 7's kampe er ikke spillet.
    const dag7Uafgjort = afgjort.map((m) => (m.round === 7 ? { ...m, result: null, homeGoals: null, awayGoals: null } : m));
    const antal7 = afgjort.filter((m) => m.round === 7).length;
    const kl1325 = dk('2027-01-19', '13:25');
    const venter = faseVagtTilstand(g, dag7Uafgjort, kl1325);
    expect(venter.alarmer).toEqual([]);
    expect(venter.linjer).toContain(`Hovedrunde · dag 1 (ons 20/1) mangler kampe, men den indledende runde mangler facit i ${antal7} kampe — holdene kendes ikke endnu. Alarmen går, så snart den indledende runde er afgjort.`);
    // Én kamp tilbage: ental.
    const enTilbage = afgjort.map((m, i) => (i === afgjort.length - 1 ? { ...m, result: null, homeGoals: null, awayGoals: null } : m));
    expect(faseVagtTilstand(g, enTilbage, kl1325).linjer.join('\n')).toMatch(/mangler facit i 1 kamp —/);
    // Facit sat (19/1 kl. 22.25): alarmen går ved næste sweep.
    expect(faseVagtTilstand(g, afgjort, dk('2027-01-19', '22:25')).alarmer.map((a) => a.kampId)).toEqual(['r8']);
    // Kun fasens FØRSTE dag venter: dag 2 (r9) alarmerer kl. 12 dagen før, også
    // uden facit i den indledende runde.
    const t9 = faseVagtTilstand(g, dag7Uafgjort, dk('2027-01-20', '12:00'));
    expect(t9.alarmer.map((a) => a.kampId)).toContain('r9');
    expect(t9.alarmer.map((a) => a.kampId)).not.toContain('r8');
  });

  it('knockout: semifinalerne alarmerer først, når hver kvartfinale har en VINDER (uafgjort uden slut venter)', () => {
    const foer = [...afgjort, ...hovedrunde()];
    const kl12 = dk('2027-01-28', '12:00');
    expect(faseVagtTilstand(g, [...foer, ...KV], kl12).alarmer.map((a) => a.kampId)).toEqual(['r15']); // før r16
    const udenSlut = KV.map((m) => (m.id === 'r14-den-nor' ? { ...m, slut: undefined } : m));
    const t = faseVagtTilstand(g, [...foer, ...udenSlut], kl12);
    expect(t.alarmer).toEqual([]);
    expect(t.linjer.join('\n')).toMatch(/Semifinaler \(fre 29\/1\) mangler kampe, men kvartfinalerne mangler facit i 1 kamp/);
    // Kvartfinalerunden venter på hovedrunden (25/1 kl. 12: dag 13 er ikke spillet)
    // — men kun til den hårde frist kl. 12 på rundens første dato (QC B1).
    const hrUafgjort = [...afgjort, ...hovedrunde().map((m) => (m.round === 13 ? { ...m, result: null, homeGoals: null, awayGoals: null } : m))];
    expect(faseVagtTilstand(g, hrUafgjort, dk('2027-01-25', '12:00')).alarmer).toEqual([]);
    expect(faseVagtTilstand(g, hrUafgjort, dk('2027-01-26', '12:00')).alarmer.map((a) => a.kampId)).toEqual(['r14']);
    // Med facit: ÉN alarm r14 for alle fire (før: r14 og dagen efter r15).
    const medFacit = faseVagtTilstand(g, [...afgjort, ...hovedrunde()], dk('2027-01-25', '12:00'));
    expect(medFacit.alarmer.map((a) => a.kampId)).toEqual(['r14']);
    expect(medFacit.alarmer[0].besked).toMatch(/Kvartfinaler \(tir 26\/1–ons 27\/1\): 0 af 4 kampe er lagt ind\./);
  });
  it('udtømt, når kalenderens sidste dag er forbi', () => {
    expect(faseVagtTilstand(g, indledende(), dk('2027-02-01', '01:00')).udtoemt).toBe(true);
    expect(faseVagtTilstand(g, indledende(), dk('2027-01-31', '12:00')).udtoemt).toBe(false);
  });
  it('den indledende runde (48/7 — intet fast tal pr. dag) giver ingen falsk alarm, når den er hel', () => {
    const t = faseVagtTilstand(g, indledende(), dk('2027-01-12', '13:00'));
    expect(t.alarmer).toEqual([]);
    expect(faseStatus(g, indledende(), dk('2027-01-12', '13:00')).faser[0]).toEqual({ navn: 'Indledende runde', har: 48, antalKampe: 48 });
    // Turneringens FØRSTE dag har ingen fase før at vente på: mangler dag 1's
    // kampe, alarmerer den kl. 12 dagen før.
    expect(faseVagtTilstand(g, indledende().filter((m) => m.round !== 1), dk('2027-01-12', '12:00')).alarmer.map((a) => a.kampId)).toEqual(['r1']);
    // Mangler dag 7's fire kampe, er det en alarm for dag 7.
    const uden7 = indledende().filter((m) => m.round !== 7);
    expect(faseVagtTilstand(g, uden7, dk('2027-01-18', '12:00')).alarmer.map((a) => a.kampId)).toEqual(['r7']);
    // Dag 7 med 1 af 4: fasens sidste dag forventer RESTEN (48 − 44 = 4), ikke «mindst én».
    const en7 = [...uden7, indledende().find((m) => m.round === 7)];
    const t7 = faseVagtTilstand(g, en7, dk('2027-01-18', '12:00'));
    expect(t7.alarmer.map((a) => a.kampId)).toEqual(['r7']);
    expect(t7.alarmer[0].besked).toMatch(/1 af 4 kampe/);
  });
});

// ---------------------------------------------------------------------------
// ÉN KVARTFINALERUNDE OVER TO DATOER (planen D2 + beslutningerne B1-B3).
// Kalenderen er TEST_FASER_EN_KVARTRUNDE (kvart = runde 14, tir 26/1 + ons
// 27/1, `sidsteDato`) — så D9 er bevist, FØR produktionens data ændres. På
// koden før feltet var kalenderen ugyldig («ukendt nøgle»), og 27/1 var «ikke
// en spilledag».
// ---------------------------------------------------------------------------
describe('D9 med én runde over to datoer (kvartfinalerne 26/1 + 27/1)', () => {
  const g = spil({ faser: TEST_FASER_EN_KVARTRUNDE });
  const foerKV = [...indledende({ facit: true }), ...hovedrunde()];
  // Hovedrunden spillet, men dag 13 (25/1) uden facit.
  const hrUafgjort = [...indledende({ facit: true }), ...hovedrunde().map((m) => (m.round === 13 ? { ...m, result: null, homeGoals: null, awayGoals: null } : m))];
  const KVART4 = [
    k('2027-01-26', '18:00', 'Tyskland', 'Serbien'), k('2027-01-26', '20:30', 'Danmark', 'Norge'),
    k('2027-01-27', '18:00', 'Frankrig', 'Sverige'), k('2027-01-27', '20:30', 'Spanien', 'Kroatien'),
  ];
  const FRIST = 'Alle 4 kvartfinaler skal lægges ind før den første kamp tirsdag 26/1 — også onsdagens';
  const NU_25 = dk('2027-01-25', '23:30');

  // Produktionens kalender (scripts/games.mjs) har nu samme form, så blokken
  // her beviser også det rigtige spil. Drifter de fra hinanden, er det rødt.
  it('produktionens kalender ER testkalenderen for én kvartfinalerunde', () => {
    expect(spil().faser).toEqual([...TEST_FASER_EN_KVARTRUNDE]);
  });

  it('V4: 26/1 og 27/1 er begge runde 14 — hviledagen 28/1 ingen, semi 15, finale 16', () => {
    expect(['2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28', '2027-01-29', '2027-01-31'].map((d) => rundeForDato(g, d)))
      .toEqual([13, 14, 14, null, 15, 16]);
    expect(kampePrDag(faseFor(g, 14))).toBe(4);
  });

  it('fire kvartfinaler over to datoer: alle i runde 14 med id r14-…, ingen fejl og ingen halv-runde-advarsel', () => {
    const p = planFaseKampe(g, foerKV, KVART4, NU_25);
    expect(p.fejl).toEqual([]);
    expect(p.nye.map((n) => [n.id, n.round, n.etiket])).toEqual([
      ['r14-ger-srb', 14, 'Kvartfinaler'], ['r14-den-nor', 14, 'Kvartfinaler'],
      ['r14-fra-swe', 14, 'Kvartfinaler'], ['r14-esp-cro', 14, 'Kvartfinaler'],
    ]);
    expect(p.nye.map((n) => n.tid)).toEqual(['tir 26/1 kl. 18.00', 'tir 26/1 kl. 20.30', 'ons 27/1 kl. 18.00', 'ons 27/1 kl. 20.30']);
    expect(p.advarsler.join('\n')).not.toMatch(/kampe efter denne oprettelse/);
  });

  it('V3: Danmark tirsdag og igen onsdag afvises — runden er én knockout-fase', () => {
    const p = planFaseKampe(g, foerKV, [k('2027-01-26', '18:00', 'Danmark', 'Frankrig'), k('2027-01-27', '18:00', 'Danmark', 'Spanien')], NU_25);
    expect(p.fejl).toEqual([{ linje: 2, tekst: 'Danmark spiller allerede i kvartfinalerne (Danmark–Frankrig, Kvartfinaler) — et hold spiller højst én kamp i en knockout-fase' }]);
  });

  // B3: arbejdsgangen bevares — parrene til 26/1 kendes 24/1, til 27/1 25/1.
  it('B3: kampene må lægges ind i to omgange før første kickoff — advarslen nævner fristen konkret', () => {
    const forste = planFaseKampe(g, foerKV, KVART4.slice(0, 2), dk('2027-01-24', '23:00'));
    expect(forste.fejl).toEqual([]);
    expect(forste.advarsler).toContain(`Kvartfinaler (tir 26/1–ons 27/1): 2 af 4 kampe efter denne oprettelse. ${FRIST}: runden lukker for nye kampe, når dens første kamp går i gang.`);
    // Dagens tekst om «hele dagen ad gangen» passer ikke på en runde over to datoer.
    expect(forste.advarsler.join('\n')).not.toMatch(/Læg helst hele dagen ind ad gangen/);
    const lagtInd = [...foerKV, ...forste.nye];
    const anden = planFaseKampe(g, lagtInd, KVART4.slice(2), NU_25);
    expect(anden.fejl).toEqual([]);
    expect(anden.nye.map((n) => n.id)).toEqual(['r14-fra-swe', 'r14-esp-cro']);
    expect(anden.advarsler.join('\n')).not.toMatch(/kampe efter denne oprettelse/);
  });

  it('V7: en onsdagskamp efter tirsdagens første kickoff afvises — med fristen i teksten', () => {
    const tirsdag = [...foerKV, { id: 'r14-ger-srb', round: 14, home: 'Tyskland', away: 'Serbien', kickoff: dk('2027-01-26', '18:00') }];
    const linje = [k('2027-01-27', '18:00', 'Frankrig', 'Sverige')];
    expect(planFaseKampe(g, tirsdag, linje, dk('2027-01-26', '18:00') - 61_000).fejl).toEqual([]);
    expect(planFaseKampe(g, tirsdag, linje, dk('2027-01-26', '18:00') - 60_000).fejl).toEqual([{
      linje: 1,
      tekst: `Kvartfinaler er gået i gang — der kan ikke lægges flere kampe ind, heller ikke på en senere dato i runden. ${FRIST} (Runde-Botten gør dagen op, når dens kampe er afgjort). Mangler en kamp, så tal med udvikleren (konsollen).`,
    }]);
  });

  it('en TOM runde er åben til midnat efter sidste dato — ikke efter den første', () => {
    const kl0030 = dk('2027-01-27', '00:30');
    expect(planFaseKampe(g, foerKV, [k('2027-01-27', '20:30', 'Spanien', 'Kroatien')], kl0030).fejl).toEqual([]);
    expect(faseStatus(g, foerKV, kl0030).aabneDage[0]).toEqual({
      runde: 14, etiket: 'Kvartfinaler (tir 26/1–ons 27/1)', dato: '2027-01-26', har: 0, forventet: 4,
    });
    // Midnat efter onsdag (minus låsemarginen): lukket.
    expect(faseStatus(g, foerKV, dk('2027-01-27', '23:59')).aabneDage.map((d) => d.runde)).not.toContain(14);
    expect(faseStatus(g, foerKV, dk('2027-01-27', '23:58')).aabneDage.map((d) => d.runde)).toContain(14);
  });

  // B1: alarmen venter på hovedrunden — men kun til kl. 12 på rundens FØRSTE dato.
  it('B1: uden hovedrundens facit ingen alarm 25/1 kl. 12 — men ubetinget 26/1 kl. 12, med fristen', () => {
    expect(faseVagtTilstand(g, hrUafgjort, dk('2027-01-25', '12:00')).alarmer).toEqual([]);
    expect(faseVagtTilstand(g, hrUafgjort, dk('2027-01-25', '12:00')).linjer)
      .toContain('Kvartfinaler (tir 26/1–ons 27/1) mangler kampe, men hovedrunden mangler facit i 6 kampe — holdene kendes ikke endnu. Alarmen går, så snart hovedrunden er afgjort, og senest tir 26/1 kl. 12.00.');
    expect(faseVagtTilstand(g, hrUafgjort, dk('2027-01-26', '11:59')).alarmer).toEqual([]);
    const frist = faseVagtTilstand(g, hrUafgjort, dk('2027-01-26', '12:00'));
    expect(frist.alarmer.map((a) => a.kampId)).toEqual(['r14']);
    expect(frist.alarmer[0].besked).toBe(`«Håndbold-VM 2027» · Kvartfinaler (tir 26/1–ons 27/1): 0 af 4 kampe er lagt ind. ${FRIST}: Admin → 🗓️ Spil-tidsplan → 📥 Læg næste fases kampe ind (tør-kørsel først). Uden kampene kan dagen ikke tippes.`);
    // Venter-linjen er væk, når alarmen står.
    expect(frist.linjer.join('\n')).not.toMatch(/holdene kendes ikke endnu/);
  });

  it('B1: med hovedrundens facit går alarmen 25/1 kl. 12 — ÉN alarm r14 (ikke r15), «0 af 4»', () => {
    expect(faseVagtTilstand(g, foerKV, dk('2027-01-25', '11:59')).alarmer).toEqual([]);
    const t = faseVagtTilstand(g, foerKV, dk('2027-01-25', '12:00'));
    expect(t.alarmer.map((a) => a.kampId)).toEqual(['r14']);
    expect(t.alarmer[0].besked).toMatch(/0 af 4 kampe er lagt ind/);
    // Halvt lagt ind (tirsdagens to): stadig alarm, «2 af 4».
    const halv = [...foerKV, ...planFaseKampe(g, foerKV, KVART4.slice(0, 2), dk('2027-01-24', '23:00')).nye];
    expect(faseVagtTilstand(g, halv, dk('2027-01-25', '12:00')).alarmer.map((a) => a.besked))
      .toEqual([expect.stringMatching(/: 2 af 4 kampe er lagt ind\. Alle 4 kvartfinaler skal lægges ind før den første kamp tirsdag 26\/1/)]);
  });

  it('kortets næste-linje nævner både «tidligst» og den hårde frist', () => {
    const t = faseVagtTilstand(g, hrUafgjort, dk('2027-01-24', '12:00'));
    expect(t.linjer).toContain('Næste dag uden alle kampe: Kvartfinaler (tir 26/1–ons 27/1) — alarmen går fra man 25/1 kl. 12.00, hvis kampene ikke er lagt ind — dog tidligst, når hovedrunden er afgjort, og senest tir 26/1 kl. 12.00.');
  });

  it('semifinalerne (runde 15) alarmerer, når alle fire kvartfinaler har en vinder', () => {
    const kv = KV.map((m) => ({ ...m, id: m.id.replace('r15', 'r14'), round: 14 }));
    const t = faseVagtTilstand(g, [...foerKV, ...kv], dk('2027-01-28', '12:00'));
    expect(t.alarmer.map((a) => a.kampId)).toEqual(['r15']);
    expect(t.alarmer[0].besked).toBe('«Håndbold-VM 2027» · Semifinaler (fre 29/1): 0 af 2 kampe er lagt ind. Læg resten ind før dagens første kamp: Admin → 🗓️ Spil-tidsplan → 📥 Læg næste fases kampe ind (tør-kørsel først). Uden kampene kan dagen ikke tippes.');
  });

  // B2: Ret kickoff må flytte en kamp til en anden dato i SAMME runde.
  describe('Ret kickoff inden for rundens datoer (B2)', () => {
    const forkert = { id: 'r14-fra-swe', round: 14, home: 'Frankrig', away: 'Sverige', kickoff: dk('2027-01-26', '20:30'), odds: { 1: 2, X: 9, 2: 2 } };
    const kald = (db, over = {}) => retKickoffCore(db, FieldValue, {
      gameId: 'hvm2027', matchId: 'r14-fra-swe', tid: '18:00', nowMs: NU_25, tilTimestamp: ts, ...over,
    });

    it('en tirsdagskamp, der skulle være onsdag, kan flyttes — tør-kørsel, aftryk og skriv', async () => {
      const db = makeDb(g, [forkert]);
      const toer = await kald(db, { dato: '2027-01-27' });
      expect(toer).toMatchObject({ foer: { tid: 'tir 26/1 kl. 20.30' }, efter: { tid: 'ons 27/1 kl. 18.00', kickoff: dk('2027-01-27', '18:00') } });
      // Security (KAN 1): datoskiftet siges højt i tør-kørslen.
      expect(toer.advarsler).toEqual(['Datoen skifter fra tir 26/1 til ons 27/1.']);
      // Aftrykket binder datoen: samme tid uden den nye dato er en anden rettelse.
      await expect(kald(db, { dryRun: false, aftryk: toer.aftryk }))
        .rejects.toMatchObject({ kode: 'failed-precondition', message: expect.stringMatching(/ændret siden tør-kørslen/) });
      await kald(db, { dato: '2027-01-27', dryRun: false, aftryk: toer.aftryk });
      expect(db._opdateringer[0].data.kickoff.__ts).toBe(dk('2027-01-27', '18:00'));
    });

    // Security (KAN 1): et datoskift bagud til et passeret kickoff ville vise
    // alle i ligaen tipsene på en kamp, der først spilles i morgen. Afvist —
    // mens et passeret kickoff på SAMME dato stadig kun advarer (som før).
    it('en onsdagskamp kan ikke flyttes til et passeret tidspunkt tirsdag', async () => {
      const onsdag = { ...forkert, id: 'r14-fra-swe', kickoff: dk('2027-01-27', '20:30') };
      const nu = dk('2027-01-26', '19:00');
      await expect(kald(makeDb(g, [onsdag]), { dato: '2027-01-26', nowMs: nu })).rejects.toMatchObject({
        kode: 'invalid-argument',
        message: 'tir 26/1 kl. 18.00 er passeret — en kamp kan ikke flyttes til en anden dato bagud i tid. Intet er skrevet.',
      });
      // Kontrol: SAMME dato, passeret tidspunkt — tilladt med advarsel, som før.
      const tirsdag = { ...forkert, kickoff: dk('2027-01-26', '20:30') };
      const r = await kald(makeDb(g, [tirsdag]), { nowMs: nu });
      expect(r.efter.tid).toBe('tir 26/1 kl. 18.00');
      expect(r.advarsler).toEqual([expect.stringMatching(/^tir 26\/1 kl\. 18\.00 er passeret: tippet på kampen lukker/)]);
    });

    it('uden dato, eller med kampens egen dato: som før (samme dato)', async () => {
      expect((await kald(makeDb(g, [forkert]))).efter.tid).toBe('tir 26/1 kl. 18.00');
      expect((await kald(makeDb(g, [forkert]), { dato: '2027-01-26' })).efter.tid).toBe('tir 26/1 kl. 18.00');
    });

    // Test Manager (kvart-tm): en tom streng er «ingen dato» (som null) — ikke
    // en ugyldig dato. Uden denne kunne `=== ''`-grenen fjernes med grøn suite.
    it('en tom dato («») er ingen dato — kampens egen bruges, ingen «ugyldig dato»', async () => {
      const r = await kald(makeDb(g, [forkert]), { dato: '' });
      expect(r.efter).toMatchObject({ tid: 'tir 26/1 kl. 18.00', kickoff: dk('2027-01-26', '18:00') });
    });

    it('en dato uden for runden afvises — hviledagen, en anden runde og en ugyldig dato', async () => {
      await expect(kald(makeDb(g, [forkert]), { dato: '2027-01-28' })).rejects.toMatchObject({
        kode: 'invalid-argument',
        message: "Frankrig–Sverige hører til Kvartfinaler (tir 26/1–ons 27/1), og 2027-01-28 er ikke en spilledag i kalenderen — en kamp kan kun flyttes inden for sin egen runde (id'et bærer runden).",
      });
      await expect(kald(makeDb(g, [forkert]), { dato: '2027-01-29' })).rejects.toMatchObject({
        kode: 'invalid-argument',
        message: "Frankrig–Sverige hører til Kvartfinaler (tir 26/1–ons 27/1), og 2027-01-29 hører til Semifinaler — en kamp kan kun flyttes inden for sin egen runde (id'et bærer runden).",
      });
      await expect(kald(makeDb(g, [forkert]), { dato: '27/1' })).rejects.toMatchObject({ kode: 'invalid-argument', message: 'Den nye dato er ugyldig (ÅÅÅÅ-MM-DD, dansk dato).' });
    });

    it('en runde med én dato kan stadig ikke skifte dato', async () => {
      const hr = { id: 'r8-den-nor', round: 8, home: 'Danmark', away: 'Norge', kickoff: dk('2027-01-20', '20:30'), odds: { 1: 1.4, X: 9, 2: 4 } };
      await expect(retKickoffCore(makeDb(spil(), [hr]), FieldValue, {
        gameId: 'hvm2027', matchId: 'r8-den-nor', tid: '18:00', dato: '2027-01-21', nowMs: NU, tilTimestamp: ts,
      })).rejects.toMatchObject({
        kode: 'invalid-argument',
        message: "Danmark–Norge hører til Hovedrunde · dag 1 (ons 20/1), og 2027-01-21 hører til Hovedrunde · dag 2 — en kamp kan kun flyttes inden for sin egen runde (id'et bærer runden).",
      });
    });
  });
});

// Test Manager på d9puls (blokerende): kernen var dækket, ledningen ikke —
// requireAdmin og tør-kørsel som standard kunne fjernes med grøn suite.
// index.js kan ikke importeres uden firebase-functions, så ledningen
// bevogtes som tekst (mønstret fra manuelFacit.test.js og gameScoring.test.js).
describe('index.js: ledningen til de to callables', () => {
  const kilde = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const krop = (navn) => (kilde.split(`exports.${navn} = `)[1] || '').split('\nexports.')[0];

  // Test Manager (d9puls, BØR 1): `kampe: d.kampe` kunne fjernes med grøn
  // suite — kernen fik så `undefined` og afviste alt, men kun i produktion.
  // Hver callables EGNE felter bindes derfor også, og argument-objektet skal
  // have præcis disse nøgler (en fejlstavet eller manglende nøgle er rød).
  const egneFelter = {
    opretFaseKampe: ['gameId: d.gameId,', 'kampe: d.kampe,'],
    // dato (QC B2): en kamp i en runde over flere datoer kan flyttes inden for runden.
    retFaseKampKickoff: ['gameId: d.gameId,', 'matchId: d.matchId,', 'tid: d.tid,', 'dato: d.dato,'],
  };
  for (const [navn, kerne] of [['opretFaseKampe', 'opretFaseKampeCore'], ['retFaseKampKickoff', 'retKickoffCore']]) {
    it(`${navn}: argumenterne til ${kerne} er præcis ${egneFelter[navn].join(' ')} + de fælles`, () => {
      const k = krop(navn);
      const arg = (k.match(new RegExp(`await ${kerne}\\(db, FieldValue, \\{\\n([\\s\\S]*?)\\n\\s+\\}\\);`)) || [])[1];
      expect(arg).toBeTruthy();
      expect(arg.split('\n').map((l) => l.trim())).toEqual([
        ...egneFelter[navn],
        'aftryk: d.aftryk ?? null,',
        'dryRun,',
        'tilTimestamp: (ms) => Timestamp.fromMillis(ms),',
      ]);
    });

    it(`${navn}: 120 s, requireAdmin FØR ${kerne}, dryRunFraKald videresendt, aftryk, tidspunkt og fejl-oversættelsen`, () => {
      const k = krop(navn);
      expect(k.length).toBeGreaterThan(200);
      // Samme timeout som klienten (adminActions: 120000 ms, QC B11).
      expect(k).toMatch(/^onCall\(\{ region: REGION, timeoutSeconds: 120 \}, async \(request\) => \{/);
      const admin = k.indexOf('await requireAdmin(db, request);');
      expect(admin).toBeGreaterThan(-1);
      // FØR kernen — ellers kunne en ikke-admin få en tør-kørsel (planen).
      expect(k.indexOf(`await ${kerne}(db, FieldValue, {`)).toBeGreaterThan(admin);
      expect(k.match(new RegExp(`${kerne}\\(`, 'g'))).toHaveLength(1);
      expect(k).toMatch(/const dryRun = dryRunFraKald\(d\);/);
      // Ingen egen kopi af reglen ved siden af husets.
      expect(k).not.toMatch(/!==\s*false|===\s*true|dryRun\s*\|\||dryRun = (true|false)|dryRun: (true|false)/);
      expect(k).toMatch(new RegExp(`await ${kerne}\\(db, FieldValue, \\{[\\s\\S]*?\\n\\s+dryRun,\\n[\\s\\S]*?\\}\\);`));
      expect(k).toMatch(/aftryk: d\.aftryk \?\? null,/);
      expect(k).toMatch(/tilTimestamp: \(ms\) => Timestamp\.fromMillis\(ms\),/);
      expect(k).toMatch(/\} catch \(err\) \{\n\s+throw facitHttpsFejl\(err, HttpsError\);/);
    });
  }

  it('klienten kalder med samme timeout (120000 ms) — serveren og klienten er enige', () => {
    const klient = readFileSync(new URL('../src/features/admin/adminActions.js', import.meta.url), 'utf8');
    for (const navn of ['opretFaseKampe', 'retFaseKampKickoff']) {
      expect(klient).toContain(`httpsCallable(functions, '${navn}', { timeout: 120000 })`);
    }
  });
});
