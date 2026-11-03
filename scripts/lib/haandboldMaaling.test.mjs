// Tests for scripts/lib/haandboldMaaling.mjs — målingen bag håndboldprofilen.
//
// To slags:
//   1. MASKINERIET: kronologi, omkodning, værtsfortegn, opvarmning, nyStart.
//      Små konstruerede kampe, så hver regel kan ses.
//   2. TALLENE: de committede konstanter (SPORT_PROFILER.haandbold og
//      STARTMETODE) ER, hvad målingen giver på den committede historik. Det
//      fulde gitter er scriptets (scripts/maal-haandbold.mjs, ~1 min); her
//      efterprøves, at de valgte tal er et LOKALT minimum (hver parameter ét
//      trin op og ned) — og at fodboldens tal er MÅLBART dårligere.
//
// BÅNDFÆLDEN (CLAUDE.md): hvert bånd herunder er skrevet, så det er RØDT for
// fodboldens værdi. Begge tal står i kommentaren ved båndet.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIDTE, OPVARMNING, VAERTER, ELO_SAMME, DECAY_LAAS, GITTER, STARTMETODE, VAERT_2027,
  kronologisk, koerElo, maaltePaa, score, fitUafgjort, fitBase, baseInterval, basePaa, skew,
  uafgjortAndel, erKnockout, bedreNaboer, valgteParametre, holdStartElo, startStyrker, vedKant, trin,
  erfaringVedStart, flestKampePrTurnering, median,
} from './haandboldMaaling.mjs';
import { ELO, SPORT_PROFILER, OUTCOME, updateElo } from '../../src/lib/superligaScoring.js';

const HER = dirname(fileURLToPath(import.meta.url));
const HISTORIK = JSON.parse(readFileSync(resolve(HER, '../haandbold-historik.json'), 'utf8'));
const PROFIL = SPORT_PROFILER.haandbold;
const KAMPE = kronologisk(HISTORIK);
const VALGT = valgteParametre(PROFIL);
const MODEL = { drawBase: PROFIL.elo.DRAW_BASE, drawDecay: PROFIL.elo.DRAW_DECAY };
const OBS = maaltePaa(koerElo(KAMPE, VALGT).obs);

// En lille historik i samme form som den rigtige.
const kamp = (turnering, dato, hjemme, ude, h, u, sektion = 'Preliminary round › Group A') => ({
  turnering, dato, tid: '18:00', sektion, hjemme, ude, efter60: { h, u }, slut: { h, u }, afgjort: null,
});
const mini = (kampe, turneringer = ['vm2019', 'em2020', 'vm2021']) => ({ turneringer, kampe });

describe('kronologisk', () => {
  it('sorterer efter turnering (i historikkens rækkefølge), så dato og tid — ikke filorden', () => {
    const k = kronologisk(mini([
      kamp('vm2021', '2021-01-14', 'A', 'B', 1, 0),
      kamp('vm2019', '2019-01-12', 'C', 'D', 1, 0),
      { ...kamp('vm2019', '2019-01-10', 'E', 'F', 1, 0), tid: '20:00' },
      { ...kamp('vm2019', '2019-01-10', 'G', 'H', 1, 0), tid: '18:00' },
    ]));
    expect(k.map((m) => m.hjemme)).toEqual(['G', 'E', 'C', 'A']);
  });

  it('ELO_SAMME er tom: det fælles koreanske hold (COR) forbliver sit eget (målt, afsnit 7b)', () => {
    expect(ELO_SAMME.size).toBe(0);
    expect(KAMPE.filter((m) => m.hjemme === 'COR' || m.ude === 'COR')).toHaveLength(7);
    // En omkodning virker i begge ender, når den gives — det er den, scriptet sammenligner med.
    const k = kronologisk(mini([kamp('vm2019', '2019-01-10', 'COR', 'GER', 19, 30), kamp('vm2019', '2019-01-11', 'GER', 'COR', 30, 19)]), new Map([['COR', 'KOR']]));
    expect(k.map((m) => [m.hjemme, m.ude])).toEqual([['KOR', 'GER'], ['GER', 'KOR']]);
  });

  it('…og målingen foretrækker det: at kæde COR til KOR gør log-loss dårligere', () => {
    const nll = (samme) => score(maaltePaa(koerElo(kronologisk(HISTORIK, samme), VALGT).obs), MODEL).logLoss * OBS.length;
    // Eget hold 367,97, kædet 368,64 (scripts/maal-haandbold.mjs afsnit 7b).
    expect(nll(new Map([['COR', 'KOR']]))).toBeGreaterThan(nll(new Map()));
  });
});

describe('koerElo', () => {
  it('første turnering starter i MIDTE (1500); et hold, der kommer til senere, i nyStart', () => {
    const k = kronologisk(mini([kamp('vm2019', '2019-01-10', 'A', 'B', 20, 20), kamp('em2020', '2020-01-10', 'A', 'C', 20, 20)]));
    const { obs } = koerElo(k, { k: 100, nyStart: 1200 });
    expect(obs[0]).toMatchObject({ eloHjemme: 1500, eloUde: 1500 });
    expect(obs[1]).toMatchObject({ eloHjemme: 1500, eloUde: 1200 });
    expect(MIDTE).toBe(1500);
  });

  it('opdaterer med spillets updateElo — K i opvarmningen, K bagefter', () => {
    const k = kronologisk(mini([kamp('vm2019', '2019-01-10', 'A', 'B', 30, 20), kamp('vm2021', '2021-01-10', 'A', 'B', 30, 20)]));
    const { obs, ratings } = koerElo(k, { k: 40, kOpvarmning: 100 });
    const efter1 = updateElo(1500, 1500, 1, { hfa: 0, k: 100 });
    expect(obs[1].eloHjemme).toBeCloseTo(efter1.home, 10);
    const efter2 = updateElo(efter1.home, efter1.away, 1, { hfa: 0, k: 40 });
    expect(ratings.get('A')).toBeCloseTo(efter2.home, 10);
  });

  it('carry trækker mod MIDTE mellem turneringer — ikke inden i en', () => {
    const k = kronologisk(mini([kamp('vm2019', '2019-01-10', 'A', 'B', 30, 20), kamp('em2020', '2020-01-10', 'A', 'B', 20, 20)]));
    const { obs } = koerElo(k, { k: 100, carry: 0.5 });
    expect(obs[1].eloHjemme).toBeCloseTo(1500 + 0.5 * 50, 10);
    expect(obs[1].eloUde).toBeCloseTo(1500 - 0.5 * 50, 10);
  });

  it('værtsfordelen har fortegn: + når værten er hjemme, − når den er ude, 0 for to værter', () => {
    expect(VAERTER.vm2019).toEqual(['DEN', 'GER']);
    const k = kronologisk(mini([
      kamp('vm2019', '2019-01-10', 'GER', 'X', 20, 20),
      kamp('vm2019', '2019-01-11', 'Y', 'GER', 20, 20),
      kamp('vm2019', '2019-01-12', 'DEN', 'GER', 20, 20),
      kamp('vm2019', '2019-01-13', 'X', 'Y', 20, 20),
    ]));
    expect(koerElo(k, { k: 20, vaert: 40 }).obs.map((o) => o.hfa)).toEqual([40, -40, 0, 0]);
  });

  it('måler på stillingen EFTER 60 MIN — en kamp vundet i forlængelsen er X', () => {
    const m = { ...kamp('vm2021', '2021-01-27', 'DEN', 'EGY', 31, 31, 'Final round › Quarterfinals'), slut: { h: 39, u: 38 }, afgjort: 'straffe' };
    expect(koerElo(kronologisk(mini([m])), { k: 20 }).obs[0].udfald).toBe(OUTCOME.DRAW);
  });

  it('en kamp uden gyldig stilling efter 60 min STOPPER kørslen — den falder ikke ud i stilhed', () => {
    const god = kamp('vm2019', '2019-01-10', 'A', 'B', 20, 19);
    for (const efter60 of [{ h: null, u: 3 }, { h: 3, u: '' }, { h: 'x', u: 3 }, undefined]) {
      const ond = { ...kamp('vm2019', '2019-01-11', 'C', 'D', 1, 1), efter60 };
      expect(() => koerElo(kronologisk(mini([god, ond])), { k: 20 }), JSON.stringify(efter60)).toThrow(/uden gyldig stilling efter 60 min: vm2019 2019-01-11 C-D/);
    }
    // …og den rigtige historik har ingen sådan kamp (ellers kastede OBS ovenfor).
    expect(koerElo(KAMPE, VALGT).obs).toHaveLength(678);
  });

  it('kun kampene efter opvarmningen tæller i målingen', () => {
    expect(OPVARMNING).toEqual(['vm2019', 'em2020']);
    expect(OBS).toHaveLength(678 - 96 - 65);
    expect(OBS.some((o) => OPVARMNING.includes(o.turnering))).toBe(false);
  });
});

// OPVARMNING-kommentaren og kommentaren ved SPORT_PROFILER.haandbold citerer
// disse tal; de er talt her, ikke skønnet (scripts/maal-haandbold.mjs afsnit 1/1b).
describe('opvarmningen og kampe pr. hold — tallene, kommentarerne bygger på', () => {
  it('33 hold var med både i opvarmningen og senere; 6 af dem har kun EM 2020\'s 3 kampe', () => {
    const e = erfaringVedStart(HISTORIK);
    expect(e).toHaveLength(33);
    expect(e.filter((x) => x.kampe < 7)).toEqual(['BIH', 'MNE', 'NED', 'POL', 'SUI', 'UKR'].map((kode) => ({ kode, kampe: 3 })));
    expect(e.filter((x) => x.kampe >= 7)).toHaveLength(27);
    // Den gamle kommentar («mindst 7 kampe bag sig») var forkert: Polen er med i 2027.
    expect(Math.min(...e.map((x) => x.kampe))).toBe(3);
  });

  it('erfaringVedStart tæller kun opvarmningskampe og kun hold, der også spiller bagefter', () => {
    const e = erfaringVedStart(mini([
      kamp('vm2019', '2019-01-10', 'A', 'B', 1, 0), kamp('em2020', '2020-01-10', 'A', 'C', 1, 0),
      kamp('vm2021', '2021-01-10', 'A', 'D', 1, 0), kamp('vm2021', '2021-01-11', 'C', 'D', 1, 0),
    ]));
    expect(e).toEqual([{ kode: 'C', kampe: 1 }, { kode: 'A', kampe: 2 }]);
  });

  it('flest kampe for ét hold i én turnering: 10 (VM 2019), ellers 9', () => {
    expect(flestKampePrTurnering(HISTORIK)).toEqual({
      vm2019: 10, em2020: 9, vm2021: 9, em2022: 9, vm2023: 9, em2024: 9, vm2025: 9, em2026: 9,
    });
  });
});

describe('median', () => {
  it('gennemsnittet af de to midterste ved et lige antal — ikke den øvre', () => {
    // Top-8-parrenes midterste var 9,60 og 10,02: medianen er 9,81, ikke 10,02.
    expect(median([10.02, 1, 9.6, 20])).toBeCloseTo(9.81, 10);
    expect(median([3, 1, 2])).toBe(2);
    expect(() => median([])).toThrow();
  });
});

describe('erKnockout — præcis de sektioner, der er med i spillet', () => {
  it('kvart, semi, bronze og finale — men ikke placeringskampe', () => {
    for (const s of ['Final round › Quarterfinals', 'Final round › Semifinals', 'Knockout stage › Semi-finals',
      'Final round › Third place game', 'Knockout stage › Final']) expect(erKnockout({ sektion: s }), s).toBe(true);
    for (const s of ['Final round › 5–8th place semifinals', 'Final round › Fifth place game',
      'Final round › Seventh place game', 'Main round › Group I', "President's Cup › 25th place game", '', undefined]) {
      expect(erKnockout({ sektion: s }), String(s)).toBe(false);
    }
  });
  // 44 med EM 2026-finalen (indsat fra sin egen side); før var det 43.
  it('44 knockout-kampe i historikken, 8 af dem uafgjort efter 60 min', () => {
    expect(uafgjortAndel(HISTORIK.kampe.filter(erKnockout))).toMatchObject({ uafgjort: 8, kampe: 44 });
  });
});

describe('uafgjort-andelen efter 60 min', () => {
  it('8,3 % (56 af 678) — fodbold har 24,3 % (1.493 af 6.143)', () => {
    const a = uafgjortAndel(HISTORIK.kampe);
    expect(a).toMatchObject({ uafgjort: 56, kampe: 678 });
    // BÅNDET er RØDT for fodbold: 0,243 ligger langt over 0,11.
    expect(a.andel).toBeGreaterThan(0.06);
    expect(a.andel).toBeLessThan(0.11);
    expect(1493 / 6143).toBeGreaterThan(0.11);
  });
});

describe('profilen ER målingen (SPORT_PROFILER.haandbold)', () => {
  it('literalerne', () => {
    expect(PROFIL.elo).toEqual({ START: 1500, HFA: 0, K: 120, DRAW_BASE: 0.157, DRAW_DECAY: 0.55 });
    expect(PROFIL.odds).toEqual({ min: 1.01, max: 25 }); // max: ejerens valg (§11-tillæg 4), ikke målt
    expect(STARTMETODE).toEqual({ kOpvarmning: 150, carry: 1, nyStart: 1150, vaert: 25 });
    expect(VAERT_2027).toEqual(['GER']);
  });

  it('START er skalaens nulpunkt — det, alle hold starter i i målingen', () => {
    expect(PROFIL.elo.START).toBe(MIDTE);
  });

  it('de valgte Elo-parametre er et lokalt minimum i gitteret — og ingen ligger på kanten', () => {
    expect(bedreNaboer(KAMPE, VALGT, MODEL)).toEqual([]);
    expect(vedKant(VALGT)).toEqual([]);
    for (const p of Object.keys(GITTER)) expect(GITTER[p], p).toContain(VALGT[p]);
  });

  it('…og vagterne kan sige fra: et dårligt punkt HAR bedre naboer, og en kant ER en kant', () => {
    // Uden dette ville en bedreNaboer, der altid gav [], gøre testen ovenfor grøn.
    expect(bedreNaboer(KAMPE, { ...VALGT, k: 60 }, MODEL).map((b) => `${b.param}=${b.vaerdi}`)).toContain('k=70');
    expect(() => bedreNaboer(KAMPE, { ...VALGT, k: 125 }, MODEL)).toThrow(/ligger ikke i gitteret/);
    expect(vedKant({ ...VALGT, k: GITTER.k[0], nyStart: GITTER.nyStart.at(-1) })).toEqual(['k', 'nyStart']);
    // carry = 1 og vært = 0 er naturlige grænser, ikke kanter.
    expect(vedKant({ ...VALGT, carry: 1, vaert: 0 })).toEqual([]);
    expect(vedKant({ ...VALGT, carry: 0.6 })).toEqual(['carry']);
  });

  it('K: 120 — fodboldens 20 er MÅLBART dårligere (ΔNLL ≈ 17,1; grænsen er 1,92)', () => {
    const nll = (k) => score(maaltePaa(koerElo(KAMPE, { ...VALGT, k }).obs), MODEL).logLoss * OBS.length;
    const dFodbold = nll(ELO.K) - nll(PROFIL.elo.K);
    // BÅND rødt for fodbold: K = 20 giver ΔNLL ≈ 17,1 (> 1,92), K = 120 giver 0.
    expect(dFodbold).toBeGreaterThan(1.92);
    expect(ELO.K).toBe(20);
    // 95 %-intervallet (scriptets afsnit 3) er 80-160; begge kanter ligger inden for.
    expect(nll(80) - nll(120)).toBeLessThan(1.92);
    expect(nll(160) - nll(120)).toBeLessThan(1.92);
    expect(nll(60) - nll(120)).toBeGreaterThan(1.92);
  });

  it('DRAW_BASE: 0,157 er fittet med decay låst — fodboldens 0,305 ligger UDEN FOR intervallet', () => {
    expect(basePaa(OBS)).toBe(PROFIL.elo.DRAW_BASE);
    const [lav, hoej] = baseInterval(OBS, DECAY_LAAS);
    // BÅND rødt for fodbold: [0,118; 0,202] rummer 0,157, ikke 0,305.
    expect(lav).toBeGreaterThan(0.10);
    expect(hoej).toBeLessThan(0.22);
    expect(PROFIL.elo.DRAW_BASE).toBeGreaterThanOrEqual(lav);
    expect(PROFIL.elo.DRAW_BASE).toBeLessThanOrEqual(hoej);
    expect(ELO.DRAW_BASE).toBeGreaterThan(hoej);
  });

  it('DRAW_DECAY er LÅST, fordi den er umålelig: intervallet rummer både 0 og 0,55', () => {
    expect(PROFIL.elo.DRAW_DECAY).toBe(DECAY_LAAS);
    const fri = fitUafgjort(OBS);
    // Udelukker data en dag 0,55, er låsen forkert, og denne bliver rød.
    expect(fri.decayInterval[0]).toBeLessThanOrEqual(DECAY_LAAS);
    expect(fri.decayInterval[1]).toBeGreaterThanOrEqual(DECAY_LAAS);
    // UMÅLELIG: intervallet rummer 0 (ingen afhængighed af styrkeforskel).
    // Bliver det smalt nok til at udelukke 0, er decay målbar, og låsen skal tages op.
    expect(fri.decayInterval[0]).toBe(0);
    // Prisen for låsen er lille: frit fit mod låst, i log-likelihood.
    expect(fitBase(OBS, DECAY_LAAS).l - fri.nll).toBeLessThan(0.5);
  });

  it('modellen rammer antallet af uafgjorte — fodboldens model giver det dobbelte', () => {
    const forv = (b, d) => OBS.reduce((a, o) => a + b * Math.exp(-d * skew(o) * 2), 0);
    const faktisk = OBS.filter((o) => o.udfald === OUTCOME.DRAW).length;
    expect(faktisk).toBe(47);
    // Håndbold 46,9 mod 47; fodboldens model 91,2. Båndet ±3 er rødt for fodbold.
    expect(Math.abs(forv(PROFIL.elo.DRAW_BASE, PROFIL.elo.DRAW_DECAY) - faktisk)).toBeLessThan(3);
    expect(Math.abs(forv(ELO.DRAW_BASE, ELO.DRAW_DECAY) - faktisk)).toBeGreaterThan(3);
  });

  // Fire decimaler: med 677 kampe (uden EM 2026-finalen) var tallene 0,7131 /
  // 0,4066 / 0,7888 / 0,4502. Med tre decimaler ville 0,4066 og 0,4502 stadig
  // passere mod de nye 0,4062 og 0,4497 — båndet skal være rødt af det gamle.
  it('håndboldprofilen slår fodboldens tal på log-loss og Brier (0,7125 mod 0,7881)', () => {
    const h = score(OBS, MODEL);
    const fodObs = maaltePaa(koerElo(KAMPE, { ...VALGT, k: ELO.K }).obs);
    const f = score(fodObs, { drawBase: ELO.DRAW_BASE, drawDecay: ELO.DRAW_DECAY });
    expect(h.logLoss).toBeLessThan(f.logLoss);
    expect(h.brier).toBeLessThan(f.brier);
    expect(h.logLoss).toBeCloseTo(0.7125, 4);
    expect(h.brier).toBeCloseTo(0.4062, 4);
    expect(f.logLoss).toBeCloseTo(0.7881, 4);
    expect(f.brier).toBeCloseTo(0.4497, 4);
  });

  it('HFA er 0 (neutral bane); værtsfordelen ligger i STARTMETODE, ikke i profilen — og den er SVAGT bestemt', () => {
    expect(PROFIL.elo.HFA).toBe(0);
    expect(STARTMETODE.vaert).toBeGreaterThan(0);
    // At 25 er gitterets punktestimat, beviser lokalt-minimum-testen ovenfor.
    // Her: det er KUN et punktestimat. Vært 0 koster ΔNLL ≈ 0,25 — under
    // grænsen 1,92 — så data kan ikke skelne 25 fra 0, og +25 i Tysklands
    // 2027-rating er et VALG (VAERT_2027). Gør flere data en dag 0 målbart
    // dårligere, bliver testen rød, og kommentarerne skal skrives om.
    const nll = (vaert) => score(maaltePaa(koerElo(KAMPE, { ...VALGT, vaert }).obs), MODEL).logLoss * OBS.length;
    const dNul = nll(0) - nll(STARTMETODE.vaert);
    expect(dNul).toBeGreaterThan(0);
    expect(dNul).toBeLessThan(1.92);
  });

  it('carry = 1 er et ÆGTE minimum, ikke bare gitterets loft: 1,05 er dårligere', () => {
    // ΔNLL 1,39 (scripts/maal-haandbold.mjs afsnit 2). vedKant undtager carry = 1
    // som naturlig grænse; uden denne test var undtagelsen en påstand.
    const nll = (carry) => score(maaltePaa(koerElo(KAMPE, { ...VALGT, carry }).obs), MODEL).logLoss * OBS.length;
    expect(VALGT.carry).toBe(1);
    expect(nll(1.05) - nll(1)).toBeGreaterThan(1);
  });
});

describe('valgteParametre og holdStartElo', () => {
  it('K kommer fra profilen — en anden profil giver en anden K', () => {
    expect(valgteParametre(PROFIL)).toEqual({ k: 120, ...STARTMETODE });
    expect(valgteParametre({ elo: { K: 7 } }).k).toBe(7);
    expect(() => valgteParametre(undefined)).toThrow(/Håndboldprofilen mangler/);
  });

  it('værtsfordel kun til VM 2027-værten; et hold uden historik får nyStart', () => {
    const hold = [{ hbKode: 'GER', name: 'Tyskland' }, { hbKode: 'DEN', name: 'Danmark' }, { hbKode: 'TUR', name: 'Tyrkiet' }];
    const [ger, den, tur] = holdStartElo(HISTORIK, hold, VALGT);
    const maalt = startStyrker(HISTORIK, VALGT).ratings;
    expect(ger).toMatchObject({ vaert: 25, harHistorik: true, elo: Math.round(maalt.get('GER')) + 25 });
    expect(den).toMatchObject({ vaert: 0, harHistorik: true, elo: Math.round(maalt.get('DEN')) });
    expect(tur).toMatchObject({ harHistorik: false, elo: STARTMETODE.nyStart, kampe: 0, vaert: 0 });
    expect(maalt.has('TUR')).toBe(false);
  });
});

describe('trin', () => {
  it('giver pæne tal uden flydetals-støj', () => {
    expect(trin(0.6, 1, 0.1)).toEqual([0.6, 0.7, 0.8, 0.9, 1]);
    expect(trin(20, 40, 10)).toEqual([20, 30, 40]);
  });
});
