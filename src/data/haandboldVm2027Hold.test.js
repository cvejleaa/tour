/**
 * Tests for holdene til håndbold-VM 2027.
 *
 * Holdfilen er nøglen mellem kilden (Wikipedias {{hb|KODE}}) og spillet (det
 * danske navn). En kode, der mangler, får programscriptet til at kaste — men
 * en kode på det FORKERTE hold ville give en kamp med det forkerte land, og
 * det ser rigtigt ud. Derfor står de 32 par skrevet ud her.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { HAANDBOLD_VM2027_HOLD, holdForKode, holdForIhfNavn } from './haandboldVm2027Hold';
import { SPORT_PROFILER } from '../lib/superligaScoring';
import { teamElo } from '../lib/superligaSeed';
import { holdStartElo, valgteParametre, STARTMETODE } from '../../scripts/lib/haandboldMaaling.mjs';

const PROGRAM = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/haandbold-vm2027-program.json'), 'utf8'));
const HISTORIK = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/haandbold-historik.json'), 'utf8'));

describe('listens form', () => {
  it('har præcis 32 hold med entydige navne, kortkoder og kildekoder', () => {
    expect(HAANDBOLD_VM2027_HOLD).toHaveLength(32);
    for (const felt of ['name', 'short', 'hbKode']) {
      expect(new Set(HAANDBOLD_VM2027_HOLD.map((t) => t[felt])).size, felt).toBe(32);
    }
    const alleKoder = HAANDBOLD_VM2027_HOLD.flatMap((t) => [t.hbKode, ...t.aliaser]);
    expect(new Set(alleKoder).size).toBe(alleKoder.length);
  });

  it('kortkoder og kildekoder er tre store bogstaver', () => {
    for (const t of HAANDBOLD_VM2027_HOLD) {
      expect(t.short, t.name).toMatch(/^[A-Z]{3}$/);
      expect(t.hbKode, t.name).toMatch(/^[A-Z]{3}$/);
      expect(Array.isArray(t.aliaser), t.name).toBe(true);
    }
  });

  // Neutral bane: et hjemmestadion ville stå på kampkortet for 31 af 32 hold
  // og være forkert for dem alle.
  it('har INGEN venue', () => {
    for (const t of HAANDBOLD_VM2027_HOLD) expect(t, t.name).not.toHaveProperty('venue');
  });

  it('kode → dansk navn for alle 32 (skrevet ud, så et ombytte er rødt)', () => {
    const par = Object.fromEntries(HAANDBOLD_VM2027_HOLD.map((t) => [t.hbKode, t.name]));
    expect(par).toEqual({
      GER: 'Tyskland', SRB: 'Serbien', TUN: 'Tunesien', URU: 'Uruguay',
      EGY: 'Egypten', ITA: 'Italien', CPV: 'Kap Verde', KSA: 'Saudi-Arabien',
      CRO: 'Kroatien', ESP: 'Spanien', CHI: 'Chile', TUR: 'Tyrkiet',
      ARG: 'Argentina', FRA: 'Frankrig', BRA: 'Brasilien', KUW: 'Kuwait',
      SWE: 'Sverige', NOR: 'Norge', GRE: 'Grækenland', QAT: 'Qatar',
      POR: 'Portugal', FRO: 'Færøerne', POL: 'Polen', ALG: 'Algeriet',
      DEN: 'Danmark', SLO: 'Slovenien', USA: 'USA', ANG: 'Angola',
      ISL: 'Island', MKD: 'Nordmakedonien', BHR: 'Bahrain', JPN: 'Japan',
    });
  });
});

// STARTSTYRKERNE (D4). Vendt fra «INGEN elo», da målingen landede. Et hold
// uden elo-felt fik før TAVST sportens START i seedet (teamElo) — og et tal
// skrevet i hånden ville se ud som en måling. Begge dele skal være røde.
describe('elo: startstyrken er målt, aldrig en tavs fallback', () => {
  const PROFIL = SPORT_PROFILER.haandbold;
  const maalt = holdStartElo(HISTORIK, HAANDBOLD_VM2027_HOLD, valgteParametre(PROFIL));

  it('hvert hold har sit EGET elo-felt, og det er et endeligt heltal', () => {
    for (const t of HAANDBOLD_VM2027_HOLD) {
      expect(Object.hasOwn(t, 'elo'), t.name).toBe(true);
      expect(Number.isInteger(t.elo), `${t.name}: ${String(t.elo)}`).toBe(true);
    }
  });

  it('seedet når aldrig fallbacken: teamElo med et UGYLDIGT start giver holdets eget tal for alle 32', () => {
    // Faldt et hold tilbage, gav det NaN her — og ikke 1500, som ligner et tal.
    for (const t of HAANDBOLD_VM2027_HOLD) expect(teamElo(HAANDBOLD_VM2027_HOLD, t.name, NaN), t.name).toBe(t.elo);
  });

  it('ingen har profilens START (1500, skalaens nulpunkt) — det er fallbackens tal, ikke en måling', () => {
    expect(PROFIL.elo.START).toBe(1500);
    expect(HAANDBOLD_VM2027_HOLD.filter((t) => t.elo === PROFIL.elo.START).map((t) => t.name)).toEqual([]);
  });

  it('hvert tal ER målingen (scripts/maal-haandbold.mjs afsnit 7) — et håndrettet tal er rødt', () => {
    const fil = Object.fromEntries(HAANDBOLD_VM2027_HOLD.map((t) => [t.hbKode, t.elo]));
    const ud = Object.fromEntries(maalt.map((h) => [h.kode, h.elo]));
    expect(fil).toEqual(ud);
  });

  it('kun hold UDEN historik har nyStart (1150) — i dag præcis Tyrkiet', () => {
    expect(maalt.filter((h) => !h.harHistorik).map((h) => h.kode)).toEqual(['TUR']);
    expect(holdForKode('TUR').elo).toBe(STARTMETODE.nyStart);
    // Et hold MED historik må ikke stå på nyStart: det ville være et hold, hvis
    // kampe er tabt i opslaget (fx en kode, historikken skriver anderledes).
    for (const h of maalt.filter((x) => x.harHistorik)) expect(h.kampe, h.kode).toBeGreaterThan(0);
  });

  it('Tyskland (eneste vært 2027) har værtsfordelen lagt oveni: 1900 + 25 = 1925', () => {
    const ger = maalt.find((h) => h.kode === 'GER');
    expect(ger.vaert).toBe(STARTMETODE.vaert);
    expect(holdForKode('GER').elo).toBe(1925);
    expect(maalt.filter((h) => h.vaert > 0).map((h) => h.kode)).toEqual(['GER']);
  });

  it('top-10, som ejeren så den (planen §11.8) — en ændring i målingen skal ses her', () => {
    const top = [...HAANDBOLD_VM2027_HOLD].sort((a, b) => b.elo - a.elo).slice(0, 10).map((t) => `${t.hbKode} ${t.elo}`);
    expect(top).toEqual(['DEN 2055', 'GER 1925', 'CRO 1849', 'POR 1773', 'FRA 1749', 'ISL 1695', 'EGY 1681', 'NOR 1637', 'BRA 1635', 'SWE 1631']);
  });
});

// NØDVEJEN (planen §13): IHF-sider, ejeren gemmer i browseren, har navne, ikke
// koder. ihfNavn er nøglen. Regnskabet herunder siger, hvilke navne der er SET
// på en rigtig IHF-side (functions-platform/testdata), og hvilke der ikke er —
// kommer en ny fixture til, bliver testen rød, til listen er rettet.
describe('ihfNavn: nødvejens nøgle til IHF-siderne', () => {
  const require = createRequire(import.meta.url);
  const { parseDagside, parseKampside } = require('../../functions-platform/ihfParse.js');
  const DATA = resolve(process.cwd(), 'functions-platform/testdata');
  const navneIFixtures = new Set();
  for (const f of readdirSync(DATA).filter((x) => /^ihf-(dag|kamp)-.*\.html$/.test(x))) {
    const html = readFileSync(resolve(DATA, f), 'utf8');
    const kampe = f.startsWith('ihf-dag-') ? parseDagside(html) : [parseKampside(html, { ihfId: Number(/-(\d+)\.html$/.exec(f)[1]) })];
    for (const k of kampe) { navneIFixtures.add(k.hjemme); navneIFixtures.add(k.ude); }
  }

  it('alle 32 har et entydigt ihfNavn', () => {
    expect(new Set(HAANDBOLD_VM2027_HOLD.map((t) => t.ihfNavn)).size).toBe(32);
    for (const t of HAANDBOLD_VM2027_HOLD) expect(typeof t.ihfNavn, t.name).toBe('string');
  });

  it('25 navne er set på IHF-sider; præcis disse 7 er det IKKE endnu', () => {
    const ikkeSet = HAANDBOLD_VM2027_HOLD.filter((t) => !navneIFixtures.has(t.ihfNavn)).map((t) => t.hbKode);
    expect(ikkeSet).toEqual(['TUR', 'KUW', 'GRE', 'QAT', 'FRO', 'POL', 'ANG']);
    // IHF skriver USA ud — et «USA» her ville give null på hver USA-kamp.
    expect(holdForIhfNavn('United States of America').name).toBe('USA');
    expect(holdForIhfNavn('USA')).toBeNull();
  });

  it('holdForIhfNavn: præcist navn; pladsholdere, ukendte og tomme giver null', () => {
    expect(holdForIhfNavn('Denmark').name).toBe('Danmark');
    expect(holdForIhfNavn(' Germany ').name).toBe('Tyskland');
    for (const x of ['W QF1', 'L QF2', 'Cuba', 'denmark', '', undefined, null]) expect(holdForIhfNavn(x), String(x)).toBeNull();
  });
});

describe('holdForKode', () => {
  it('finder på kildekoden og på et alias — ukendt giver null, aldrig et gæt', () => {
    expect(holdForKode('DEN').name).toBe('Danmark');
    const hold = [{ name: 'Nordmakedonien', hbKode: 'MKD', aliaser: ['MAC'] }];
    expect(holdForKode('MAC', hold).name).toBe('Nordmakedonien');
    expect(holdForKode('XYZ')).toBeNull();
    expect(holdForKode('')).toBeNull();
    expect(holdForKode(undefined)).toBeNull();
    // Et hold uden aliaser-felt må ikke vælte opslaget.
    expect(holdForKode('X', [{ name: 'X-land', hbKode: 'XXX' }])).toBeNull();
  });
});

describe('mod kampprogrammet', () => {
  it('alle hold i programmet findes i holdfilen, og alle 32 spiller', () => {
    const navne = new Set(HAANDBOLD_VM2027_HOLD.map((t) => t.name));
    const iProgram = new Set(PROGRAM.fixtures.flatMap((f) => [f.home, f.away]));
    expect([...iProgram].filter((n) => !navne.has(n))).toEqual([]);
    expect(iProgram.size).toBe(32);
  });

  it('hvert hold spiller tre kampe i én gruppe', () => {
    for (const t of HAANDBOLD_VM2027_HOLD) {
      const kampe = PROGRAM.fixtures.filter((f) => f.home === t.name || f.away === t.name);
      expect(kampe, t.name).toHaveLength(3);
      expect(new Set(kampe.map((f) => f.gruppe)).size, t.name).toBe(1);
    }
  });
});
