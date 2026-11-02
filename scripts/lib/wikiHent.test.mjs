// Tests for scripts/lib/wikiHent.mjs — hvordan vi spørger Wikipedia.
// Intet netværk: fetch er falsk, uret og søvnen er styret.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  lavWikiHenter, wikiUrl, cacheNavn, USER_AGENT, WIKI_API, MIN_PAUSE_MS, parseScriptArgs, laesGemtSide,
} from './wikiHent.mjs';

const svar = (wikitekst, extra = {}) => ({
  ok: true, status: 200, headers: { get: () => null },
  json: async () => ({ parse: { title: 'Side', revid: 42, wikitext: wikitekst, ...extra } }),
});

function falsk(svarListe) {
  const kald = [];
  const fetchFn = async (url, opt) => { kald.push({ url, opt }); return svarListe.shift(); };
  return { kald, fetchFn };
}

describe('høflighed: User-Agent, adresse og pause', () => {
  it('beskrivende User-Agent med kontaktvej — og INGEN e-mail', () => {
    expect(USER_AGENT).toBe('VejleaaTip-program/1.0 (+https://github.com/cvejleaa/tour)');
    expect(USER_AGENT).not.toMatch(/@/);
  });

  it('sender User-Agenten med hvert kald', async () => {
    const { kald, fetchFn } = falsk([svar('{{handballbox}}')]);
    await lavWikiHenter({ fetchFn, sov: async () => {} })('2025 World Men\'s Handball Championship');
    expect(kald[0].opt.headers['User-Agent']).toBe(USER_AGENT);
    expect(kald[0].opt.headers['Api-User-Agent']).toBe(USER_AGENT);
  });

  // VÆRTEN SKREVET UD. At sammenligne adressen med WIKI_API binder ingenting,
  // hvis WIKI_API selv er forkert (http://, da.wikipedia.org …) — så står
  // både konstanten og adressen her som tekst.
  it('adressen er API\'et med titlen kodet — aldrig limet ind', () => {
    expect(WIKI_API).toBe('https://en.wikipedia.org/w/api.php');
    const u = new URL(wikiUrl("2025 World Men's Handball Championship&action=edit"));
    expect(`${u.origin}${u.pathname}`).toBe('https://en.wikipedia.org/w/api.php');
    expect(u.searchParams.get('action')).toBe('parse');
    expect(u.searchParams.get('page')).toBe("2025 World Men's Handball Championship&action=edit");
    expect(u.searchParams.get('prop')).toBe('wikitext|revid');
    expect(u.searchParams.get('format')).toBe('json');
    expect(u.searchParams.get('formatversion')).toBe('2');
    // Omdirigeringer følges: en omdøbt side giver den nye side, ikke en
    // «#REDIRECT»-tekst uden kampe.
    expect(u.searchParams.get('redirects')).toBe('1');
    expect(u.searchParams.getAll('action')).toEqual(['parse']);
  });

  it('venter mindst ét sekund mellem to kald — og ikke før det første', async () => {
    let nu = 10_000;
    const sovet = [];
    const sov = async (ms) => { sovet.push(ms); nu += ms; };
    const { fetchFn } = falsk([svar('a{{handballbox}}'), svar('b{{handballbox}}'), svar('c{{handballbox}}')]);
    const hent = lavWikiHenter({ fetchFn, nu: () => nu, sov });
    await hent('A');
    expect(sovet).toEqual([]);
    nu += 200;
    await hent('B');
    expect(MIN_PAUSE_MS).toBe(1000);
    expect(sovet).toEqual([800]);
    nu += 5000;
    await hent('C');
    expect(sovet).toEqual([800]);
  });
});

describe('cachen: hver side hentes én gang', () => {
  it('andet kald læser cachen og sender intet', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wikihent-'));
    const { kald, fetchFn } = falsk([svar('x{{handballbox}}')]);
    const hent = lavWikiHenter({ fetchFn, cacheDir: dir, sov: async () => {}, nu: () => Date.UTC(2026, 10, 2) });
    const a = await hent("2025 World Men's Handball Championship");
    const b = await hent("2025 World Men's Handball Championship");
    expect(kald).toHaveLength(1);
    expect(a.fraCache).toBe(false);
    expect(b).toMatchObject({ fraCache: true, wikitekst: 'x{{handballbox}}', revid: 42, hentet: '2026-11-02T00:00:00.000Z' });
    expect(existsSync(join(dir, '2025_World_Men_s_Handball_Championship.json'))).toBe(true);
  });

  // FØRSTE KØRSEL. Standardmappen (<tmp>/vejleaa-wiki) findes ikke, før
  // noget er hentet. mkdtempSync i de andre tests opretter mappen på
  // forhånd og ville skjule, at henteren ikke selv gør det.
  it('opretter cache-mappen, også flere niveauer, når den ikke findes', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'wikihent-')), 'ny', 'under');
    expect(existsSync(dir)).toBe(false);
    const { fetchFn } = falsk([svar('x{{handballbox}}')]);
    const a = await lavWikiHenter({ fetchFn, cacheDir: dir, sov: async () => {} })('S');
    expect(a.fraCache).toBe(false);
    const fil = join(dir, cacheNavn('S'));
    expect(existsSync(fil)).toBe(true);
    expect(JSON.parse(readFileSync(fil, 'utf8'))).toMatchObject({ titel: 'Side', revid: 42, wikitekst: 'x{{handballbox}}' });
  });

  it('cachenavnet kan ikke gå ud af mappen', () => {
    expect(cacheNavn('../../etc/passwd')).toBe('etc_passwd.json');
    expect(cacheNavn("2026 European Men's Handball Championship")).toBe('2026_European_Men_s_Handball_Championship.json');
  });

  it('en ødelagt cachefil kaster i stedet for at give en tom side', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wikihent-'));
    writeFileSync(join(dir, cacheNavn('S')), JSON.stringify({ titel: 'S' }));
    await expect(lavWikiHenter({ cacheDir: dir })('S')).rejects.toThrow(/har ingen wikitekst — slet filen/);
  });
});

describe('fejl er høje og danske, og intet gemmes', () => {
  it('429: siger at Wikimedia beder os vente — og prøver IKKE igen af sig selv', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wikihent-'));
    const { kald, fetchFn } = falsk([{ ok: false, status: 429, headers: { get: (h) => (h === 'retry-after' ? '23' : null) } }]);
    await expect(lavWikiHenter({ fetchFn, cacheDir: dir })('S')).rejects.toThrow('Wikipedia svarede HTTP 429 på «S». Intet er gemt. Wikimedia beder os vente (Retry-After: 23 s). Prøv igen senere.');
    expect(kald).toHaveLength(1);
    expect(existsSync(join(dir, cacheNavn('S')))).toBe(false);
  });

  // NØDVEJEN ER SCRIPTETS, ikke modulets: programmet har --fil, historikken
  // --filer. Beskeden nævner præcis den, kalderen gav — og uden en nævner den
  // INTET flag (før stod «--fil» i historikkens besked, og historikken
  // kendte ikke --fil).
  it('fejlbeskeden peger på kalderens nødvej — og kun på den', async () => {
    const f429 = () => falsk([{ ok: false, status: 429, headers: { get: () => null } }]).fetchFn;
    const f503 = () => falsk([{ ok: false, status: 503, headers: { get: () => null } }]).fetchFn;
    await expect(lavWikiHenter({ fetchFn: f429(), nodvej: '--filer <mappe>' })('S')).rejects
      .toThrow('Wikipedia svarede HTTP 429 på «S». Intet er gemt. Wikimedia beder os vente. Prøv igen senere, eller gem siden og brug --filer <mappe> (docs/drift.md).');
    await expect(lavWikiHenter({ fetchFn: f503(), nodvej: '--fil <gemt side>' })('S')).rejects
      .toThrow('Wikipedia svarede HTTP 503 på «S». Intet er gemt. Prøv igen senere, eller gem siden og brug --fil <gemt side> (docs/drift.md).');
    const uden = await lavWikiHenter({ fetchFn: f503() })('S').catch((e) => e.message);
    expect(uden).toBe('Wikipedia svarede HTTP 503 på «S». Intet er gemt. Prøv igen senere.');
    expect(uden).not.toMatch(/--/);
    const historik = await lavWikiHenter({ fetchFn: f429(), nodvej: '--filer <mappe>' })('S').catch((e) => e.message);
    expect(historik).not.toMatch(/--fil(?!er)/);
  });

  it('API-fejl (fx siden findes ikke) videregives', async () => {
    const { fetchFn } = falsk([{ ok: true, status: 200, json: async () => ({ error: { code: 'missingtitle', info: "The page you specified doesn't exist." } }) }]);
    await expect(lavWikiHenter({ fetchFn })('S')).rejects.toThrow("Wikipedia afviste «S»: missingtitle — The page you specified doesn't exist.");
  });

  it('svar uden wikitekst er en formændring, ikke en tom side', async () => {
    const { fetchFn } = falsk([{ ok: true, status: 200, json: async () => ({ parse: { title: 'S' } }) }]);
    await expect(lavWikiHenter({ fetchFn })('S')).rejects.toThrow(/ingen wikitekst — API'ets form har ændret sig/);
  });

  // Kun blanktegn er heller ingen side — det er et tomt svar i en anden form.
  it('wikitekst med kun blanktegn afvises og gemmes ikke', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wikihent-'));
    const { fetchFn } = falsk([svar('  \n\t ')]);
    await expect(lavWikiHenter({ fetchFn, cacheDir: dir })('S')).rejects.toThrow(/ingen wikitekst — API'ets form har ændret sig/);
    expect(existsSync(join(dir, cacheNavn('S')))).toBe(false);
  });

  it('tom titel afvises før noget sendes', async () => {
    const { kald, fetchFn } = falsk([]);
    await expect(lavWikiHenter({ fetchFn })('  ')).rejects.toThrow(/sidetitel mangler/);
    expect(kald).toHaveLength(0);
  });
});

// OMDIRIGERING. redirects=1 er hele grunden til, at en omdøbt side stadig
// virker — og så skal den NYE titel stå i kilden, ikke den, vi bad om.
describe('titlen kommer fra svaret', () => {
  it('en omdirigeret side giver svarets titel; uden titel i svaret den, vi bad om', async () => {
    const { fetchFn } = falsk([
      svar('a{{handballbox}}', { title: "2027 World Men's Handball Championship" }),
      svar('b{{handballbox}}', { title: undefined }),
    ]);
    const hent = lavWikiHenter({ fetchFn, sov: async () => {} });
    expect((await hent('2027 IHF World Championship')).titel).toBe("2027 World Men's Handball Championship");
    expect((await hent('Uden titel')).titel).toBe('Uden titel');
  });
});

describe('argumenter og gemte sider', () => {
  const K = { vaerdier: ['fil'], flag: ['skriv'] };

  it('hvidliste: kendte værdier og flag; alt andet kaster', () => {
    const a = parseScriptArgs(['--fil', 'x.wikitext', '--skriv'], K);
    expect(a.fil).toBe('x.wikitext');
    expect([...a.flag]).toEqual(['skriv']);
    expect(() => parseScriptArgs(['--skrive'], K)).toThrow(/ukendt argument --skrive\. Kendte: --fil, --skriv/);
    expect(() => parseScriptArgs(['--fil'], K)).toThrow(/--fil mangler en værdi/);
    // Et flag er ikke en værdi: «--fil --skriv» må ikke læse filen «--skriv».
    expect(() => parseScriptArgs(['--fil', '--skriv'], K)).toThrow('--fil mangler en værdi');
    expect(() => parseScriptArgs(['--skriv', 'ja'], K)).toThrow(/tager ingen værdi/);
    expect(() => parseScriptArgs(['fil.txt'], K)).toThrow(/starter med --/);
  });

  it('læser både cache-svar, API-svar og rå wikitekst', () => {
    expect(laesGemtSide(JSON.stringify({ titel: 'T', revid: 7, hentet: 'h', wikitekst: 'w' }), 'a.json'))
      .toEqual({ titel: 'T', revid: 7, hentet: 'h', wikitekst: 'w' });
    // API'ets eget svar, gemt fra browseren: revid følger med, hentetid ikke.
    expect(laesGemtSide(JSON.stringify({ parse: { title: 'T', pageid: 1, revid: 1378613629, wikitext: 'w' } }), 'vm2025.json'))
      .toEqual({ titel: 'T', revid: 1378613629, hentet: null, wikitekst: 'w' });
    expect(laesGemtSide(JSON.stringify({ parse: { title: 'T', revid: '9', wikitext: 'w' } }), 'a.json').revid).toBeNull();
    expect(() => laesGemtSide(JSON.stringify({ parse: { title: 'T', wikitext: '' } }), 'a.json')).toThrow(/ikke et gemt svar/);
    expect(laesGemtSide('{{handballbox|date=1 January 2025}}', 'a.wikitext').wikitekst).toMatch(/handballbox/);
    expect(() => laesGemtSide('<html>Captcha</html>', 'a.wikitext')).toThrow(/ingen \{\{handballbox\}\}/);
    expect(() => laesGemtSide('{}', 'a.json')).toThrow(/ikke et gemt svar/);
  });

  it('fixturen fra repoet kan læses som gemt side', () => {
    const t = readFileSync(join(process.cwd(), 'scripts/testdata/wiki-vm2027.wikitext'), 'utf8');
    expect(laesGemtSide(t, 'wiki-vm2027.wikitext').wikitekst.length).toBeGreaterThan(1000);
  });
});
