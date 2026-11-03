// Tests for scripts/lib/haandboldHistorik.mjs — måledata til D4.
// Fixture: VM 2025-siden beskåret til 26 kampe (scripts/testdata/wiki-vm2025-udsnit.wikitext).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  udtraekKampe, resume, TURNERINGER, MIN_SPILLEDE, gemteFiler, sidensTidszone, SAMME_HOLD,
} from './haandboldHistorik.mjs';

const HER = dirname(fileURLToPath(import.meta.url));
const VM2025 = readFileSync(resolve(HER, '../testdata/wiki-vm2025-udsnit.wikitext'), 'utf8');
const FIL = JSON.parse(readFileSync(resolve(HER, '../haandbold-historik.json'), 'utf8'));
// Fixturen er beskåret: 26 kampe og ingen infoboks. Regnskabet mod
// infoboksens «matches=» har sine egne tests herunder (med en infoboks).
const UDSNIT = { minSpillede: 1, kraevKamptal: false };
const r = udtraekKampe(VM2025, 'vm2025', UDSNIT);

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

  // MÅLENE efter 60 min — D4 måler på dette tal. Tre kampe, den ene forlænget
  // (26–26 → 31–30): efter 60 = 52 + 55 + 53 = 160 → 53,3 pr. kamp. På
  // slutstillingen var det 169 → 56,3, og uden afrunding 53,333….
  it('mål pr. kamp tæller efter 60 min, med én decimal', () => {
    const k = (h, u, sh = h, su = u, afgjort = null) => ({ efter60: { h, u }, slut: { h: sh, u: su }, afgjort });
    expect(resume([k(26, 26, 31, 30, 'forlaenget'), k(30, 25), k(28, 25)])).toStrictEqual({
      kampe: 3, uafgjortEfter60: 1, forlaenget: 1, straffe: 0, maalPrKamp60: 53.3,
    });
    expect(resume([])).toStrictEqual({ kampe: 0, uafgjortEfter60: 0, forlaenget: 0, straffe: 0, maalPrKamp60: null });
    // Fixturen: 1493 mål efter 60 min i 26 kampe = 57,42 → 57,4 (slutstillingen giver 1514 = 58,2).
    const efter60 = r.kampe.reduce((s, x) => s + x.efter60.h + x.efter60.u, 0);
    const slut = r.kampe.reduce((s, x) => s + x.slut.h + x.slut.u, 0);
    expect([efter60, slut]).toEqual([1493, 1514]);
    expect(resume(r.kampe).maalPrKamp60).toBe(57.4);
  });

  it('en ulæselig kamp AFVISES med grund — den forsvinder ikke, og den vælter ikke siden', () => {
    const t = VM2025.replace('|score=31–30\n|team2={{hb|GER}}', '|score=31–30 (ET)\n|team2={{hb|GER}}');
    const x = udtraekKampe(t, 'vm2025', UDSNIT);
    expect(x.kampe).toHaveLength(25);
    expect(x.afviste).toHaveLength(1);
    expect(x.afviste[0]).toMatchObject({ sektion: 'Final round › Quarterfinals', art: 'ulaeselig' });
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
    const x = udtraekKampe(t, 'vm2025', UDSNIT);
    expect(x.kampe).toHaveLength(25);
    expect(x.afviste.map((a) => a.grund)).toEqual(['kampen har en score, men et af holdene er ikke et land ({{hb|KODE}})']);
  });

  it('en spillet kamp uden dato afvises med grund', () => {
    const t = VM2025.replace('|date=29 January 2025\n|time=20:30\n|team1={{hb-rt|POR}}', '|date=\n|time=20:30\n|team1={{hb-rt|POR}}');
    expect(t).not.toBe(VM2025);
    const x = udtraekKampe(t, 'vm2025', UDSNIT);
    expect(x.kampe).toHaveLength(25);
    expect(x.afviste.map((a) => a.grund)).toEqual(['kampen har ingen dato']);
  });

  it('en kamp uden score er «ikke spillet» — talt, ikke med', () => {
    const t = VM2025.replace('|score=31–30\n|team2={{hb|GER}}', '|score=\n|team2={{hb|GER}}')
      .replace('|FT=26–26\n|OT1=5–4\n', '');
    const x = udtraekKampe(t, 'vm2025', UDSNIT);
    expect(x.kampe).toHaveLength(25);
    expect(x.ikkeSpillet).toBe(1);
  });

  // STRUKTUR-VAGT: en side med en brøkdel af kampene er en side i ny form.
  it('KASTER under gulvet — med standardgulvet på 60', () => {
    expect(MIN_SPILLEDE).toBe(60);
    expect(() => udtraekKampe(VM2025, 'vm2025')).toThrow('vm2025: kun 26 spillede kampe på siden (26 {{handballbox}}, 0 afvist) — under 60. Siden har skiftet form; intet er skrevet.');
    expect(() => udtraekKampe(VM2025, 'vm2025', { minSpillede: 26, kraevKamptal: false })).not.toThrow();
    expect(() => udtraekKampe(VM2025, 'vm2025', { minSpillede: 27, kraevKamptal: false })).toThrow(/under 27/);
  });
});

// REGNSKABET. Siden siger selv, hvor mange kampe der blev spillet; læste +
// afviste (uden walkovers) skal give præcis det tal. Fundet ved EM 2026: 64
// kasser, men 65 kampe — finalen var transkluderet fra en anden side og
// forsvandt i stilhed, for 64 er over gulvet på 60.
describe('regnskabet mod infoboksens «matches=»', () => {
  const infoboks = (n) => `{{Infobox International Handball Competition\n| teams = 24\n| matches = ${n}\n}}\n`;
  const kamp = (dag, score, ekstra = {}) => `{{handballbox\n${Object.entries({
    date: `${dag} January 2026`, time: '18:00', team1: '{{hb-rt|DEN}}', score, team2: '{{hb|GER}}', ...ekstra,
  }).map(([k, v]) => `|${k}=${v}`).join('\n')}\n}}\n`;
  const TRE = `== Preliminary round ==\nAll times are local (UTC+1).\n${kamp(1, '30–29', { HT: '15–14' })}${kamp(2, '28–28', { HT: '14–14' })}${kamp(3, '25–31', { HT: '12–15' })}`;
  const O = { minSpillede: 1 };

  it('går op: 3 kampe på siden, infoboksen siger 3 — og tallet står i resultatet', () => {
    const x = udtraekKampe(infoboks(3) + TRE, 'em2026', O);
    expect(x.kampe).toHaveLength(3);
    expect(x.infoboksKampe).toBe(3);
    expect(x.afviste).toEqual([]);
  });

  // Begge retninger: en kamp for lidt (tabt) og en for meget (talt to gange).
  it.each([[4, 3], [2, 3]])('KASTER, når siden siger %i, men parseren gør rede for %i', (siger, gjort) => {
    expect(() => udtraekKampe(infoboks(siger) + TRE, 'em2026', O)).toThrow(
      `em2026: siden siger ${siger} kampe (infoboksens «matches=»), men parseren gør rede for ${gjort} (${gjort} læst + 0 afvist; walkovers tæller ikke). `
      + 'En kamp er tabt eller talt to gange — find den, før noget bruges. Intet er skrevet.',
    );
  });

  // VM 2021: 108 kasser, infoboksen siger 102 — de seks er Kap Verdes walkovers.
  it('en walkover er afvist med art «walkover» og tæller IKKE som spillet', () => {
    const t = TRE + kamp(4, '0–10{{refn|group=note|name=CPV}}');
    const x = udtraekKampe(infoboks(3) + t, 'vm2021', O);
    expect(x.kampe).toHaveLength(3);
    expect(x.afviste).toEqual([{
      nr: 4, sektion: 'Preliminary round', art: 'walkover',
      grund: 'Kamp nr. 4 (Preliminary round): walkover (0–10 tildelt uden kamp, ingen pausestilling) — ikke en spillet kamp',
    }]);
    expect(() => udtraekKampe(infoboks(4) + t, 'vm2021', O)).toThrow(/siden siger 4 kampe .* gør rede for 3 \(3 læst \+ 0 afvist/);
  });

  it('en ulæselig kamp ER spillet og tæller med i regnskabet', () => {
    const t = TRE + kamp(4, '31–30 (ET)');
    const x = udtraekKampe(infoboks(4) + t, 'em2026', O);
    expect(x.afviste.map((a) => a.art)).toEqual(['ulaeselig']);
    expect(() => udtraekKampe(infoboks(3) + t, 'em2026', O)).toThrow(/gør rede for 4 \(3 læst \+ 1 afvist/);
  });

  // EM 2026's form, ordret: sektionen har ingen kasse, kun en transklusion.
  // Som på siden: finalen står i SAMME niveau-2-sektion som bronzekampen.
  it('en transkluderet kamp afvises med art «andenSide», side og sektion — og går op i regnskabet', () => {
    const t = `${TRE}== Knockout stage ==\n=== Third place game ===\n${kamp(4, '33–34', { HT: '14–17' })}`
      + "=== Final ===\n{{main|2026 European Men's Handball Championship final}}\n"
      + "{{#section:2026 European Men's Handball Championship final|Final}}\n\n== Rankings ==\n";
    const x = udtraekKampe(infoboks(5) + t, 'em2026', O);
    expect(x.kampe).toHaveLength(4);
    expect(x.afviste).toEqual([{
      nr: null,
      sektion: 'Knockout stage › Final',
      art: 'andenSide',
      grund: "kampen står ikke på siden, men transkluderes fra «2026 European Men's Handball Championship final» "
        + "({{#section:2026 European Men's Handball Championship final|Final}}) — den side er ikke hentet, så kampen er IKKE med",
    }]);
  });

  // SIKKERHEDSNETTET. Står transklusionen i en niveau-2-sektion EFTER den
  // sidste kasse, ligger den uden for kampenes område og meldes ikke som
  // afvist — men regnskabet ser hullet og kaster. Højt, ikke tavst.
  it('en transklusion uden for kampenes område fanges af regnskabet', () => {
    const t = `${TRE}== Knockout stage ==\n=== Final ===\n{{#section:X final|Final}}\n\n== Rankings ==\n`;
    expect(() => udtraekKampe(infoboks(4) + t, 'em2026', O)).toThrow(/siden siger 4 kampe .* gør rede for 3/);
  });

  it('KASTER som standard, når siden ikke har et kamptal — så kan en tabt kamp ikke ses', () => {
    expect(() => udtraekKampe(TRE, 'em2026', O)).toThrow('em2026: siden har ingen {{Infobox …}} — kampenes antal kan ikke efterprøves, og en tabt kamp ville ikke ses. Intet er skrevet.');
    expect(() => udtraekKampe(infoboks('TBD') + TRE, 'em2026', O)).toThrow(/infoboksens «matches=TBD» er ikke et tal/);
    expect(udtraekKampe(TRE, 'em2026', { ...O, kraevKamptal: false }).infoboksKampe).toBeNull();
  });

  // De to hold uden trebogstavskode kommer med som kampe — ikke som afviste.
  it('COR (VM 2019) og RHF → RUS (VM 2021) er kampe med koden', () => {
    const t = `== Preliminary round ==\n${kamp(1, '19–30', { team1: '{{hb-rt|Korea|unification}}', HT: '10–17' })}`
      + `${kamp(2, '32–32', { team1: '{{hb-rt|BLR}}', team2: " [[Russia men's national handball team|Russian Handball Federation]]", HT: '15–15' })}`;
    const x = udtraekKampe(infoboks(2) + t, 'x', O);
    expect(x.kampe.map((k) => `${k.hjemme}–${k.ude}`)).toEqual(['COR–GER', 'BLR–RUS']);
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

describe('ét hold, to koder (Færøerne)', () => {
  const side = (h, u = 'SUI') => `{{Infobox X\n| matches = 1\n}}\n== Preliminary round ==\n{{handballbox\n|date=16 January 2026\n|time=18:00\n|team1={{hb-rt|${h}}}\n|score=30–28\n|team2={{hb|${u}}}\n|HT=15–14\n}}\n`;

  it('FAR (EM 2026-siden) bliver FRO (EM 2024-siden og VM 2027-holdfilen) — på begge sider', () => {
    expect(udtraekKampe(side('FAR'), 'em2026', { minSpillede: 1 }).kampe[0]).toMatchObject({ hjemme: 'FRO', ude: 'SUI' });
    expect(udtraekKampe(side('SUI', 'FAR'), 'em2026', { minSpillede: 1 }).kampe[0]).toMatchObject({ hjemme: 'SUI', ude: 'FRO' });
    expect(udtraekKampe(side('FRO'), 'em2024', { minSpillede: 1 }).kampe[0].hjemme).toBe('FRO');
    expect([...SAMME_HOLD]).toEqual([['FAR', 'FRO']]);
  });
});

// Den committede måledata-fil skal være bygget af modulet — og sige, hvilke
// turneringer den rummer. Siden 3/11 2026 rummer den alle otte, læst med
// --filer fra den rå wikitekst (action=raw). En fil, der lod som om den havde
// flere eller færre, ville give D4 en måling, der ser rigtig ud.
describe('scripts/haandbold-historik.json', () => {
  it('siger selv, hvilke turneringer den rummer, og kampene passer til det', () => {
    expect(FIL.turneringer).toEqual(FIL.kilder.map((k) => k.noegle));
    expect(new Set(FIL.kampe.map((k) => k.turnering))).toEqual(new Set(FIL.turneringer));
    for (const k of FIL.kilder) {
      expect(FIL.kampe.filter((x) => x.turnering === k.noegle)).toHaveLength(k.kampe);
      expect(k.licens).toBe('CC BY-SA 4.0');
      // En revision kommer kun med API-svaret (.json). Den rå wikitekst
      // (action=raw → .wikitext) bærer ingen — så null er SANDT, ikke et hul.
      if (k.vej === 'api' || /\.json$/i.test(k.fil)) expect(Number.isInteger(k.revid), k.noegle).toBe(true);
      else expect(k.revid, k.noegle).toBeNull();
      expect(['api', 'fil'], k.noegle).toContain(k.vej);
      // Regnskabet står i filen: læste + afviste uden walkovers = sidens tal.
      expect(k.kampe + k.afviste.filter((a) => a.art !== 'walkover').length, k.noegle).toBe(k.infoboksKampe);
    }
    expect(FIL._note).toMatch(/CC BY-SA 4\.0/);
    expect(FIL._note).toMatch(/revid = null for en \.wikitext-fil, for action=raw bærer ingen revision/);
  });

  it('alle otte turneringer, med de tal, siderne har', () => {
    expect(FIL.turneringer).toEqual(TURNERINGER.map((t) => t.noegle));
    const tal = Object.fromEntries(FIL.kilder.map((k) => [k.noegle, [k.kampe, k.infoboksKampe, k.afviste.map((a) => a.art).join(',')]]));
    expect(tal).toEqual({
      vm2019: [96, 96, ''],
      em2020: [65, 65, ''],
      vm2021: [102, 102, 'walkover,walkover,walkover,walkover,walkover,walkover'],
      em2022: [65, 65, ''],
      vm2023: [112, 112, ''],
      em2024: [65, 65, ''],
      vm2025: [108, 108, ''],
      em2026: [64, 65, 'andenSide'],
    });
    expect(FIL.kampe).toHaveLength(677);
  });

  // DISPOSITIONERNE fra D3-opfølgningen, set i data.
  it('COR, RHF som RUS, Færøerne som FRO, VM 2023-kvartfinalen med 20:54 — og EM 2026-finalen IKKE med', () => {
    const med = (t, a, b) => FIL.kampe.filter((k) => k.turnering === t && [k.hjemme, k.ude].includes(a) && (!b || [k.hjemme, k.ude].includes(b)));
    expect(med('vm2019', 'COR')).toHaveLength(7);
    expect(med('vm2021', 'RUS')).toHaveLength(6);
    expect(med('vm2021', 'BLR', 'RUS')[0]).toMatchObject({ efter60: { h: 32, u: 32 }, afgjort: null });
    expect(FIL.kampe.filter((k) => k.hjemme === 'FAR' || k.ude === 'FAR')).toEqual([]);
    expect(med('em2026', 'FRO').length).toBeGreaterThan(0);
    expect(med('vm2023', 'FRA', 'GER')).toEqual([expect.objectContaining({ dato: '2023-01-25', tid: '20:54', efter60: { h: 35, u: 28 } })]);
    expect(med('em2026', 'DEN', 'GER').map((k) => k.sektion)).not.toContain('Knockout stage › Final');
    expect(FIL.kilder.find((k) => k.noegle === 'em2026').afviste[0]).toMatchObject({ nr: null, sektion: 'Knockout stage › Final', art: 'andenSide' });
    // Kap Verdes walkovers er ikke kampe.
    expect(med('vm2021', 'CPV').map((k) => `${k.efter60.h}–${k.efter60.u}`).every((s) => !['0–10', '10–0'].includes(s))).toBe(true);
  });

  it('EM 2022: tidszonen er null MED grunden, fordi siden skriver «UTC», men linker til CET', () => {
    const k = FIL.kilder.find((x) => x.noegle === 'em2022');
    expect(k.forskydningMin).toBeNull();
    expect(k.forskydningGrund).toBe('Siden skriver «All times are local ([[Central European Time|UTC]]).» uden en forskydning efter UTC (fx UTC+1) — der gættes ikke.');
    expect(FIL.kilder.filter((x) => x.forskydningMin === null).map((x) => x.noegle)).toEqual(['em2022']);
    expect(FIL.kilder.find((x) => x.noegle === 'vm2021').forskydningMin).toBe(120);
  });

  // HVOR DATA KOM FRA. Alle otte er læst med --filer fra den rå wikitekst
  // (action=raw, ét kald pr. side, 3/11 2026). Filen skal sige det — ellers
  // ligner den et scriptkald. VM 2025's 108 kampe er de samme som i den
  // forrige fil (revision 1378613629, læst fra API-svaret 2/11); efterprøv
  // med `git show 1eba55f:scripts/haandbold-historik.json` mod denne fil.
  it('hver kilde står som læst fra en gemt fil, med filens tid', () => {
    for (const k of FIL.kilder) {
      expect(k, k.noegle).toMatchObject({ vej: 'fil', fil: `${k.noegle}.wikitext`, revid: null });
      expect(k.hentet, k.noegle).not.toMatch(/:00\.000Z$/);
    }
    expect(FIL.kilder.find((x) => x.noegle === 'vm2025')).toMatchObject({ forskydningMin: 60, kampe: 108 });
    expect(FIL._note).toMatch(/fil \(læst med --filer fra en gemt side; hentet = filens tid;/);
  });

  it('fixturens 26 kampe står uændret i filen (samme parser, samme tal)', () => {
    for (const k of r.kampe) {
      expect(FIL.kampe, `${k.hjemme}–${k.ude} ${k.dato}`).toContainEqual(k);
    }
  });
});
