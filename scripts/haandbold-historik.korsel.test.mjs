// Beviset for SELVE scriptet (haandbold-historik.mjs) med --filer — ikke kun
// for udtraekKampe: at finalesiden findes i mappen under sin filnøgle
// (TURNERINGER[].transklusioner), gives med, og at en manglende fil giver
// 'andenSide' i udskriften. Scriptet køres i en rigtig node-proces mod en
// temp-mappe med en syntetisk EM 2026-side (62 kampe, finalen transkluderet
// i samme niveau-2-sektion som bronzekampen — som på den rigtige side).
// Uden --skriv skriver scriptet intet; --filer sender intet kald.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, utimesSync, mkdirSync, copyFileSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const her = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(her, 'haandbold-historik.mjs');
vi.setConfig({ testTimeout: 30000 });

const FINALE = "2026 European Men's Handball Championship final";
const kamp = (i) => `{{handballbox\n|date=${(i % 28) + 1} January 2026\n|time=18:00\n|team1={{hb-rt|DEN}}\n|score=30–${20 + (i % 9)}\n|team2={{hb|GER}}\n|HT=15–10\n}}\n`;
const EM2026 = `{{Infobox International Handball Competition\n| matches = 62\n}}\n== Preliminary round ==\nAll times are local (UTC+1).\n`
  + Array.from({ length: 60 }, (_, i) => kamp(i)).join('')
  + `== Knockout stage ==\n=== Third place game ===\n${kamp(61)}=== Final ===\n{{#section:${FINALE}|Final}}\n\n== Rankings ==\n`;
const FINALESIDE = '==Match==\n<section begin="Final" />{{handballbox\n|date=1 February 2026\n|time=18:00\n|team1={{hb-rt|DEN}}\n|score=34–27\n|team2={{hb|GER}}\n|HT=18–16\n}}<section end="Final" />\n';

let mappe;
beforeEach(() => {
  mappe = mkdtempSync(join(tmpdir(), 'hb-historik-'));
  writeFileSync(join(mappe, 'em2026.wikitext'), EM2026);
});
afterEach(() => rmSync(mappe, { recursive: true, force: true }));

const koer = (...ekstra) => spawnSync(process.execPath, [SCRIPT, '--filer', mappe, '--turneringer', 'em2026', ...ekstra], { encoding: 'utf8', env: { ...process.env, NODE_USE_ENV_PROXY: '' } });
// --skriv går ALTID til en temp-fil uden for mappen (--ud) — aldrig til den
// committede scripts/haandbold-historik.json, heller ikke under en mutant.
let udDir;
let UD;
beforeEach(() => { udDir = mkdtempSync(join(tmpdir(), 'hb-historik-ud-')); UD = join(udDir, 'ud.json'); });
afterEach(() => rmSync(udDir, { recursive: true, force: true }));

describe('scripts/haandbold-historik.mjs --filer med en transkluderet side', () => {
  it('finalesiden i mappen (em2026-finale.wikitext) indsættes: 62 spillede, intet afvist', () => {
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    const r = koer();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('em2026: 62 spillede');
    expect(r.stdout).toContain('siden siger 62 kampe');
    expect(r.stdout).toContain(`↳ afsnittet «Final» indsat fra «${FINALE}» (em2026-finale.wikitext)`);
    expect(r.stdout).not.toContain('AFVIST');
    expect(r.stdout).toContain('I alt 62 kampe fra 1 turneringer.');
    expect(r.stdout).toContain('Tør-kørsel — intet skrevet.');
  });

  it('uden finalesiden: 61 spillede, og finalen står som AFVIST (anden side) — aldrig tavst', () => {
    const r = koer();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('em2026: 61 spillede');
    expect(r.stdout).toContain(`⚠️  AFVIST (anden side) Knockout stage › Final: kampen står ikke på siden, men transkluderes fra «${FINALE}»`);
    expect(r.stdout).not.toContain('↳ afsnittet');
    expect(r.stdout).toContain('I alt 61 kampe fra 1 turneringer · 1 AFVIST (se ovenfor).');
  });

  it('uden finalesiden siger tør-kørslen, at --skriv vil nægte (siden er erklæret)', () => {
    const r = koer();
    expect(r.stdout).toContain(`⚠️  «${FINALE}» er ERKLÆRET (TURNERINGER.transklusioner) — læg em2026-finale.wikitext/.json i --filer-mappen; ellers nægter --skriv`);
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    expect(koer().stdout).not.toContain('ERKLÆRET');
  });

  // B1 (modstanderen): «--skriv skriver uden finalen, og scriptet slutter
  // alligevel med rc 0». Nu: rc 1, beskeden, og INTET skrevet.
  it('--skriv uden finalesiden: stopper, skriver intet — medmindre --tillad-anden-side', () => {
    const r = koer('--skriv', '--ud', UD);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`em2026: «${FINALE}» (Knockout stage › Final) er ikke givet med — kampen derfra ville mangle i historikken. `
      + 'Kør med --filer og em2026-finale.wikitext i mappen');
    expect(r.stderr).toContain('--tillad-anden-side');
    expect(r.stderr).toContain('Intet er skrevet.');
    expect(r.stdout).not.toContain('✅ skrev');
    expect(existsSync(UD)).toBe(false);
    // Bevidst: med flaget skrives filen, og finalen står som afvist med sin side.
    const t = koer('--skriv', '--ud', UD, '--tillad-anden-side');
    expect(t.status).toBe(0);
    const fil = JSON.parse(readFileSync(UD, 'utf8'));
    expect(fil.kampe).toHaveLength(61);
    expect(fil.kilder[0].afviste.map((a) => [a.art, a.side])).toEqual([['andenSide', FINALE]]);
  });

  // Security, D4 (sec-d4c/poc.mjs): siden stavet om på Wikipedia
  // (`…_final`) gled forbi den erklærede side, og --skriv skrev 61 kampe med
  // rc 0. Nu: med filen i mappen indsættes finalen alligevel (normTitel) …
  it('en omstavet titel (understregning) med filen i mappen: finalen indsættes', () => {
    writeFileSync(join(mappe, 'em2026.wikitext'), EM2026.replace(`{{#section:${FINALE}|`, `{{#section:${FINALE.replace(/ /g, '_')}|`));
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    const r = koer('--skriv', '--ud', UD);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(UD, 'utf8')).kampe).toHaveLength(62);
  });

  // … og uden filen nægter --skriv, også for en side, INGEN har erklæret: ÉN
  // vagt for enhver andenSide. VENDT: her skrev scriptet med rc 0.
  it('en ikke-erklæret anden side: --skriv nægter, medmindre --tillad-anden-side', () => {
    const ANDEN = '2026 Noget helt andet';
    writeFileSync(join(mappe, 'em2026.wikitext'), EM2026.replace(`{{#section:${FINALE}|`, `{{#section:${ANDEN}|`));
    const tør = koer();
    expect(tør.status).toBe(0);
    expect(tør.stdout).toContain(`⚠️  «${ANDEN}» er IKKE erklæret (TURNERINGER.transklusioner) — erklær siden og læg filen i --filer-mappen; ellers nægter --skriv`);
    const r = koer('--skriv', '--ud', UD);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`em2026: «${ANDEN}» (Knockout stage › Final, IKKE erklæret) er ikke givet med — kampen derfra ville mangle i historikken. `
      + 'Erklær siden i TURNERINGER[].transklusioner og læg filen i --filer-mappen, eller med --tillad-anden-side');
    expect(r.stderr).toContain('Intet er skrevet.');
    expect(existsSync(UD)).toBe(false);
    const t = koer('--skriv', '--ud', UD, '--tillad-anden-side');
    expect(t.status).toBe(0);
    expect(JSON.parse(readFileSync(UD, 'utf8')).kilder[0].afviste.map((a) => [a.art, a.side])).toEqual([['andenSide', ANDEN]]);
  });

  // QC, D4: --skriv med --turneringer skrev en DELMÆNGDE over den committede
  // historik. Nu kræves --ud — og intet læses eller skrives uden.
  // Testen kan IKKE ramme den committede fil, heller ikke under en mutant, der
  // fjerner vagten: scriptet køres som en KOPI i en temp-rod (scripts/ med lib/
  // som symlink), så dens faste sti er <temp>/scripts/haandbold-historik.json.
  it('--skriv med --turneringer uden --ud: stopper, før noget læses', () => {
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    const rod = mkdtempSync(join(tmpdir(), 'hb-historik-rod-'));
    try {
      mkdirSync(join(rod, 'scripts'));
      copyFileSync(SCRIPT, join(rod, 'scripts', 'haandbold-historik.mjs'));
      symlinkSync(resolve(her, 'lib'), join(rod, 'scripts', 'lib'), 'dir');
      const fast = join(rod, 'scripts', 'haandbold-historik.json');
      const r = spawnSync(process.execPath, [join(rod, 'scripts', 'haandbold-historik.mjs'), '--filer', mappe, '--turneringer', 'em2026', '--skriv'],
        { encoding: 'utf8', env: { ...process.env, NODE_USE_ENV_PROXY: '' } });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('--skriv med --turneringer ville overskrive scripts/haandbold-historik.json med en delmængde. Giv --ud <fil>');
      expect(r.stdout).not.toContain('Gemte sider');
      expect(r.stdout).not.toContain('✅ skrev');
      expect(existsSync(fast)).toBe(false);
      // Kontrol: kopien VIRKER (ellers beviste rc 1 ovenfor intet) — med --ud skriver den.
      const ok = spawnSync(process.execPath, [join(rod, 'scripts', 'haandbold-historik.mjs'), '--filer', mappe, '--turneringer', 'em2026', '--skriv', '--ud', UD],
        { encoding: 'utf8', env: { ...process.env, NODE_USE_ENV_PROXY: '' } });
      expect(ok.stderr).toBe('');
      expect(ok.status).toBe(0);
      expect(JSON.parse(readFileSync(UD, 'utf8')).kampe).toHaveLength(62);
    } finally {
      rmSync(rod, { recursive: true, force: true });
    }
  });

  // B3 (modstanderen): kildens transkluderet.hentet skal være FINALESIDENS
  // filtid — ikke hovedsidens. To forskellige, kendte tider gør det synligt.
  it('--skriv med finalesiden: kilden og transkluderet bærer hver sin fil og tid', () => {
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    utimesSync(join(mappe, 'em2026.wikitext'), new Date('2026-11-03T07:48:12.263Z'), new Date('2026-11-03T07:48:12.263Z'));
    utimesSync(join(mappe, 'em2026-finale.wikitext'), new Date('2026-11-03T09:22:42.112Z'), new Date('2026-11-03T09:22:42.112Z'));
    const r = koer('--skriv', '--ud', UD);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const [k] = JSON.parse(readFileSync(UD, 'utf8')).kilder;
    expect(k.hentet).toBe('2026-11-03T07:48:12.263Z');
    expect(k.fil).toBe('em2026.wikitext');
    expect(k.afviste).toEqual([]);
    expect(k.transkluderet).toEqual([{
      side: FINALE, afsnit: 'Final', sektion: 'Knockout stage › Final',
      url: "https://en.wikipedia.org/wiki/2026_European_Men's_Handball_Championship_final",
      revid: null, hentet: '2026-11-03T09:22:42.112Z', vej: 'fil', fil: 'em2026-finale.wikitext',
    }]);
  });

  // B2 (modstanderen): en fil i mappen, som intet bruger, stopper scriptet —
  // før noget læses. En turnering, der ikke er valgt, springes over og nævnes.
  it.each([['em2026-final.wikitext'], ['foo.wikitext']])('en ukendt fil (%s) stopper scriptet og skriver intet', (navn) => {
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    writeFileSync(join(mappe, navn), FINALESIDE);
    const r = koer('--skriv', '--ud', UD);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`mappen har en fil, som ingen turnering eller erklæret side hedder: ${navn}.`);
    expect(r.stderr).toContain('Intet er læst.');
    expect(existsSync(UD)).toBe(false);
  });

  it('en fil for en turnering, der ikke er valgt, springes over og nævnes', () => {
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    writeFileSync(join(mappe, 'vm2019.wikitext'), 'ikke læst');
    const r = koer();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('(springes over — ikke valgt med --turneringer: vm2019.wikitext)');
    expect(r.stdout).toContain('em2026: 62 spillede');
  });

  it('to filer for finalesiden: scriptet stopper og skriver intet', () => {
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    writeFileSync(join(mappe, 'em2026-finale.txt'), FINALESIDE);
    const r = koer();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/em2026-finale har 2 filer i mappen \((em2026-finale\.wikitext, em2026-finale\.txt|em2026-finale\.txt, em2026-finale\.wikitext)\)/);
    expect(r.stderr).toContain('Intet er skrevet.');
  });
});
