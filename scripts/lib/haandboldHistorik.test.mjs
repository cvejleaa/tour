// Tests for scripts/lib/haandboldHistorik.mjs — måledata til D4.
// Fixture: VM 2025-siden beskåret til 26 kampe (scripts/testdata/wiki-vm2025-udsnit.wikitext).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  udtraekKampe, resume, TURNERINGER, MIN_SPILLEDE, gemteFiler, sidensTidszone, SAMME_HOLD, indsaetTransklusioner,
  ubrugteFiler, andenSideAfvisninger, normTitel,
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
        + "({{#section:2026 European Men's Handball Championship final|Final}}) — den side er ikke givet med, så kampen er IKKE med",
      side: "2026 European Men's Handball Championship final",
    }]);
    expect(x.transkluderet).toEqual([]);
    // Siden er ERKLÆRET for EM 2026 — med sin fil, så beskeden kan nævne den.
    const em = TURNERINGER.find((t) => t.noegle === 'em2026');
    expect(andenSideAfvisninger(em, x.afviste)).toEqual([{
      side: "2026 European Men's Handball Championship final", sektion: 'Knockout stage › Final', erklaeret: true, fil: 'em2026-finale',
    }]);
    // VENDT (Security, D4): her stod `toEqual([])` — en side, ingen havde
    // erklæret, var KUN en synlig afvisning og blev skrevet med rc 0. Nu er
    // den med på listen, som --skriv nægter (én vagt), bare uden fil.
    const ikke = { side: "2026 European Men's Handball Championship final", sektion: 'Knockout stage › Final', erklaeret: false, fil: null };
    expect(andenSideAfvisninger({ noegle: 'x' }, x.afviste)).toEqual([ikke]);
    expect(andenSideAfvisninger({ noegle: 'x', transklusioner: { 'Anden side': 'x-anden' } }, x.afviste)).toEqual([ikke]);
    // Og andre afvisninger (walkover, ulaeselig) er aldrig «andre sider».
    expect(andenSideAfvisninger(em, [{ art: 'walkover', side: "2026 European Men's Handball Championship final" }])).toEqual([]);
    expect(andenSideAfvisninger(em, [{ art: 'ulaeselig', side: "2026 European Men's Handball Championship final" }])).toEqual([]);
  });

  // Security, D4 (sec-d4c/poc.mjs): `…_final` med understregning — eller et
  // dobbelt mellemrum — er SAMME side for Wikipedia. Tegn for tegn gled den
  // forbi den erklærede side; nu genkendes den, både som erklæret og ved indsættelse.
  it('normTitel sammenligner som MediaWiki: _ = mellemrum, ét mellemrum, stort forbogstav', () => {
    expect(normTitel("2026_European_Men's_Handball_Championship_final")).toBe("2026 European Men's Handball Championship final");
    expect(normTitel("  2026 European  Men's Handball Championship   final ")).toBe("2026 European Men's Handball Championship final");
    expect(normTitel('final')).toBe('Final');
    expect(normTitel('Final')).toBe('Final');
    // Kun mellemrum og forbogstav — ikke resten af store/små bogstaver.
    expect(normTitel('Anden Side')).not.toBe(normTitel('anden side'));
    const em = TURNERINGER.find((t) => t.noegle === 'em2026');
    for (const side of ["2026_European_Men's_Handball_Championship_final", "2026 European Men's Handball Championship  final"]) {
      expect(andenSideAfvisninger(em, [{ art: 'andenSide', side, sektion: 'S' }])).toEqual([{ side, sektion: 'S', erklaeret: true, fil: 'em2026-finale' }]);
    }
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

// DEN TRANSKLUDEREDE SIDE GIVET MED. EM 2026's form, ordret (finalen står i
// <section begin="Final" /> … <section end="Final" /> på sin egen side, og
// siden har ANDRE kasser og transklusioner uden for afsnittet — som på
// den rigtige finaleside, der bl.a. transkluderer grupperne tilbage).
describe('en transkluderet side, der er givet med (andreSider)', () => {
  const infoboks = (n) => `{{Infobox International Handball Competition\n| teams = 24\n| matches = ${n}\n}}\n`;
  const kamp = (dag, score, ekstra = {}) => `{{handballbox\n${Object.entries({
    date: `${dag} January 2026`, time: '18:00', team1: '{{hb-rt|DEN}}', score, team2: '{{hb|GER}}', ...ekstra,
  }).map(([k, v]) => `|${k}=${v}`).join('\n')}\n}}\n`;
  const FINALE = "2026 European Men's Handball Championship final";
  const side = (transklusion = `{{#section:${FINALE}|Final}}`) => `${infoboks(4)}== Preliminary round ==\nAll times are local (UTC+1).\n`
    + `${kamp(1, '30–29', { HT: '15–14' })}${kamp(2, '28–28', { HT: '14–14' })}`
    + `== Knockout stage ==\n=== Third place game ===\n${kamp(3, '33–34', { HT: '14–17', team1: '{{hb-rt|ISL}}', team2: '{{hb|CRO}}' })}`
    + `=== Final ===\n{{main|${FINALE}}}\n${transklusion}\n\n== Rankings ==\n`;
  const finaleside = (afsnit = 'Final', aabn = `<section begin="${afsnit}" />`, luk = `<section end="${afsnit}" />`) => `{{Infobox handball match\n}}\n`
    + `==Road to the final==\n{{:2026 European Men's Handball Championship|transcludesection=Group B}}\n${kamp(20, '40–20', { HT: '20–10', team1: '{{hb-rt|FRA}}', team2: '{{hb|ESP}}' })}`
    + `==Match==\n${aabn}{{handballbox\n|bg=gold\n|date=1 February 2026\n|time=18:00\n|team1={{hb-rt|DEN}}\n|score=34–27\n|team2={{hb|GER}}\n|HT=18–16\n}}${luk}\n\nSources:\n`;
  const O = (sider) => ({ minSpillede: 1, andreSider: sider });

  it('afsnittet indsættes, hvor transklusionen stod: finalen er en kamp som alle andre, og regnskabet går op', () => {
    const x = udtraekKampe(side(), 'em2026', O({ [FINALE]: finaleside() }));
    expect(x.afviste).toEqual([]);
    expect(x.kampe).toHaveLength(4);
    expect(x.infoboksKampe).toBe(4);
    expect(x.kampe.at(-1)).toEqual({
      turnering: 'em2026', dato: '2026-02-01', tid: '18:00', sektion: 'Knockout stage › Final',
      hjemme: 'DEN', ude: 'GER', efter60: { h: 34, u: 27 }, slut: { h: 34, u: 27 }, afgjort: null,
    });
    expect(x.transkluderet).toEqual([{ side: FINALE, afsnit: 'Final', sektion: 'Knockout stage › Final' }]);
    // KUN afsnittet: FRA–ESP står på finalesiden, men uden for «Final».
    expect(x.kampe.some((k) => k.hjemme === 'FRA')).toBe(false);
    expect(x.ukendteFelter).toEqual({ bg: 1 });
  });

  // Security, D4: siden stavet om på Wikipedia (understregning, dobbelt
  // mellemrum, lille forbogstav) er SAMME side — og finalen indsættes. Den
  // indsatte side bærer den GIVNE titel, så scriptet finder sin fil.
  it.each([
    [`{{#section:${FINALE.replace(/ /g, '_')}|Final}}`],
    [`{{#section:${FINALE.replace('Handball', ' Handball')}|Final}}`],
    [`{{#section:${FINALE.replace('2026', ' 2026 ')}|Final}}`],
  ])('en omstavet titel (%s) genkendes og indsættes', (transklusion) => {
    const x = udtraekKampe(side(transklusion), 'em2026', O({ [FINALE]: finaleside() }));
    expect(x.afviste).toEqual([]);
    expect(x.kampe).toHaveLength(4);
    expect(x.transkluderet).toEqual([{ side: FINALE, afsnit: 'Final', sektion: 'Knockout stage › Final' }]);
  });

  it('uden siden (eller med en anden sides navn) er kampen afvist som «andenSide» — som før', () => {
    const uden = udtraekKampe(side(), 'em2026', { minSpillede: 1 });
    expect(uden.kampe).toHaveLength(3);
    expect(uden.afviste.map((a) => [a.art, a.sektion])).toEqual([['andenSide', 'Knockout stage › Final']]);
    expect(uden.transkluderet).toEqual([]);
    expect(udtraekKampe(side(), 'em2026', O({})).afviste.map((a) => a.art)).toEqual(['andenSide']);
  });

  // Afsnittets navn er TEKST, ikke et mønster: «Final (DEN)» må ikke matche «Final DEN».
  it('et afsnitsnavn med parenteser findes ordret — og kun ordret', () => {
    const navn = 'Final (DEN)';
    const t = side(`{{#section:${FINALE}|${navn}}}`);
    expect(udtraekKampe(t, 'em2026', O({ [FINALE]: finaleside(navn) })).kampe).toHaveLength(4);
    expect(() => udtraekKampe(t, 'em2026', O({ [FINALE]: finaleside('Final DEN') }))).toThrow('afsnittet «Final (DEN)»');
  });

  it('{{#lst:…}} er samme funktion og indsættes; uden anførselstegn om afsnittets navn også', () => {
    const lst = udtraekKampe(side(`{{#lst:${FINALE}|Final}}`), 'em2026', O({ [FINALE]: finaleside() }));
    expect(lst.kampe).toHaveLength(4);
    const raa = finaleside('Final', '<section begin=Final/>', '<section end=Final/>');
    expect(udtraekKampe(side(), 'em2026', O({ [FINALE]: raa })).kampe).toHaveLength(4);
  });

  // En form, vi ikke kender, indsættes IKKE — den afvises (og så kaster den
  // givne, ubrugte side: ellers lå filen i mappen og lignede en kamp, der er med).
  it.each([
    ['{{#section-h:…}}', `{{#section-h:${FINALE}|Final}}`],
    ['{{:Side}}', `{{:${FINALE}}}`],
    ['en udkommenteret transklusion', `<!-- {{#section:${FINALE}|Final}} -->`],
    ['et andet afsnitsnavn på samme side', `{{#section:${FINALE}|Finals}}`],
  ])('%s indsættes ikke', (_, t) => {
    const e = `em2026: «${FINALE}» er givet med, men siden transkluderer ikke et afsnit derfra ({{#section:Side|Afsnit}}). Er det den rigtige side? Intet er skrevet.`;
    if (t.includes('Finals')) {
      expect(() => udtraekKampe(side(t), 'em2026', O({ [FINALE]: finaleside() }))).toThrow('afsnittet «Finals»');
    } else {
      expect(() => udtraekKampe(side(t), 'em2026', O({ [FINALE]: finaleside() }))).toThrow(e);
    }
  });

  it('KASTER, når afsnittet mangler, står to gange, eller slutter før det begynder', () => {
    const hvor = `em2026: afsnittet «Final» på «${FINALE}»`;
    expect(() => udtraekKampe(side(), 'em2026', O({ [FINALE]: finaleside('Andet') })))
      .toThrow(`${hvor} står 0 gang(e) som begyndelse og 0 som slutning — præcis én af hver kræves. Intet er skrevet.`);
    const to = finaleside() + '<section begin="Final" /><section end="Final" />';
    expect(() => udtraekKampe(side(), 'em2026', O({ [FINALE]: to }))).toThrow(`${hvor} står 2 gang(e) som begyndelse og 2 som slutning`);
    const kunBegynd = finaleside('Final', '<section begin="Final" />', '');
    expect(() => udtraekKampe(side(), 'em2026', O({ [FINALE]: kunBegynd }))).toThrow(`${hvor} står 1 gang(e) som begyndelse og 0 som slutning`);
    const kunSlut = finaleside('Final', '', '<section end="Final" />');
    expect(() => udtraekKampe(side(), 'em2026', O({ [FINALE]: kunSlut }))).toThrow(`${hvor} står 0 gang(e) som begyndelse og 1 som slutning`);
    const omvendt = finaleside('Final', '<section end="Final" />', '<section begin="Final" />');
    expect(() => udtraekKampe(side(), 'em2026', O({ [FINALE]: omvendt }))).toThrow(`${hvor} slutter, før det begynder. Intet er skrevet.`);
    // Uparrede anførselstegn er ikke et navn, vi kender — de tælles ikke.
    const uparret = finaleside('Final', '<section begin="Final\' />', '<section end=Final" />');
    expect(() => udtraekKampe(side(), 'em2026', O({ [FINALE]: uparret }))).toThrow(`${hvor} står 0 gang(e) som begyndelse og 0 som slutning`);
    // Et udkommenteret afsnit tæller ikke (MediaWiki ser det heller ikke).
    const kommenteret = finaleside('Final', '<!-- <section begin="Final" /> --><section begin="Final" />');
    expect(udtraekKampe(side(), 'em2026', O({ [FINALE]: kommenteret })).kampe).toHaveLength(4);
  });

  it('indsaetTransklusioner rører intet uden givne sider — og en side, der ikke er givet, står urørt', () => {
    // Ordret — også kommentarerne (uden givne sider er teksten den samme streng).
    const t = `<!-- note -->${side()}`;
    expect(indsaetTransklusioner(t, {}, 'em2026')).toEqual({ tekst: t, indsat: [] });
    const anden = `{{#section:Anden side|Final}}\n${t}`;
    const ud = indsaetTransklusioner(anden, { [FINALE]: finaleside() }, 'em2026');
    expect(ud.tekst).toContain('{{#section:Anden side|Final}}');
    expect(ud.tekst).not.toContain(`{{#section:${FINALE}|Final}}`);
    expect(ud.tekst).toContain('|score=34–27');
    expect(ud.tekst).not.toContain('<section');
    expect(ud.indsat).toEqual([{ side: FINALE, afsnit: 'Final', sektion: 'Knockout stage › Final' }]);
  });

  // B4 (modstanderen, finale-vejen): en overskrift i afsnittet blev en
  // overskrift på turneringssiden, og finalen fik sektionen «Match» — tavst,
  // for kamptallet gik stadig op.
  it('KASTER, når det indsatte afsnit indeholder en overskrift', () => {
    const medOverskrift = finaleside('Final', '<section begin="Final" />\n==Match==\n');
    expect(() => udtraekKampe(side(), 'em2026', O({ [FINALE]: medOverskrift })))
      .toThrow(`em2026: afsnittet «Final» på «${FINALE}» indeholder en overskrift («Match») — indsat ville den flytte kampenes sektion væk fra den, hvor transklusionen står. Intet er skrevet.`);
    const dybere = finaleside('Final', '<section begin="Final" />\n=== Kampen ===\n');
    expect(() => udtraekKampe(side(), 'em2026', O({ [FINALE]: dybere }))).toThrow('indeholder en overskrift («Kampen»)');
    // En overskrift UDEN FOR afsnittet (==Match== før begin, som på den rigtige side) er i orden.
    expect(udtraekKampe(side(), 'em2026', O({ [FINALE]: finaleside() })).kampe.at(-1).sektion).toBe('Knockout stage › Final');
    // … og en udkommenteret overskrift i afsnittet tæller ikke.
    const kommenteret = finaleside('Final', '<section begin="Final" />\n<!--\n==Match==\n-->\n');
    expect(udtraekKampe(side(), 'em2026', O({ [FINALE]: kommenteret })).kampe.at(-1).sektion).toBe('Knockout stage › Final');
  });

  // A3 (modstanderen): sektionen for transklusionen skal tages af overskrifterne
  // i teksten UDEN kommentarer — det er dén, transklusionens position er i. En
  // lang kommentar FØR transklusionen forskyder ellers overskrifterne, så
  // «Final» lå efter transklusionen, og den fik bronzekampens sektion.
  it('en kommentar før transklusionen flytter ikke sektionen (positionerne er fra teksten uden kommentarer)', () => {
    const lang = `<!-- ${'redaktørens note '.repeat(30)}-->\n`;
    const t = side().replace('=== Final ===', `${lang}=== Final ===`);
    expect(t.indexOf(lang)).toBeLessThan(t.indexOf(`{{#section:${FINALE}|Final}}`));
    const x = udtraekKampe(t, 'em2026', O({ [FINALE]: finaleside() }));
    expect(x.transkluderet).toEqual([{ side: FINALE, afsnit: 'Final', sektion: 'Knockout stage › Final' }]);
    expect(x.kampe.at(-1).sektion).toBe('Knockout stage › Final');
    // Og en kommentar MELLEM overskriften og transklusionen ligeså.
    const midt = side().replace(`{{#section:${FINALE}|Final}}`, `${lang}{{#section:${FINALE}|Final}}`);
    expect(udtraekKampe(midt, 'em2026', O({ [FINALE]: finaleside() })).transkluderet[0].sektion).toBe('Knockout stage › Final');
  });

  it('EM 2026 i TURNERINGER: finalesiden har filnøglen em2026-finale — og kun EM 2026 har en transklusion', () => {
    expect(TURNERINGER.filter((t) => t.transklusioner).map((t) => [t.noegle, t.transklusioner]))
      .toEqual([['em2026', { [FINALE]: 'em2026-finale' }]]);
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

// B2 (modstanderen): «en fil i mappen, som ikke bruges, stopper scriptet» —
// nu bygget, ikke kun påstået i docs/drift.md.
describe('mappen skal gå op (ubrugteFiler)', () => {
  const alle8 = TURNERINGER.map((t) => `${t.noegle}.wikitext`);
  it('de otte + finalesiden er kendte — intet ukendt, intet sprunget over', () => {
    expect(ubrugteFiler([...alle8, 'em2026-finale.wikitext'], TURNERINGER)).toEqual({ ukendte: [], ikkeValgte: [] });
  });
  it('en stavefejl eller en fremmed fil er UKENDT — også med de rigtige ved siden af', () => {
    expect(ubrugteFiler([...alle8, 'em2026-final.wikitext', 'foo.wikitext', 'noter.md'], TURNERINGER).ukendte)
      .toEqual(['em2026-final.wikitext', 'foo.wikitext', 'noter.md']);
    // Navnet skal passe HELT: et præfiks eller en anden endelse er ikke nøglen.
    expect(ubrugteFiler(['em2026-finale-gammel.wikitext', 'em2026.html', 'xem2026.json'], TURNERINGER).ukendte)
      .toEqual(['em2026-finale-gammel.wikitext', 'em2026.html', 'xem2026.json']);
  });
  it('filer for turneringer, der ikke er valgt, springes over — de er ikke ukendte', () => {
    const em26 = TURNERINGER.filter((t) => t.noegle === 'em2026');
    expect(ubrugteFiler([...alle8, 'em2026-finale.wikitext'], em26))
      .toEqual({ ukendte: [], ikkeValgte: alle8.filter((f) => f !== 'em2026.wikitext') });
    // Finalesiden hører til EM 2026: vælges kun VM 2025, springes den også over.
    const vm25 = TURNERINGER.filter((t) => t.noegle === 'vm2025');
    expect(ubrugteFiler(['vm2025.json', 'em2026-finale.wikitext'], vm25)).toEqual({ ukendte: [], ikkeValgte: ['em2026-finale.wikitext'] });
  });
  it('skjulte filer tæller ikke; store bogstaver i endelsen er som i gemteFiler', () => {
    expect(ubrugteFiler(['.DS_Store', 'vm2023.TXT'], TURNERINGER)).toEqual({ ukendte: [], ikkeValgte: [] });
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

  // De transkluderede sider: en manglende fil er IKKE en fejl (kampen afvises
  // som 'andenSide'), men to filer er stadig et valg, der ikke træffes.
  it('valgfri: en manglende fil udelades; to filer kaster stadig; turneringens fil er ikke finalens', () => {
    const mappe = ['em2026.wikitext', 'em2026-finale.wikitext'];
    expect(gemteFiler(mappe, ['em2026-finale'], { valgfri: true })).toEqual({ 'em2026-finale': 'em2026-finale.wikitext' });
    expect(gemteFiler(['em2026.wikitext'], ['em2026-finale'], { valgfri: true })).toEqual({});
    expect(() => gemteFiler([...mappe, 'em2026-finale.json'], ['em2026-finale'], { valgfri: true })).toThrow('em2026-finale har 2 filer i mappen');
    expect(gemteFiler(mappe, ['em2026'])).toEqual({ em2026: 'em2026.wikitext' });
    expect(() => gemteFiler(['em2026-finale.wikitext'], ['em2026'])).toThrow(/mangler em2026\.json/);
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
    expect(FIL._note).toMatch(/kilder\[\]\.transkluderet = afsnit fra en anden side, indsat hvor siden transkluderer dem/);
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
      em2026: [65, 65, ''],
    });
    expect(FIL.kampe).toHaveLength(678);
  });

  // DISPOSITIONERNE fra D3-opfølgningen, set i data.
  it('COR, RHF som RUS, Færøerne som FRO, VM 2023-kvartfinalen med 20:54 — og EM 2026-finalen MED', () => {
    const med = (t, a, b) => FIL.kampe.filter((k) => k.turnering === t && [k.hjemme, k.ude].includes(a) && (!b || [k.hjemme, k.ude].includes(b)));
    expect(med('vm2019', 'COR')).toHaveLength(7);
    expect(med('vm2021', 'RUS')).toHaveLength(6);
    expect(med('vm2021', 'BLR', 'RUS')[0]).toMatchObject({ efter60: { h: 32, u: 32 }, afgjort: null });
    expect(FIL.kampe.filter((k) => k.hjemme === 'FAR' || k.ude === 'FAR')).toEqual([]);
    expect(med('em2026', 'FRO').length).toBeGreaterThan(0);
    expect(med('vm2023', 'FRA', 'GER')).toEqual([expect.objectContaining({ dato: '2023-01-25', tid: '20:54', efter60: { h: 35, u: 28 } })]);
    // Finalen står på sin egen side og er indsat fra em2026-finale.wikitext
    // (hentet 3/11, action=raw): 34–27 efter 60 min, ingen forlængelse.
    expect(med('em2026', 'DEN', 'GER').filter((k) => k.sektion === 'Knockout stage › Final')).toEqual([{
      turnering: 'em2026', dato: '2026-02-01', tid: '18:00', sektion: 'Knockout stage › Final',
      hjemme: 'DEN', ude: 'GER', efter60: { h: 34, u: 27 }, slut: { h: 34, u: 27 }, afgjort: null,
    }]);
    const em = FIL.kilder.find((k) => k.noegle === 'em2026');
    expect(em.afviste).toEqual([]);
    expect(FIL.kilder.flatMap((k) => k.afviste).filter((a) => a.art === 'andenSide')).toEqual([]);
    expect(em.transkluderet).toEqual([{
      side: "2026 European Men's Handball Championship final",
      afsnit: 'Final',
      sektion: 'Knockout stage › Final',
      url: "https://en.wikipedia.org/wiki/2026_European_Men's_Handball_Championship_final",
      revid: null,
      // PRÆCIST: finalesidens EGEN filtid (hentet 3/11 kl. 10.22 dansk tid),
      // ikke hovedsidens 07:48:12.263Z. Før stod her kun /^2026-11-03T/ og
      // «ikke :00.000Z» — hovedsidens tid bestod begge (modstanderen, B3).
      hentet: '2026-11-03T09:22:42.112Z',
      vej: 'fil',
      fil: 'em2026-finale.wikitext',
    }]);
    expect(em.hentet).toBe('2026-11-03T07:48:12.263Z');
    expect(em.transkluderet[0].hentet).not.toBe(em.hentet);
    expect(em.transkluderet[0].fil).not.toBe(em.fil);
    expect(em.transkluderet[0].url).not.toBe(em.url);
    // Kun EM 2026 har en transkluderet side.
    expect(FIL.kilder.filter((k) => k.transkluderet).map((k) => k.noegle)).toEqual(['em2026']);
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
