// Tests for scripts/lib/haandboldProgram.mjs — VM 2027-programmet og
// fasekalenderen, bygget af Wikipedia-siden (fixture: scripts/testdata/
// wiki-vm2027.wikitext, hentet 2/11 2026).
//
// Tre slags beviser:
//   1. PARITET: den committede scripts/haandbold-vm2027-program.json er
//      PRÆCIS det, modulet bygger af fixturen. Rettes den ene i hånden, er
//      testen rød (CLAUDE.md: «Et spejl af levende data er en løgn med
//      forsinkelse» — her er spejlet bundet til sin kilde).
//   2. TALLENE: 48 kampe, 17 dage, faserne med fra/til/start — skrevet ud som
//      tal, ikke som «noget i et bånd».
//   3. VAGTERNE: hver strukturvagt gøres rød af en ændret fixture, med
//      beskeden asserteret.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  byggProgram, byggFaser, klassificer, programFil, utcTekst, VM_FASER, VM2027_FORMAT, zoneForskydning, tjekTidszone,
  gruppeTabeller,
} from './haandboldProgram.mjs';
import { faseKalenderFejl, dagTaeller, rundeEtiket, erKnockout, ventetekst } from '../../src/lib/faser.js';
import { docId, tjekDubletter, kickoffMs } from '../../src/lib/seedFootball.js';
import { buildMatches } from '../../src/lib/superligaSeed.js';
import { sportProfil } from '../../src/lib/superligaScoring.js';
import { HAANDBOLD_VM2027_HOLD, holdForIhfNavn } from '../../src/data/haandboldVm2027Hold.js';

const HER = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(HER, 'x.js'));
const SIDE = readFileSync(resolve(HER, '../testdata/wiki-vm2027.wikitext'), 'utf8');
const FIL = JSON.parse(readFileSync(resolve(HER, '../haandbold-vm2027-program.json'), 'utf8'));
const P = byggProgram(SIDE);

// Ret én kamp i fixturen: find kassen med netop de to hold og dato.
function retKasse(tekst, { team1, team2, dato }, fn) {
  const re = new RegExp(`\\{\\{handballbox\\n\\|date=${dato}\\n\\|time=[^\\n]*\\n\\|team1=${team1.replace(/[{}|]/g, '\\$&')}\\n\\|score=\\n\\|team2=${team2.replace(/[{}|]/g, '\\$&')}\\n[\\s\\S]*?\\n\\}\\}`);
  const m = re.exec(tekst);
  if (!m) throw new Error(`testen fandt ikke kassen ${team1}–${team2} ${dato}`);
  return tekst.slice(0, m.index) + fn(m[0]) + tekst.slice(m.index + m[0].length);
}
const SRB_URU = { team1: '{{hb-rt|SRB}}', team2: '{{hb|URU}}', dato: '13 January 2027' };

describe('paritet: den committede fil er det, modulet bygger', () => {
  it('faser, grupper, kampe og usikre tider er identiske med scripts/haandbold-vm2027-program.json', () => {
    expect(FIL.faser).toEqual(P.faser);
    expect(FIL.grupper).toEqual(P.grupper);
    expect(FIL.fixtures).toEqual(P.fixtures);
    expect(FIL.usikreTider).toEqual(P.usikreTider);
  });

  // HELE FILEN, som scriptet skriver den. Paritetstesten ovenfor binder
  // faser/fixtures/usikreTider til byggProgram — men scriptet skriver
  // programFil(...). Taber programFil `faser` (som D6 læser), licensen eller
  // revisions-id'et, er det her, det bliver rødt — ikke ved næste --skriv.
  it('programFil(...) med filens egen kilde er den committede fil, felt for felt', () => {
    const bygget = programFil(P, { titel: FIL.kilde.side, revid: FIL.kilde.revid, hentet: FIL.kilde.hentet });
    expect(bygget).toStrictEqual(FIL);
    expect(Object.keys(bygget)).toEqual(['_note', 'kilde', 'faser', 'grupper', 'usikreTider', 'fixtures']);
    expect(Object.keys(bygget.kilde)).toEqual(['side', 'url', 'revid', 'hentet', 'licens']);
    // Et revisions-id går igennem som tal — ikke kun null, som filen har i dag.
    expect(programFil(P, { titel: 'X', revid: 1378613629, hentet: '2026-11-02T13:00:00Z' }).kilde)
      .toStrictEqual({ side: 'X', url: 'https://en.wikipedia.org/wiki/X', revid: 1378613629, hentet: '2026-11-02T13:00:00Z', licens: 'CC BY-SA 4.0' });
  });

  it('filen bærer kilde og licens', () => {
    expect(FIL.kilde).toMatchObject({ side: "2027 World Men's Handball Championship", licens: 'CC BY-SA 4.0' });
    expect(FIL.kilde.url).toBe("https://en.wikipedia.org/wiki/2027_World_Men's_Handball_Championship");
    expect(FIL._note).toMatch(/CC BY-SA 4\.0/);
    expect(FIL._note).toMatch(/RET ALDRIG I HÅNDEN/);
    expect(programFil(P, { titel: 'X' })._note).toMatch(/revision ukendt, hentet ukendt dato/);
  });

  // Noten er en del af filen og bindes til modulet som resten: bygges den
  // igen med filens egen kilde, er den byte for byte den samme.
  it('noten er det, modulet skriver — og tidszonen i den kommer fra SIDEN', () => {
    expect(programFil(P, { titel: FIL.kilde.side, revid: FIL.kilde.revid, hentet: FIL.kilde.hentet })._note).toBe(FIL._note);
    expect(FIL._note).toContain('siden angiver lokal tid UTC+1');
    const egypten = programFil({ ...P, forskydningMin: 120 }, { titel: 'X' })._note;
    expect(egypten).toContain('siden angiver lokal tid UTC+2');
    expect(egypten).not.toContain('UTC+1');
    expect(FIL._note).toContain('kickoffSenest og gruppe når IKKE kampene i databasen');
    // Gruppen NÅR nu spillet (game.grupper) — den gamle påstand må ikke stå.
    expect(FIL._note).toContain('men gruppen når spillet via grupper');
    expect(FIL._note).toContain('faser og grupper er game.faser og game.grupper');
    expect(FIL._note).not.toMatch(/gruppe når IKKE databasen|lægges i scripts\/games\.mjs i D6/);
  });

  it('utcTekst: fortegn og minutter', () => {
    expect([60, 120, 0, -180, 330].map(utcTekst)).toEqual(['UTC+1', 'UTC+2', 'UTC+0', 'UTC−3', 'UTC+5:30']);
    expect(() => utcTekst(undefined)).toThrow(/ikke et helt antal minutter/);
  });
});

describe('fasekalenderen', () => {
  it('er præcis de fem faser — 17 spilledage, knockout fra kvartfinalerne', () => {
    expect(P.faser).toEqual([
      { navn: 'Indledende runde', bestemt: 'Den indledende runde', fra: 1, til: 7, start: '2027-01-13', antalKampe: 48 },
      { navn: 'Hovedrunde', bestemt: 'Hovedrunden', fra: 8, til: 13, start: '2027-01-20', antalKampe: 36 },
      { navn: 'Kvartfinaler', bestemt: 'Kvartfinalerne', fra: 14, til: 15, start: '2027-01-26', antalKampe: 4, knockout: true },
      { navn: 'Semifinaler', bestemt: 'Semifinalerne', fra: 16, til: 16, start: '2027-01-29', antalKampe: 2, knockout: true },
      { navn: 'Finaledag', bestemt: 'Finaledagen', fra: 17, til: 17, start: '2027-01-31', antalKampe: 2, knockout: true },
    ]);
  });

  it('består formkontrollen i src/lib/faser.js', () => {
    expect(faseKalenderFejl(P.faser)).toEqual([]);
  });

  // D5's funktioner læser kalenderen, som spillet ville få den. Det, ejeren
  // har bestemt (§11.2), skal stå — og ligaens tekst må IKKE.
  it('giver D5-fladernes tekster: «Indledende runde · dag 2», «Dag 7 af 17», knockout fra dag 14', () => {
    const game = { faser: P.faser };
    expect(rundeEtiket(game, 2)).toBe('Indledende runde · dag 2');
    expect(dagTaeller(game, 7, 7)).toBe('Dag 7 af 17');
    expect(dagTaeller(game, 7, 7)).not.toBe('Runde 7 af 7');
    expect(rundeEtiket(game, 17)).toBe('Finaledag');
    expect(erKnockout(game, 13)).toBe(false);
    expect(erKnockout(game, 14)).toBe(true);
    expect(ventetekst(game, 7, Date.UTC(2027, 0, 19, 12))).toMatch(/^Hovedrunden lægges ind/);
  });

  // §12.10: en dag med KUN fravalgte kampe er ikke en runde. Flyttes 27/1's
  // to kvartfinaler til 26/1, står 27/1 tilbage med de fire Presidents Cup-
  // placeringskampe — og så har turneringen 16 dage, ikke 17 med en tom.
  it('en dag med kun Presidents Cup/placering er IKKE en runde', () => {
    let t = SIDE;
    for (const [team1, team2] of [['II1', 'IV2'], ['IV1', 'II2']]) {
      t = retKasse(t, { team1, team2, dato: '27 January 2027' }, (k) => k.replace('|date=27 January 2027', '|date=26 January 2027'));
    }
    const p = byggProgram(t);
    expect(p.faser.find((f) => f.navn === 'Kvartfinaler')).toMatchObject({ fra: 14, til: 14, start: '2027-01-26', antalKampe: 4 });
    expect(p.faser.at(-1)).toMatchObject({ navn: 'Finaledag', fra: 16, til: 16 });
    expect(dagTaeller({ faser: p.faser }, 1, 1)).toBe('Dag 1 af 16');
  });

  it('KASTER, når en dag blander to faser', () => {
    const t = retKasse(SIDE, { team1: 'II1', team2: 'IV2', dato: '27 January 2027' }, (k) => k.replace('|date=27 January 2027', '|date=25 January 2027'));
    expect(() => byggProgram(t)).toThrow('2027-01-25 har kampe fra både «hoved» og «kvart»');
  });

  it('KASTER, når en fase mangler', () => {
    expect(() => byggFaser([{ dato: '2027-01-13', fase: 'indledende' }])).toThrow(/ingen kampe i fasen «Hovedrunde»/);
  });

  it('faserne står i den rækkefølge, kalenderen tæller', () => {
    expect(VM_FASER.map((f) => f.noegle)).toEqual(['indledende', 'hoved', 'kvart', 'semi', 'finale']);
  });
});

describe('den indledende runde', () => {
  it('48 kampe på dag 1-7 med entydige id og gyldigt kickoff (seed-football-formen)', () => {
    expect(P.fixtures).toHaveLength(48);
    expect(() => tjekDubletter(P.fixtures)).not.toThrow();
    for (const f of P.fixtures) {
      expect(docId(f)).toBe(f.id);
      expect(Number.isFinite(kickoffMs(f.kickoff)), f.id).toBe(true);
      expect(f.round).toBeGreaterThanOrEqual(1);
      expect(f.round).toBeLessThanOrEqual(7);
      expect(f.id.startsWith(`r${f.round}-`), f.id).toBe(true);
    }
    expect(new Set(P.fixtures.map((f) => f.round))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
  });

  it('første kamp: Serbien–Uruguay 13/1 kl. 17.30 dansk tid = 16:30 UTC', () => {
    expect(P.fixtures[0]).toEqual({
      id: 'r1-srb-uru', round: 1, home: 'Serbien', away: 'Uruguay', kickoff: '2027-01-13T16:30:00Z', gruppe: 'A',
    });
  });

  it('Danmarks tre kampe i gruppe G på dag 3, 5 og 7', () => {
    const dk = P.fixtures.filter((f) => f.home === 'Danmark' || f.away === 'Danmark');
    expect(dk.map((f) => [f.round, f.home, f.away, f.kickoff])).toEqual([
      [3, 'Danmark', 'USA', '2027-01-15T19:30:00Z'],
      [5, 'Angola', 'Danmark', '2027-01-17T19:30:00Z'],
      [7, 'Danmark', 'Slovenien', '2027-01-19T19:30:00Z'],
    ]);
    expect(new Set(dk.map((f) => f.gruppe))).toEqual(new Set(['G']));
  });

  it('hver runde ligger på ÉN dansk kalenderdag', () => {
    const dage = new Map();
    for (const f of P.fixtures) {
      const d = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(f.kickoff));
      dage.set(f.round, [...new Set([...(dage.get(f.round) || []), d])]);
    }
    expect([...dage.values()].every((d) => d.length === 1)).toBe(true);
    expect(dage.get(1)).toEqual(['2027-01-13']);
    expect(dage.get(7)).toEqual(['2027-01-19']);
  });

  it('ingen Presidents Cup, placering eller pladsholdere — kun de 32 hold', () => {
    const navne = new Set(HAANDBOLD_VM2027_HOLD.map((t) => t.name));
    for (const f of P.fixtures) {
      expect(navne.has(f.home), f.home).toBe(true);
      expect(navne.has(f.away), f.away).toBe(true);
    }
    const pladsholder = /^([A-H][1-4]|(I|II|III|IV)[1-6]|[WL](QF|SF)\d)$/;
    expect(P.fixtures.filter((f) => pladsholder.test(f.home) || pladsholder.test(f.away))).toEqual([]);
    expect(P.fixtures.every((f) => f.kickoff < '2027-01-20')).toBe(true);
  });

  it('seedes uden et eneste ukendt hold (ingen stille neutral rating)', () => {
    const navne = new Set(HAANDBOLD_VM2027_HOLD.map((t) => t.name));
    const ukendte = P.fixtures.flatMap((f) => [f.home, f.away]).filter((n) => !navne.has(n));
    expect(ukendte).toEqual([]);
    // buildMatches bevarer id'et — ellers skrev seedet til et andet dokument.
    // Her gælder det kun id'et — profilen er ligegyldig for det (håndboldens
    // odds er testet i src/lib/sportProfil.test.js).
    const m = buildMatches(P.fixtures, HAANDBOLD_VM2027_HOLD, sportProfil());
    expect(m.map((x) => x.id)).toEqual(P.fixtures.map((f) => f.id));
  });

  it('de seks tidsvinduer i gruppe D: deadline = det TIDLIGSTE, og de meldes', () => {
    expect(P.usikreTider).toHaveLength(6);
    const arg = P.fixtures.find((f) => f.id === 'r2-arg-bra');
    expect(arg.kickoff).toBe('2027-01-14T17:00:00Z'); // 18:00 dansk — ikke 18:30
    expect(arg.kickoffSenest).toBe('2027-01-14T17:30:00Z');
    expect(P.usikreTider[0]).toBe('r2-arg-bra Argentina–Brasilien 2027-01-14: siden siger «18:00/18:30» — deadline sat til 18:00 (det tidligste)');
    // Kun vinduerne har feltet — en kamp med ét tidspunkt får intet.
    expect(P.fixtures.filter((f) => 'kickoffSenest' in f).map((f) => f.id).sort())
      .toEqual(['r2-arg-bra', 'r2-fra-kuw', 'r4-fra-bra', 'r4-kuw-arg', 'r6-arg-fra', 'r6-bra-kuw']);
  });
});

// TIDSZONEN ER SIDENS, og kickoff er tip-deadline. Fixturen er UTC+1, så en
// kode, der regnede med fast +1, ville bestå alt ovenfor. Samme side i UTC+2
// skal give hver deadline én time tidligere — også vinduernes seneste ende.
describe('tidszonen bestemmer deadline', () => {
  // Helsinki er UTC+2 i januar — så vagten mod værtens zone (tjekTidszone) godtager siden.
  const P2 = byggProgram(SIDE.replace('UTC+1', 'UTC+2'), { format: { ...VM2027_FORMAT, tidszone: 'Europe/Helsinki' } });

  it('UTC+2: 17.30 lokal tid er 15:30 UTC — og vinduet følger med', () => {
    expect(SIDE.split('UTC+1')).toHaveLength(2);
    expect(P2.forskydningMin).toBe(120);
    expect(P2.fixtures[0]).toEqual({
      id: 'r1-srb-uru', round: 1, home: 'Serbien', away: 'Uruguay', kickoff: '2027-01-13T15:30:00Z', gruppe: 'A',
    });
    const arg = P2.fixtures.find((f) => f.id === 'r2-arg-bra');
    expect(arg.kickoff).toBe('2027-01-14T16:00:00Z');
    expect(arg.kickoffSenest).toBe('2027-01-14T16:30:00Z');
    // Hver kamp præcis én time før UTC+1-programmet; ids og runder uændrede.
    const time = 3600 * 1000;
    expect(P2.fixtures.map((f) => [f.id, f.round, Date.parse(f.kickoff) + time, f.kickoffSenest && Date.parse(f.kickoffSenest) + time]))
      .toEqual(P.fixtures.map((f) => [f.id, f.round, Date.parse(f.kickoff), f.kickoffSenest && Date.parse(f.kickoffSenest)]));
  });

  // EFTER MIDNAT. Runden er den LOKALE spilledag; kickoff er UTC og kan derfor
  // ligge på dagen før. 00:30 lokal tid 13/1 (UTC+1) = 23:30Z 12/1 — og
  // kampen hører stadig til dag 1, ikke til en dag, kalenderen ikke har.
  it('en kamp efter midnat lokal tid: kickoff dagen før i UTC, runden er den lokale dag', () => {
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace('|time=17:30', '|time=00:30'));
    const p = byggProgram(t);
    expect(p.fixtures[0]).toEqual({
      id: 'r1-srb-uru', round: 1, home: 'Serbien', away: 'Uruguay', kickoff: '2027-01-12T23:30:00Z', gruppe: 'A',
    });
    expect(p.faser).toEqual(P.faser);
    const p2 = byggProgram(t.replace('UTC+1', 'UTC+2'), { format: { ...VM2027_FORMAT, tidszone: 'Europe/Helsinki' } });
    expect(p2.fixtures[0]).toMatchObject({ id: 'r1-srb-uru', round: 1, kickoff: '2027-01-12T22:30:00Z' });
  });
});

describe('strukturvagterne', () => {
  it('KASTER på en kamp uden tidspunkt — der oprettes aldrig en kamp uden kickoff', () => {
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace('|time=17:30', '|time='));
    expect(() => byggProgram(t)).toThrow(/Kamp nr\. 1 \(Serbien–Uruguay, 2027-01-13\) har intet tidspunkt\. En kamp uden kickoff oprettes aldrig/);
  });

  it('KASTER på en medtaget kamp uden dato — kalenderen bygges aldrig af et hul', () => {
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace('|date=13 January 2027', '|date='));
    expect(() => byggProgram(t)).toThrow('Kamp nr. 1 (Preliminary round › Group A) har ingen dato — kalenderen kan ikke bygges.');
  });

  it('KASTER på en ukendt holdkode og peger på holdfilen', () => {
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace('{{hb-rt|SRB}}', '{{hb-rt|SCG}}'));
    expect(() => byggProgram(t)).toThrow(/holdkoden «SCG» findes ikke i src\/data\/haandboldVm2027Hold\.js/);
  });

  it('KASTER på en pladsholder i den indledende runde', () => {
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace('{{hb-rt|SRB}}', 'A1'));
    expect(() => byggProgram(t)).toThrow(/pladsholderen «A1» — den indledende runde skal have rigtige hold/);
  });

  it('KASTER, når en fase har et andet antal kampe end formatet (en kamp fjernet)', () => {
    const t = retKasse(SIDE, SRB_URU, () => '');
    expect(() => byggProgram(t)).toThrow('Fasen «indledende» har 47 kampe på siden, men formatet siger 48. Intet er skrevet.');
  });

  it('KASTER på en gruppe, der ikke er fire hold én gang mod hinanden', () => {
    // Uruguay byttes ud med Tunesien: stadig 48 kampe, men gruppe A er skæv.
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace('{{hb|URU}}', '{{hb|TUN}}'));
    expect(() => byggProgram(t)).toThrow(/Gruppe A har 4 hold og 6 kampe — ikke 4 hold, der møder hinanden én gang/);
  });

  // Italien byttes ud med Serbien i hele gruppe B: begge grupper er stadig
  // fire hold, der møder hinanden én gang — men Serbien står i to.
  it('KASTER på et hold i to grupper', () => {
    const b = SIDE.indexOf('===Group B===');
    const c = SIDE.indexOf('===Group C===');
    const t = SIDE.slice(0, b) + SIDE.slice(b, c).replaceAll('|ITA}}', '|SRB}}') + SIDE.slice(c);
    expect(() => byggProgram(t)).toThrow('Serbien står i to grupper.');
  });

  // De to næste kan kun nås, hvis FORMATET er selvmodsigende (8 grupper à 4
  // er 32). Vagterne står der, så et rettet format ikke stille giver et
  // program, der ikke passer til det.
  it('KASTER, når antallet af hold ikke er formatets', () => {
    expect(() => byggProgram(SIDE, { format: { ...VM2027_FORMAT, antalHold: 30 } })).toThrow('Programmet har 32 hold, ikke 30.');
  });

  // Programmet har 32 hold, men holdfilen har et 33. — et hold, der ikke
  // spiller, ville få en holdside og en rating uden kampe.
  it('KASTER, når holdfilen har et andet antal hold end formatet', () => {
    const hold = [...HAANDBOLD_VM2027_HOLD, { name: 'Cuba', short: 'CUB', hbKode: 'CUB', aliaser: [] }];
    expect(() => byggProgram(SIDE, { hold })).toThrow('Holdfilen har 33 hold, ikke 32.');
  });

  // En kamp FOR MEGET i en fase (en dubleret kasse i hovedrunden) er lige så
  // forkert som en for lidt — «Dag 7 af 17» og antalKampe ville passe ikke.
  it('KASTER, når en fase har en kamp for meget (37 i hovedrunden)', () => {
    const t = retKasse(SIDE, { team1: 'A1', team2: 'B3', dato: '20 January 2027' }, (k) => `${k}\n${k}`);
    expect(() => byggProgram(t)).toThrow('Fasen «hoved» har 37 kampe på siden, men formatet siger 36. Intet er skrevet.');
  });

  // UKENDTE FELTER i en medtaget kamp: et felt, parseren ikke kender, kunne
  // flytte kickoff (= tip-deadline), og så stod den gamle tid med grøn kørsel.
  it.each([
    ['|timezone=UTC+2', 'timezone'],
    ['|status=postponed', 'status'],
  ])('KASTER på det ukendte felt %s i en medtaget kamp', (felt, navn) => {
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace('|time=17:30', `|time=17:30\n${felt}`));
    expect(() => byggProgram(t)).toThrow(`Kamp nr. 1 (Preliminary round › Group A) har felter, parseren ikke kender: ${navn}. Et ukendt felt kan flytte en tip-deadline`);
  });

  // FODNOTER: parseren fjerner nu {{refn|…}} fra tid, dato og hold (så
  // historikken kan læse VM 2023's «20:54{{refn|…}}»). I programmet er tiden
  // en tip-deadline, og noten kan flytte den — så den stopper programmet,
  // ligesom et ukendt felt. Uden vagten stod 17:30 med grøn kørsel.
  it.each([
    ['tid', '|time=17:30', '|time=17:30{{efn|Flyttet til 15:00 af hensyn til TV.}}', 'time'],
    ['hold', '|team2={{hb|URU}}', '|team2={{hb|URU}}<ref>x</ref>', 'team2'],
  ])('KASTER på en fodnote i %s i en medtaget kamp', (_, fra, til, felt) => {
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace(fra, til));
    expect(t).not.toBe(SIDE);
    expect(() => byggProgram(t)).toThrow(`Kamp nr. 1 (Preliminary round › Group A) har en fodnote i ${felt}. En note kan flytte en tip-deadline, så programmet bygges ikke.`);
  });

  it('et ukendt felt i en FRAVALGT kamp er en advarsel med navnet — ikke en blokering', () => {
    const t = retKasse(SIDE, { team1: 'A4', team2: 'B4', dato: '20 January 2027' }, (k) => k.replace('|time=', '|status=postponed\n|time='));
    const p = byggProgram(t);
    expect(p.fixtures).toEqual(P.fixtures);
    expect(p.advarsler).toEqual([expect.stringMatching(/^\(fravalgt kamp\) Kamp nr\. \d+ \(Presidents Cup › Group I\) har felter, parseren ikke kender: status$/)]);
  });

  it('KASTER, når grupperne ikke er formatets bogstaver', () => {
    const grupper = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'X'];
    expect(() => byggProgram(SIDE, { format: { ...VM2027_FORMAT, grupper } }))
      .toThrow('Grupperne på siden er A, B, C, D, E, F, G, H, ikke A, B, C, D, E, F, G, X.');
  });

  // Dag 7's fire kampe flyttes til den kampløse 28/1: ingen dag blander
  // faser, men den indledende runde ender nu EFTER hovedrunden — kalenderen
  // overlapper, og formkontrollen i src/lib/faser.js skal sige det.
  it('KASTER, når faserne overlapper (formkontrollen i faser.js)', () => {
    let t = SIDE;
    for (const [team1, team2] of [['BHR', 'JPN'], ['USA', 'ANG'], ['DEN', 'SLO'], ['ISL', 'MKD']]) {
      t = retKasse(t, { team1: `{{hb-rt|${team1}}}`, team2: `{{hb|${team2}}}`, dato: '19 January 2027' }, (k) => k.replace('|date=19 January 2027', '|date=28 January 2027'));
    }
    expect(() => byggProgram(t)).toThrow(/Fasekalenderen består ikke formkontrollen \(src\/lib\/faser\.js\):\n {2}- fase 2: starter i runde 7/);
  });

  it('KASTER på et hold, der møder sig selv', () => {
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace('{{hb|URU}}', '{{hb|SRB}}'));
    expect(() => byggProgram(t)).toThrow(/Serbien møder sig selv/);
  });

  it('KASTER på en ny sektion — med navnet, og uden at gætte', () => {
    const t = SIDE.replace('===Quarterfinals===', '===Placement round===');
    expect(() => byggProgram(t)).toThrow(/Ukendt sektion «Final round › Placement round».*der gættes ikke/);
  });

  it('KASTER, når siden ikke siger, hvilken tidszone tiderne står i', () => {
    const t = SIDE.replace("''All times are local ([[Central European Time|UTC+1]]).''", '');
    expect(() => byggProgram(t)).toThrow(/tidszone.*der gættes ikke/);
  });

  it('en fravalgt kamp, der ikke kan læses, er en ADVARSEL — ikke en blokering, og ikke tavs', () => {
    const t = retKasse(SIDE, { team1: 'A4', team2: 'B4', dato: '20 January 2027' }, (k) => k.replace('|time=', '|time=TBD'));
    const p = byggProgram(t);
    expect(p.fixtures).toHaveLength(48);
    expect(p.advarsler).toHaveLength(1);
    expect(p.advarsler[0]).toMatch(/^\(fravalgt kamp\) Kamp nr\. \d+ \(Presidents Cup › Group I\): tidspunktet «TBD» har en ukendt form/);
    expect(P.advarsler).toEqual([]);
  });

  it('en MEDTAGET kamp, der ikke kan læses, vælter kaldet', () => {
    const t = retKasse(SIDE, SRB_URU, (k) => k.replace('|time=17:30', '|time=TBD'));
    expect(() => byggProgram(t)).toThrow(/tidspunktet «TBD» har en ukendt form/);
  });
});

// GRUPPERNE (game.grupper). `point`, `videre` og hovedrundens `fra` er
// KONSTANTER i VM2027_FORMAT, som siden EFTERPRØVES mod — som tidszonen.
// Medlemskabet kommer af kampene (handballboxenes gruppe), rækkefølgen er
// programrækkefølgen, og gruppetabellernes team_order er kun et krydstjek af
// MÆNGDEN (redaktørerne sorterer den efter stillingen under turneringen).
describe('grupperne (game.grupper)', () => {
  // Erstat `fra` med `til` i gruppetabellen under overskriften `gruppe` i
  // sektionen `sektion`. Kaster, hvis intet matcher — en erstatning, der
  // ikke rammer, må ikke give en grøn test, der intet dækker.
  function retTabel(tekst, sektion, gruppe, fra, til) {
    const s = tekst.indexOf(`\n==${sektion}==\n`);
    const g = tekst.indexOf(`\n===${gruppe}===\n`, s);
    const slut = tekst.indexOf('\n}}\n', g);
    if (s < 0 || g < 0 || slut < 0) throw new Error(`testen fandt ikke tabellen ${sektion} › ${gruppe}`);
    const blok = tekst.slice(g, slut);
    if (!blok.includes(fra)) throw new Error(`testen fandt ikke «${fra}» i ${sektion} › ${gruppe}`);
    return tekst.slice(0, g) + blok.replace(fra, til) + tekst.slice(slut);
  }

  it('formen er datakontraktens: point, to faser med videre, A-H med hold og I-IV med fra', () => {
    expect(P.grupper.point).toEqual({ sejr: 2, uafgjort: 1 });
    expect(P.grupper.faser.map((f) => [f.fase, f.videre])).toEqual([['Indledende runde', 3], ['Hovedrunde', 2]]);
    expect(P.grupper.faser[0].grupper.map((g) => g.navn)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(P.grupper.faser[1].grupper).toEqual([
      { navn: 'I', fra: ['A', 'B'] }, { navn: 'II', fra: ['C', 'D'] },
      { navn: 'III', fra: ['E', 'F'] }, { navn: 'IV', fra: ['G', 'H'] },
    ]);
    // Begge faser er navne i kalenderen og ikke knockout.
    for (const f of P.grupper.faser) {
      const fase = P.faser.find((x) => x.navn === f.fase);
      expect(fase, f.fase).toBeDefined();
      expect(fase).not.toHaveProperty('knockout');
    }
  });

  // PROGRAMRÆKKEFØLGE, ikke team_order: siden skriver GER, SRB, TUN, URU og
  // EGY, ITA, CPV, KSA. Første kamp er Serbien–Uruguay 17.30, så
  // Tyskland–Tunesien; i B Italien–Saudi-Arabien før Egypten–Kap Verde.
  it('gruppe A og B: præcis holdene i programrækkefølge — ikke tabellens', () => {
    expect(P.grupper.faser[0].grupper[0]).toEqual({ navn: 'A', hold: ['Serbien', 'Uruguay', 'Tyskland', 'Tunesien'] });
    expect(P.grupper.faser[0].grupper[1]).toEqual({ navn: 'B', hold: ['Italien', 'Saudi-Arabien', 'Egypten', 'Kap Verde'] });
    expect(gruppeTabeller(SIDE).indledende.get('A').koder).toEqual(['GER', 'SRB', 'TUN', 'URU']);
  });

  it('hvert hold står i præcis den gruppe, dets kampe er i — alle 32, ingen to gange', () => {
    const gruppeAf = new Map();
    for (const g of P.grupper.faser[0].grupper) {
      for (const h of g.hold) {
        expect(gruppeAf.has(h), h).toBe(false);
        gruppeAf.set(h, g.navn);
      }
    }
    expect(gruppeAf.size).toBe(32);
    for (const f of P.fixtures) {
      expect(gruppeAf.get(f.home), f.id).toBe(f.gruppe);
      expect(gruppeAf.get(f.away), f.id).toBe(f.gruppe);
    }
  });

  // Q5: Presidents Cup har også «Group I» og «Group II». Klassificeres der
  // på gruppenavnet alene, bliver PC's I (A4, B4, E4, F4) hovedrundens.
  it('tabellerne klassificeres på sektionsstien: Presidents Cups Group I er IKKE hovedrundens', () => {
    const t = gruppeTabeller(SIDE);
    expect([...t.indledende.keys()]).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect([...t.hoved.keys()]).toEqual(['I', 'II', 'III', 'IV']);
    expect(t.hoved.get('I').koder).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
    expect(t.hoved.get('I').hvor).toBe('Gruppetabellen i «Main round › Group I»');
    // Presidents Cup læses slet ikke: en ulæselig PC-tabel ændrer intet.
    const pc = retTabel(SIDE, 'Presidents Cup', 'Group I', 'team_order=A4, B4, E4, F4', 'team_order=XYZ, A9');
    expect(byggProgram(pc).grupper).toEqual(P.grupper);
  });

  // Q4: under turneringen sorterer redaktørerne team_order efter stillingen,
  // og hovedrundens pladsholdere bliver rigtige koder. Det må ikke ændre
  // `grupper` — ellers gav en ny kørsel en seedGames-diff midt i turneringen.
  it('team_order med rigtige koder i ny orden giver UÆNDREDE grupper', () => {
    let t = retTabel(SIDE, 'Main round', 'Group I', 'team_order=A1, B1, A2, B2, A3, B3', 'team_order=EGY, GER, ITA, SRB, CPV, TUN');
    t = retTabel(t, 'Preliminary round', 'Group A', 'team_order=GER, SRB, TUN, URU', 'team_order=URU, TUN, SRB, GER');
    expect(t).not.toBe(SIDE);
    expect(byggProgram(t).grupper).toEqual(P.grupper);
  });

  it('KASTER, når en hovedrundegruppes rigtige hold kommer fra en anden gruppe', () => {
    const t = retTabel(SIDE, 'Main round', 'Group I', 'team_order=A1, B1, A2, B2, A3, B3', 'team_order=EGY, GER, ITA, SRB, CPV, CRO');
    expect(() => byggProgram(t)).toThrow('Gruppetabellen i «Main round › Group I»: team_order (EGY, GER, ITA, SRB, CPV, CRO) kommer fra gruppe A, B, C, '
      + 'men formatet siger de 3 bedste fra gruppe A og B. Ret siden/formatet, intet er skrevet.');
  });

  it('KASTER, når hovedrundens pladsholdere ikke er formatets (C3 i gruppe I, A4 som et af de bedste)', () => {
    const c = retTabel(SIDE, 'Main round', 'Group I', 'team_order=A1, B1, A2, B2, A3, B3', 'team_order=A1, B1, A2, B2, A3, C3');
    expect(() => byggProgram(c)).toThrow(/team_order \(A1, B1, A2, B2, A3, C3\) kommer fra gruppe A, B, C, men formatet siger de 3 bedste fra gruppe A og B/);
    const fire = retTabel(SIDE, 'Main round', 'Group I', 'team_order=A1, B1, A2, B2, A3, B3', 'team_order=A1, B1, A2, B2, A4, B3');
    expect(() => byggProgram(fire)).toThrow('Gruppetabellen i «Main round › Group I»: pladsholderen «A4» i team_order er ikke et af de 3 bedste hold fra en indledende gruppe.');
  });

  // VIDERE er en konstant, som siden efterprøves mod. Stod 3 hardkodet uden
  // et tjek, ville en side med result3=P give en grøn kørsel og en streg på
  // det forkerte sted.
  it('KASTER, når siden siger et andet antal videre end formatet (result3=P i gruppe A)', () => {
    const t = retTabel(SIDE, 'Preliminary round', 'Group A', '|result3=Q', '|result3=P');
    expect(() => byggProgram(t)).toThrow('Gruppetabellen i «Preliminary round › Group A»: siden siger, at de 2 øverste går videre (resultN=Q), men formatet siger 3. '
      + 'Stregen i gruppetabellen ville stå forkert — ret siden/formatet, intet er skrevet.');
    const h = retTabel(SIDE, 'Main round', 'Group III', '|result2=Q', '|result2=Q |result3=Q');
    expect(() => byggProgram(h)).toThrow(/«Main round › Group III»: siden siger, at de 3 øverste går videre \(resultN=Q\), men formatet siger 2\./);
  });

  it('formatets videre bestemmer — og et format, der siger 2, afvises af den rigtige side', () => {
    const format = { ...VM2027_FORMAT, videre: { indledende: 2, hoved: 2 } };
    expect(() => byggProgram(SIDE, { format })).toThrow(/«Preliminary round › Group A»: siden siger, at de 3 øverste går videre \(resultN=Q\), men formatet siger 2\./);
  });

  it('KASTER, når Q ikke står på de øverste pladser', () => {
    const t = retTabel(SIDE, 'Preliminary round', 'Group B', '|result1=Q', '|result1=P');
    expect(() => byggProgram(t)).toThrow('Gruppetabellen i «Preliminary round › Group B»: Q står på plads 2, 3 — ikke på de øverste pladser.');
  });

  // POINT: håndbold giver 2 for en sejr. En tabel uden winpoints er
  // Sports table-modulets standard (3) — en fodboldtabel.
  it.each([
    ['winpoints=3', '|winpoints=2', '|winpoints=3', 'siden giver 3 point for en sejr, 1 for uafgjort og 0 for et nederlag'],
    ['ingen winpoints (modulets standard 3)', '|winpoints=2', '', 'siden giver 3 point for en sejr, 1 for uafgjort og 0 for et nederlag'],
    ['drawpoints=2', '|winpoints=2', '|winpoints=2 |drawpoints=2', 'siden giver 2 point for en sejr, 2 for uafgjort og 0 for et nederlag'],
    ['losspoints=1', '|winpoints=2', '|winpoints=2 |losspoints=1', 'siden giver 2 point for en sejr, 1 for uafgjort og 1 for et nederlag'],
  ])('KASTER på point, der ikke er formatets: %s', (_, fra, til, besked) => {
    const t = retTabel(SIDE, 'Main round', 'Group IV', fra, til);
    expect(() => byggProgram(t)).toThrow(`Gruppetabellen i «Main round › Group IV»: ${besked}, men formatet siger 2, 1 og 0.`);
  });

  it('point i grupper kommer fra formatet — og den rigtige side afviser et format med 3', () => {
    expect(() => byggProgram(SIDE, { format: { ...VM2027_FORMAT, point: { sejr: 3, uafgjort: 1 } } }))
      .toThrow(/«Preliminary round › Group A»: siden giver 2 point for en sejr, 1 for uafgjort og 0 for et nederlag, men formatet siger 3, 1 og 0\./);
  });

  it('KASTER, når en indledende tabel har et hold fra en anden gruppe (mængden modsiger kampene)', () => {
    const t = retTabel(SIDE, 'Preliminary round', 'Group A', 'team_order=GER, SRB, TUN, URU', 'team_order=GER, SRB, TUN, ITA');
    expect(() => byggProgram(t)).toThrow('Gruppetabellen i «Preliminary round › Group A»: tabellen har Italien, Serbien, Tunesien, Tyskland, '
      + 'men kampene i gruppe A har Serbien, Tunesien, Tyskland, Uruguay. Siden modsiger sig selv — ret siden, intet er skrevet.');
  });

  it('KASTER på en ukendt holdkode i team_order og peger på holdfilen', () => {
    const t = retTabel(SIDE, 'Preliminary round', 'Group H', 'team_order=ISL, MKD, BHR, JPN', 'team_order=ISL, MKD, BHR, XYZ');
    expect(() => byggProgram(t)).toThrow('Gruppetabellen i «Preliminary round › Group H»: holdkoden «XYZ» i team_order findes ikke i src/data/haandboldVm2027Hold.js');
  });

  it('KASTER, når en gruppe mangler sin tabel — eller har to', () => {
    const uden = retTabel(SIDE, 'Preliminary round', 'Group H', '{{#invoke:Sports table|main', '{{#invoke:Ikke en tabel|main');
    expect(() => byggProgram(uden)).toThrow('Gruppetabellerne i fasen «Indledende runde» er A, B, C, D, E, F, G, men formatet siger A, B, C, D, E, F, G, H. Intet er skrevet.');
    const g = SIDE.indexOf('\n===Group I===\n', SIDE.indexOf('\n==Main round==\n')) + '\n===Group I===\n'.length;
    const blok = SIDE.slice(g, SIDE.indexOf('\n}}\n', g) + 4);
    expect(blok.startsWith('{{#invoke:Sports table|main')).toBe(true);
    const to = SIDE.slice(0, g) + blok + SIDE.slice(g);
    expect(() => byggProgram(to)).toThrow('Gruppetabellen i «Main round › Group I»: gruppe I har to tabeller på siden');
  });
});

describe('klassificer: det lukkede sæt af sektioner', () => {
  it.each([
    [['Preliminary round', 'Group A'], { fase: 'indledende', gruppe: 'A' }],
    [['Main round', 'Group IV'], { fase: 'hoved', gruppe: 'IV' }],
    [['Final round', 'Quarterfinals'], { fase: 'kvart' }],
    [['Final round', 'Semifinals'], { fase: 'semi' }],
    [['Final round', 'Third place game'], { fase: 'finale' }],
    [['Final round', 'Final'], { fase: 'finale' }],
    // Aliaserne: andre sider kalder slutspillet «Knockout stage» og
    // bronzekampen «Bronze medal game». Begge skal give det samme.
    [['Knockout stage', 'Quarter-finals'], { fase: 'kvart' }],
    [['Knockout stage', 'Semi-finals'], { fase: 'semi' }],
    [['Knockout stage', 'Bronze medal game'], { fase: 'finale' }],
    [['Final round', 'Bronze medal game'], { fase: 'finale' }],
    [['Knockout stage', 'Final'], { fase: 'finale' }],
    [['Presidents Cup', 'Group I'], { fra: 'presidents' }],
    [["President's Cup", '31st place game'], { fra: 'presidents' }],
    [['Final round', '5–8th place semifinals'], { fra: 'placering' }],
    [['Final round', 'Fifth place game'], { fra: 'placering' }],
    [['Final round', 'Seventh place game'], { fra: 'placering' }],
  ])('%j → %j', (sti, forventet) => {
    expect(klassificer(sti)).toEqual(forventet);
  });

  it.each([
    [['Preliminary round', 'Group I']],
    [['Main round', 'Group A']],
    [['Final round', 'Bracket']],
    [['Placement round', 'Group A']],
    [[]],
  ])('%j kaster', (sti) => {
    expect(() => klassificer(sti)).toThrow(/Ukendt sektion/);
  });
});

// KRYDSTJEK MOD EN UAFHÆNGIG KILDE. IHF's egne dagsider for VM 2027 (gemt i
// functions-platform/testdata, læst af IHF-parseren fra D2). De stod med
// 00:00 som tid, da de blev gemt, så IHF-parseren giver gmtTid null — og
// derfor kan KUN hold, dato og antal sammenlignes her. Tiderne (= deadlines)
// efterprøves af intet andet end Wikipedia selv. Testen siger det højt: får
// IHF-fixturen en dag tider, er den røde linje nedenfor beskeden om at
// sammenligne dem også.
describe('krydstjek mod IHF\'s dagsider for VM 2027', () => {
  const { parseDagside } = require('../../functions-platform/ihfParse.js');
  const dag = (d) => parseDagside(readFileSync(resolve(HER, `../../functions-platform/testdata/ihf-dag-${d}.html`), 'utf8'));

  it('dag 1 (13/1): IHF\'s fire kampe er programmets runde 1 — samme hold, samme dato', () => {
    const ihf = dag('2027-01-13');
    expect(ihf).toHaveLength(4);
    expect(ihf.map((i) => i.gmtTid)).toEqual([null, null, null, null]);
    const parret = ihf.map((i) => {
      const h = holdForIhfNavn(i.hjemme);
      const u = holdForIhfNavn(i.ude);
      expect(h, i.hjemme).toBeTruthy();
      expect(u, i.ude).toBeTruthy();
      const f = P.fixtures.find((x) => x.home === h.name && x.away === u.name);
      expect(f, `${i.hjemme}–${i.ude}`).toBeTruthy();
      expect(i.dato).toBe('2027-01-13');
      expect(f.round).toBe(1);
      expect(f.kickoff.slice(0, 10)).toBe(i.dato);
      expect(f.gruppe).toBe(i.gruppe.replace('Group ', ''));
      return f.id;
    });
    expect(parret.sort()).toEqual(P.fixtures.filter((f) => f.round === 1).map((f) => f.id).sort());
  });

  it('29/1: IHF\'s to semifinaler er kalenderens semifinaledag; placeringskampene 5-8 er IKKE med', () => {
    const ihf = dag('2027-01-29');
    const semi = ihf.filter((i) => i.fase === 'Semi-finals');
    const placering = ihf.filter((i) => i.fase === 'Placement matches 5-8');
    expect(semi).toHaveLength(2);
    expect(placering).toHaveLength(2);
    expect(semi.length + placering.length).toBe(ihf.length);
    const f = P.faser.find((x) => x.navn === 'Semifinaler');
    expect(f).toMatchObject({ start: '2027-01-29', fra: 16, til: 16, antalKampe: semi.length, knockout: true });
    // Ingen fase i kalenderen tæller placeringskampene med.
    expect(P.faser.reduce((n, x) => n + x.antalKampe, 0)).toBe(48 + 36 + 4 + 2 + 2);
  });
});

// VÆRTENS ZONE. Tyskland og Danmark er CET = UTC+1 i januar. Siden siger selv,
// hvilken zone tiderne står i — men står der UTC+2 (en tastefejl på Wikipedia),
// ville hver deadline ligge en time for tidligt. Derfor efterprøves sidens
// påstand mod værtens IANA-zone på hver kampdag.
describe('tidszonen efterprøves mod værtens zone', () => {
  it('Europe/Berlin og Europe/Copenhagen er UTC+1 på alle VM-dagene (CET, ingen sommertid)', () => {
    expect(VM2027_FORMAT.tidszone).toBe('Europe/Berlin');
    for (const dato of ['2027-01-13', '2027-01-20', '2027-01-29', '2027-01-31']) {
      expect(zoneForskydning('Europe/Berlin', dato)).toBe(60);
      expect(zoneForskydning('Europe/Copenhagen', dato)).toBe(60);
    }
    expect(zoneForskydning('Europe/Berlin', '2027-07-01')).toBe(120); // sommertid — beviser, at datoen tæller
    expect(zoneForskydning('Europe/London', '2027-01-13')).toBe(0);
    expect(zoneForskydning('America/Sao_Paulo', '2027-01-13')).toBe(-180);
  });

  it('den rigtige side (UTC+1) passerer, og første kamp er 17.30 dansk tid = 16:30Z', () => {
    expect(P.forskydningMin).toBe(60);
    expect(P.fixtures[0].kickoff).toBe('2027-01-13T16:30:00Z');
  });

  it('KASTER, når siden siger UTC+2 om en turnering i Tyskland', () => {
    expect(() => byggProgram(SIDE.replace('UTC+1', 'UTC+2')))
      .toThrow('Siden siger, at tiderne er UTC+2, men Europe/Berlin er UTC+1 den 2027-01-13.');
  });

  it('KASTER uden en zone i formatet — der gættes ikke', () => {
    const { tidszone, ...udenZone } = VM2027_FORMAT;
    expect(tidszone).toBeTruthy();
    expect(() => byggProgram(SIDE, { format: udenZone })).toThrow(/Formatet har ingen tidszone/);
  });

  it('byggProgram tjekker HVER kampdag — en kamp i sommertid sidst på siden fanges', () => {
    const i = SIDE.lastIndexOf('|date=31 January 2027');
    const t = `${SIDE.slice(0, i)}|date=31 July 2027${SIDE.slice(i + '|date=31 January 2027'.length)}`;
    expect(() => byggProgram(t)).toThrow('Europe/Berlin er UTC+2 den 2027-07-31');
  });

  it('tjekker HVER kampdag, ikke kun den første', () => {
    // Berlin skifter til sommertid 28/3 2027: en dag efter skiftet skal fanges.
    expect(() => tjekTidszone(60, ['2027-01-13', '2027-03-29'], 'Europe/Berlin'))
      .toThrow('Europe/Berlin er UTC+2 den 2027-03-29');
    expect(() => tjekTidszone(60, ['2027-01-13', '2027-01-31'], 'Europe/Berlin')).not.toThrow();
  });
});
