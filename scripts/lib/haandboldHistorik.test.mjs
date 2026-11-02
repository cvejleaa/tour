// Tests for scripts/lib/haandboldHistorik.mjs — måledata til D4.
// Fixture: VM 2025-siden beskåret til 26 kampe (scripts/testdata/wiki-vm2025-udsnit.wikitext).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  udtraekKampe, resume, TURNERINGER, MIN_SPILLEDE, gemteFiler, sidensTidszone,
} from './haandboldHistorik.mjs';

const HER = dirname(fileURLToPath(import.meta.url));
const VM2025 = readFileSync(resolve(HER, '../testdata/wiki-vm2025-udsnit.wikitext'), 'utf8');
const FIL = JSON.parse(readFileSync(resolve(HER, '../haandbold-historik.json'), 'utf8'));
const r = udtraekKampe(VM2025, 'vm2025', { minSpillede: 1 });

describe('udtræk af én side', () => {
  it('alle 26 kampe er spillede og læst — ingen afvist', () => {
    expect(r.kampe).toHaveLength(26);
    expect(r.afviste).toEqual([]);
    expect(r.ikkeSpillet).toBe(0);
    expect(r.ukendteFelter).toEqual({ bg: 2 });
  });

  it('en kamp er dato, hold (koder), efter 60, slut og afgørelse', () => {
    expect(r.kampe.find((k) => k.hjemme === 'POR' && k.ude === 'GER')).toEqual({
      turnering: 'vm2025',
      dato: '2025-01-29',
      tid: '20:30',
      sektion: 'Final round › Quarterfinals',
      hjemme: 'POR',
      ude: 'GER',
      efter60: { h: 26, u: 26 },
      slut: { h: 31, u: 30 },
      afgjort: 'forlaenget',
    });
  });

  it('er sorteret efter dato og tid', () => {
    const noegler = r.kampe.map((k) => `${k.dato} ${k.tid}`);
    expect(noegler).toEqual([...noegler].sort());
  });

  it('resuméet tæller efter 60 min — ikke slutstillingen', () => {
    // I fixturen: CZE–SUI 17–17, HUN–MKD 27–27, SWE–POR 37–37 (uafgjort
    // også i slutstillingen) + GUI–CUB og POL–USA (straffekast) og POR–GER
    // (forlænget), der stod lige efter 60 → 6. Tæller man på slutstillingen,
    // giver det 3 — og den forkerte model ville se halvt så mange X.
    expect(resume(r.kampe)).toMatchObject({ kampe: 26, uafgjortEfter60: 6, forlaenget: 1, straffe: 2 });
    expect(r.kampe.filter((k) => k.slut.h === k.slut.u)).toHaveLength(3);
  });

  it('en ulæselig kamp AFVISES med grund — den forsvinder ikke, og den vælter ikke siden', () => {
    const t = VM2025.replace('|score=31–30\n|team2={{hb|GER}}', '|score=31–30 (ET)\n|team2={{hb|GER}}');
    const x = udtraekKampe(t, 'vm2025', { minSpillede: 1 });
    expect(x.kampe).toHaveLength(25);
    expect(x.afviste).toHaveLength(1);
    expect(x.afviste[0]).toMatchObject({ sektion: 'Final round › Quarterfinals' });
    expect(x.afviste[0].grund).toMatch(/stillingen «31–30 \(ET\)» er ikke «tal–tal»/);
  });

  // Begge sider: en vagt, der kun kigger på hjemmeholdet, ville lade en
  // kamp med et pladsholder-UDEhold komme med som «GER mod undefined».
  it.each([
    ['hjemme', '|team1={{hb-rt|POR}}', '|team1=WQF4'],
    ['ude', '|team2={{hb|GER}}', '|team2=WQF3'],
  ])('en score med pladsholder som %shold afvises', (_, fra, til) => {
    const t = VM2025.replace(fra, til);
    expect(t).not.toBe(VM2025);
    const x = udtraekKampe(t, 'vm2025', { minSpillede: 1 });
    expect(x.kampe).toHaveLength(25);
    expect(x.afviste.map((a) => a.grund)).toEqual(['kampen har en score, men et af holdene er ikke et land ({{hb|KODE}})']);
  });

  it('en spillet kamp uden dato afvises med grund', () => {
    const t = VM2025.replace('|date=29 January 2025\n|time=20:30\n|team1={{hb-rt|POR}}', '|date=\n|time=20:30\n|team1={{hb-rt|POR}}');
    expect(t).not.toBe(VM2025);
    const x = udtraekKampe(t, 'vm2025', { minSpillede: 1 });
    expect(x.kampe).toHaveLength(25);
    expect(x.afviste.map((a) => a.grund)).toEqual(['kampen har ingen dato']);
  });

  it('en kamp uden score er «ikke spillet» — talt, ikke med', () => {
    const t = VM2025.replace('|score=31–30\n|team2={{hb|GER}}', '|score=\n|team2={{hb|GER}}')
      .replace('|FT=26–26\n|OT1=5–4\n', '');
    const x = udtraekKampe(t, 'vm2025', { minSpillede: 1 });
    expect(x.kampe).toHaveLength(25);
    expect(x.ikkeSpillet).toBe(1);
  });

  // STRUKTUR-VAGT: en side med en brøkdel af kampene er en side i ny form.
  it('KASTER under gulvet — med standardgulvet på 60', () => {
    expect(MIN_SPILLEDE).toBe(60);
    expect(() => udtraekKampe(VM2025, 'vm2025')).toThrow('vm2025: kun 26 spillede kampe på siden (26 {{handballbox}}, 0 afvist) — under 60. Siden har skiftet form; intet er skrevet.');
    expect(() => udtraekKampe(VM2025, 'vm2025', { minSpillede: 26 })).not.toThrow();
    expect(() => udtraekKampe(VM2025, 'vm2025', { minSpillede: 27 })).toThrow(/under 27/);
  });
});

describe('tidszonen pr. side', () => {
  it('VM 2025-siden er UTC+1; en side uden angivelse giver null + grunden — aldrig et gæt', () => {
    expect(sidensTidszone(VM2025)).toEqual({ forskydningMin: 60, fejl: null });
    const u = sidensTidszone('== Main round ==');
    expect(u.forskydningMin).toBeNull();
    expect(u.fejl).toMatch(/der gættes ikke/);
    expect(sidensTidszone("All times are local ([[Egypt Standard Time|UTC+2]]).").forskydningMin).toBe(120);
  });
});

describe('nødvejen: gemte sider i en mappe (--filer)', () => {
  it('én fil pr. valgt turnering, .json, .wikitext eller .txt', () => {
    expect(gemteFiler(['vm2025.json', 'em2026.wikitext', 'vm2023.TXT', 'noter.md'], ['vm2025', 'em2026', 'vm2023']))
      .toEqual({ vm2025: 'vm2025.json', em2026: 'em2026.wikitext', vm2023: 'vm2023.TXT' });
  });

  it('KASTER, når en mangler — og nævner ALLE de manglende, før noget læses', () => {
    expect(() => gemteFiler(['vm2025.json'], ['vm2019', 'vm2025', 'em2020']))
      .toThrow('mappen mangler vm2019.json/.wikitext, em2020.json/.wikitext. Intet er læst. Hent dem, eller vælg færre med --turneringer.');
  });

  it('KASTER, når en turnering har to filer — der vælges ikke', () => {
    expect(() => gemteFiler(['vm2025.json', 'vm2025.wikitext'], ['vm2025'])).toThrow('vm2025 har 2 filer i mappen (vm2025.json, vm2025.wikitext) — hvilken er siden? Fjern de andre.');
  });

  it('et navn, der kun ligner, tæller ikke (vm20250.json, xvm2025.json)', () => {
    expect(() => gemteFiler(['vm20250.json', 'xvm2025.json', 'vm2025.json.bak'], ['vm2025'])).toThrow(/mangler vm2025/);
  });
});

describe('turneringslisten', () => {
  it('herre-VM 2019-2025 og EM 2020-2026, entydige nøgler', () => {
    expect(TURNERINGER.map((t) => t.noegle)).toEqual(['vm2019', 'em2020', 'vm2021', 'em2022', 'vm2023', 'em2024', 'vm2025', 'em2026']);
    for (const t of TURNERINGER) {
      const aar = t.noegle.slice(2);
      expect(t.titel).toBe(`${aar} ${t.noegle.startsWith('vm') ? 'World' : 'European'} Men's Handball Championship`);
    }
  });
});

// Den committede måledata-fil skal være bygget af modulet — og sige, hvilke
// turneringer den rummer. Den rummer i dag KUN vm2025 (se docs/drift.md); en
// fil, der lod som om den havde alle otte, ville give D4 en måling, der ser
// rigtig ud.
describe('scripts/haandbold-historik.json', () => {
  it('siger selv, hvilke turneringer den rummer, og kampene passer til det', () => {
    expect(FIL.turneringer).toEqual(FIL.kilder.map((k) => k.noegle));
    expect(new Set(FIL.kampe.map((k) => k.turnering))).toEqual(new Set(FIL.turneringer));
    for (const k of FIL.kilder) {
      expect(FIL.kampe.filter((x) => x.turnering === k.noegle)).toHaveLength(k.kampe);
      expect(k.licens).toBe('CC BY-SA 4.0');
      expect(Number.isInteger(k.revid), k.noegle).toBe(true);
      expect(['api', 'fil'], k.noegle).toContain(k.vej);
    }
    expect(FIL._note).toMatch(/CC BY-SA 4\.0/);
  });

  // HVOR DATA KOM FRA. VM 2025 kom IKKE gennem scriptets eget kald (Wikipedia
  // svarede 429 på Node), men fra API-svaret hentet med curl og læst med
  // --filer. Filen skal sige det — ellers ligner den et scriptkald.
  it('vm2025 står som læst fra en gemt fil, med filens tid og sidens tidszone', () => {
    const k = FIL.kilder.find((x) => x.noegle === 'vm2025');
    expect(k).toMatchObject({ vej: 'fil', fil: 'vm2025.json', revid: 1378613629, forskydningMin: 60, kampe: 108 });
    expect(k.hentet).not.toMatch(/:00\.000Z$/);
    expect(FIL._note).toMatch(/fil \(læst med --filer fra en gemt side; hentet = filens tid\)/);
  });

  it('fixturens 26 kampe står uændret i filen (samme parser, samme tal)', () => {
    for (const k of r.kampe) {
      expect(FIL.kampe, `${k.hjemme}–${k.ude} ${k.dato}`).toContainEqual(k);
    }
  });
});
