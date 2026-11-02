// ---------------------------------------------------------------------------
// Fasekalenderen (src/lib/faser.js).
//
// To ting skal bevises, og de er forskellige:
//   1. UDEN kalender (Superligaen, Premier League) — og med en kalender, der
//      ikke består formkontrollen — er hver tekst PRÆCIS dagens. Skrevet som
//      literaler, ikke afledt af koden, så en ændring af "Runde N af M" bliver
//      rød her.
//   2. MED kalender er teksterne dem, ejeren valgte (§11.2), og nævneren er
//      KALENDERENS sidste dag — ikke den sidst oprettede runde. "Runde 6 af 6"
//      efter den indledende runde var QC's blokerende fund.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  faseKalenderFejl, harFaseKalender, sidsteKalenderRunde, faseFor, erKnockout,
  rundeNavneord, rundeKort, rundeOrd, kortDato, kbhDato, fmtFaseStart, rundeEtiket,
  dagTaeller, naesteKalenderRunde, ventendeRunde, ventetekst, naesteFase,
} from './faser';
import { TEST_FASER, HAANDBOLD_SPIL as HB, kl18 } from '../test/faseKalender';

const SL = { id: 'superliga2627', type: 'football' };
const PL = { id: 'pl2627-efteraar', type: 'football', puljeLockRound: 3 };
// Kalendere, der IKKE må tælle: de skal give præcis det samme som SL.
const UDEN = [
  ['SL', SL], ['PL', PL], ['intet spil', null], ['undefined', undefined],
  ['tom liste', { faser: [] }], ['ikke en liste', { faser: { navn: 'x' } }],
  ['huller', { faser: [{ ...TEST_FASER[0] }, { ...TEST_FASER[1], fra: 8 }] }],
  ['starter ikke i 1', { faser: [{ ...TEST_FASER[0], fra: 2 }] }],
];

describe('uden fasekalender: præcis dagens tekster', () => {
  for (const [navn, game] of UDEN) {
    it(`${navn}`, () => {
      expect(harFaseKalender(game)).toBe(false);
      expect(rundeEtiket(game, 7)).toBe('Runde 7');
      // Datoen kommer ALDRIG med uden kalender — heller ikke når den gives.
      expect(rundeEtiket(game, 7, kl18('2027-01-14'))).toBe('Runde 7');
      expect(rundeKort(game, 7)).toBe('Runde 7');
      expect(rundeOrd(game, 7)).toBe('runde 7');
      expect(rundeNavneord(game)).toBe('runde');
      expect(dagTaeller(game, 7, 22)).toBe('Runde 7 af 22');
      expect(sidsteKalenderRunde(game)).toBeNull();
      expect(faseFor(game, 7)).toBeNull();
      expect(erKnockout(game, 7)).toBe(false);
      expect(naesteKalenderRunde(game, 7)).toBeNull();
      expect(ventendeRunde(game, 6)).toBeNull();
      expect(ventetekst(game, 6, kl18('2027-01-19'))).toBeNull();
      expect(naesteFase(game, kl18('2027-01-19'))).toBeNull();
    });
  }
});

describe('med fasekalender: ejerens ord', () => {
  it('kalenderen er gyldig, og sidste dag er 17', () => {
    expect(faseKalenderFejl(TEST_FASER)).toEqual([]);
    expect(harFaseKalender(HB)).toBe(true);
    expect(sidsteKalenderRunde(HB)).toBe(17);
  });

  it('etiketten: fase · dag N, og én-dags-faser uden "dag 1"', () => {
    expect(rundeEtiket(HB, 1)).toBe('Indledende runde · dag 1');
    expect(rundeEtiket(HB, 2)).toBe('Indledende runde · dag 2');
    expect(rundeEtiket(HB, 6)).toBe('Indledende runde · dag 6');
    expect(rundeEtiket(HB, 7)).toBe('Hovedrunde · dag 1');
    expect(rundeEtiket(HB, 13)).toBe('Hovedrunde · dag 7');
    expect(rundeEtiket(HB, 14)).toBe('Kvartfinaler · dag 1');
    expect(rundeEtiket(HB, 16)).toBe('Semifinaler');
    expect(rundeEtiket(HB, 17)).toBe('Finaledag');
    // Aldrig "Runde" i en turnering — og aldrig "dag 1" på en dag-fase.
    for (let r = 1; r <= 17; r += 1) expect(rundeEtiket(HB, r)).not.toMatch(/^Runde/);
    expect(rundeEtiket(HB, 17)).not.toContain('dag 1');
  });

  it('etiketten med dato: "Indledende runde · dag 2 · tor 14/1" (dansk tid)', () => {
    expect(rundeEtiket(HB, 2, kl18('2027-01-14'))).toBe('Indledende runde · dag 2 · tor 14/1');
    expect(rundeEtiket(HB, 17, kl18('2027-01-31'))).toBe('Finaledag · søn 31/1');
    // 23.30 UTC den 13. er 00.30 dansk tid den 14. — datoen er den DANSKE.
    expect(kortDato(Date.parse('2027-01-13T23:30:00Z'))).toBe('tor 14/1');
    expect(kortDato(Date.parse('2027-01-13T22:30:00Z'))).toBe('ons 13/1');
    expect(kortDato(NaN)).toBe('');
    expect(rundeEtiket(HB, 2, NaN)).toBe('Indledende runde · dag 2');
  });

  it('en runde uden for kalenderen hedder "Dag N" — aldrig "Runde N"', () => {
    expect(rundeEtiket(HB, 18)).toBe('Dag 18');
    expect(faseFor(HB, 18)).toBeNull();
    expect(faseFor(HB, 0)).toBeNull();
    expect(faseFor(HB, 2.5)).toBeNull();
  });

  it('tælleren: "Dag 7 af 17" — nævneren er kalenderens, ikke sidst oprettede', () => {
    // Efter den indledende runde er kun 6 runder oprettet.
    expect(dagTaeller(HB, 6, 6)).toBe('Dag 6 af 17');
    expect(dagTaeller(HB, 6, 6)).not.toBe('Runde 6 af 6');
    expect(dagTaeller(HB, 7, 7)).toBe('Dag 7 af 17');
  });

  it('korte former: "Dag 7" og "dag 7"', () => {
    expect(rundeKort(HB, 7)).toBe('Dag 7');
    expect(rundeOrd(HB, 7)).toBe('dag 7');
    expect(rundeNavneord(HB)).toBe('dag');
  });

  it('faseFor giver fase, dag og antal dage', () => {
    expect(faseFor(HB, 9)).toEqual({
      navn: 'Hovedrunde', bestemt: 'Hovedrunden', fra: 7, til: 13, start: '2027-01-20',
      knockout: false, antalKampe: 48, dag: 3, dage: 7, nummer: 2,
    });
    // Uden `bestemt` bruges navnet.
    expect(faseFor(HB, 17).bestemt).toBe('Finaledag');
  });

  it('knockout: kun de tre sidste faser', () => {
    const ko = [];
    for (let r = 1; r <= 17; r += 1) if (erKnockout(HB, r)) ko.push(r);
    expect(ko).toEqual([14, 15, 16, 17]);
  });
});

describe('faseovergangen: der kommer mere', () => {
  it('næste runde i kalenderen findes, selv om dens kampe ikke er oprettet', () => {
    expect(naesteKalenderRunde(HB, 6)).toBe(7);
    expect(naesteKalenderRunde(HB, 16)).toBe(17);
    expect(naesteKalenderRunde(HB, 17)).toBeNull();
  });

  it('den ventende runde efter den indledende runde er hovedrundens første dag', () => {
    const v = ventendeRunde(HB, 6);
    expect(v.runde).toBe(7);
    expect(v.foersteDag).toBe(true);
    expect(v.fase.navn).toBe('Hovedrunde');
    expect(ventendeRunde(HB, 9)).toMatchObject({ runde: 10, foersteDag: false });
    expect(ventendeRunde(HB, 17)).toBeNull();
  });

  it('ventetekst: hovedrunden lægges ind — med dato, og uden løfte om en passeret dato', () => {
    expect(ventetekst(HB, 6, kl18('2027-01-18')))
      .toBe('Hovedrunden lægges ind, så snart holdene kendes. Første kamp onsdag 20. januar.');
    // På startdagen er datoen ikke passeret.
    expect(ventetekst(HB, 6, kl18('2027-01-20')))
      .toBe('Hovedrunden lægges ind, så snart holdene kendes. Første kamp onsdag 20. januar.');
    // Dagen efter må teksten ikke love en dato, der er gået.
    const sen = ventetekst(HB, 6, kl18('2027-01-21'));
    expect(sen).toBe('Hovedrunden skulle være begyndt onsdag 20. januar, men kampene er ikke lagt ind endnu.');
    expect(sen).not.toContain('Første kamp');
    expect(ventetekst(HB, 15, kl18('2027-01-28')))
      .toBe('Semifinalerne lægges ind, så snart holdene kendes. Første kamp fredag 29. januar.');
    // Uden `bestemt`: navnet.
    expect(ventetekst(HB, 16, kl18('2027-01-30')))
      .toBe('Finaledag lægges ind, så snart holdene kendes. Første kamp søndag 31. januar.');
  });

  it('ventetekst midt i en fase: dagen, ingen dato (kalenderen kender ikke dagenes datoer)', () => {
    const t = ventetekst(HB, 8, kl18('2027-01-21'));
    expect(t).toBe('Hovedrunde · dag 3 lægges ind, så snart kampene er klar.');
    expect(t).not.toContain('Første kamp');
  });

  it('ventetekst er null, når turneringen er slut', () => {
    expect(ventetekst(HB, 17, kl18('2027-02-01'))).toBeNull();
  });

  it('naesteFase: den første fase, hvis startdag (dansk dato) er i dag eller senere', () => {
    expect(naesteFase(HB, kl18('2027-01-10')).navn).toBe('Indledende runde');
    expect(naesteFase(HB, kl18('2027-01-14')).navn).toBe('Hovedrunde');
    expect(naesteFase(HB, kl18('2027-01-20')).navn).toBe('Hovedrunde');
    expect(naesteFase(HB, kl18('2027-01-21')).navn).toBe('Kvartfinaler');
    expect(naesteFase(HB, kl18('2027-01-31')).navn).toBe('Finaledag');
    expect(naesteFase(HB, kl18('2027-02-01'))).toBeNull();
    expect(naesteFase(HB, NaN)).toBeNull();
    // Dansk dato: 23.30 UTC den 19. er den 20. i Danmark.
    expect(naesteFase(HB, Date.parse('2027-01-20T23:30:00Z')).navn).toBe('Kvartfinaler');
    expect(naesteFase(HB, Date.parse('2027-01-19T23:30:00Z')).navn).toBe('Hovedrunde');
  });

  it('datoer i en sætning', () => {
    expect(fmtFaseStart('2027-01-20')).toBe('onsdag 20. januar');
    expect(fmtFaseStart('2026-12-31')).toBe('torsdag 31. december');
    expect(fmtFaseStart('2027-02-30')).toBe('');
    expect(kbhDato(Date.parse('2027-01-13T23:30:00Z'))).toBe('2027-01-14');
  });
});

describe('formkontrollen på kalenderen', () => {
  const god = TEST_FASER.map((f) => ({ ...f }));
  const med = (i, ændring) => god.map((f, j) => (j === i ? { ...f, ...ændring } : f));
  const uden = (i, nøgle) => god.map((f, j) => {
    if (j !== i) return f;
    const k = { ...f };
    delete k[nøgle];
    return k;
  });

  it('godkender testkalenderen', () => {
    expect(faseKalenderFejl(god)).toEqual([]);
  });

  // Hver fejl skal give netop SIN besked — ellers kunne én kontrol fjernes,
  // fordi en anden tilfældigvis også faldt for samme kalender.
  const tilfaelde = [
    ['ikke en liste', null, /ikke-tom liste/],
    ['tom liste', [], /ikke-tom liste/],
    ['ikke et objekt', [null], /fase 1: ikke et objekt/],
    ['ukendt nøgle (stavefejl)', med(0, { knockOut: true }), /ukendt nøgle "knockOut"/],
    ['navn mangler', uden(0, 'navn'), /fase 1: navn mangler/],
    ['tomt navn', med(1, { navn: '  ' }), /fase 2: navn mangler/],
    ['bestemt ikke tekst', med(1, { bestemt: 3 }), /fase 2: bestemt/],
    ['fra ikke heltal', med(1, { fra: 7.5 }), /fase 2: fra/],
    ['til før fra', med(1, { til: 6 }), /fase 2: til/],
    ['start mangler', uden(2, 'start'), /fase 3: start/],
    ['start ugyldig dato', med(2, { start: '2027-02-30' }), /fase 3: start/],
    ['knockout ikke boolean', med(2, { knockout: 'ja' }), /fase 3: knockout/],
    ['antalKampe 0', med(2, { antalKampe: 0 }), /fase 3: antalKampe/],
    ['første fase starter i 2', med(0, { fra: 2 }), /første fase skal starte i runde 1/],
    ['hul', med(1, { fra: 8 }), /fase 2: starter i runde 8, men forrige fase sluttede i runde 6/],
    ['overlap', med(1, { fra: 6 }), /fase 2: starter i runde 6/],
    ['start ikke stigende', med(1, { start: '2027-01-13' }), /fase 2: start 2027-01-13 ligger ikke efter/],
  ];
  for (const [navn, faser, besked] of tilfaelde) {
    it(`afviser: ${navn}`, () => {
      const fejl = faseKalenderFejl(faser);
      expect(fejl.join(' | ')).toMatch(besked);
      // Og en ugyldig kalender tæller IKKE — fladerne viser de gamle tekster.
      expect(harFaseKalender({ faser })).toBe(false);
    });
  }

  it('valgfrie felter må mangle', () => {
    const minimal = [{ navn: 'A', fra: 1, til: 2, start: '2027-01-01' }, { navn: 'B', fra: 3, til: 3, start: '2027-01-05' }];
    expect(faseKalenderFejl(minimal)).toEqual([]);
    expect(erKnockout({ faser: minimal }, 3)).toBe(false);
    expect(faseFor({ faser: minimal }, 3).antalKampe).toBeNull();
  });
});
