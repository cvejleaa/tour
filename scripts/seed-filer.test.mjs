// Ét opslag pr. spil: hvilke filer et spil seedes fra — og workflowet, der
// ikke længere må vælge dem selv.
//
// HVAD DER GIK GALT FØR. deploy-platform.yml valgte holdlisten med en
// shell-ternær (`pl2627-efteraar` → PL-listen, ALT ANDET → Superligaens), og
// kickoff-trinnet var låst til superliga2627. Et tredje spil kunne ikke seedes
// uden at redigere workflowet, og valgtes det i holdliste-trinnet, fik det
// tavst Superligaens holdliste. Testene her binder begge ender: opslaget skal
// pege på filer, der findes og passer sammen, og workflowets seed-trin må
// hverken nævne filstier eller (bortset fra seedSuperliga) spil-id'er.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { SEED_FILER, udfyldFraOpslag } from './seed-filer.mjs';
import { parseRunder, iInterval, ukendteHold, tjekDubletter } from '../src/lib/seedFootball.js';

// process.cwd() er projektroden i vitest (samme greb som games.test.mjs).
const ROD = process.cwd();
const fuld = (p) => resolve(ROD, p);

async function holdliste(sti) {
  const mod = await import(pathToFileURL(fuld(sti)).href);
  return Object.values(mod).find((v) => Array.isArray(v) && v.length && typeof v[0]?.name === 'string');
}
function kampprogram(sti) {
  const data = JSON.parse(readFileSync(fuld(sti), 'utf8'));
  const list = Array.isArray(data) ? data : data.fixtures;
  return list.filter((f) => f && f.home && f.away && f.round != null);
}

describe('SEED_FILER — opslaget', () => {
  // PINNET: præcis de filer, workflowet brugte før. Ændres en af dem, ændres
  // hvad seedSuperliga/seedTeams/seedKickoffs gør for SL og PL — og det skal
  // være et valg, ikke en bivirkning.
  it('Superligaen og PL seedes fra præcis de filer, workflowet brugte før', () => {
    expect(SEED_FILER.superliga2627).toEqual({
      teams: 'src/data/superligaTeams2026.js',
      fixtures: 'scripts/superliga-fixtures.json',
    });
    // Ingen runder på SL: det gamle seedSuperliga-trin seedede hele filen.
    expect(SEED_FILER.superliga2627).not.toHaveProperty('runder');
    expect(SEED_FILER['pl2627-efteraar']).toEqual({
      teams: 'src/data/premierLeagueTeams2026.js',
      fixtures: 'scripts/premier-league-fixtures-2627.json',
      // Efterårsspillet er runde 1-18 (drift.md, games.mjs). Uden intervallet
      // ville et fuldt seed lægge alle 38 runder ind i det.
      runder: '1-18',
    });
  });

  it('hver post peger på filer, der findes, med en læselig holdliste og et læseligt program', async () => {
    for (const [id, post] of Object.entries(SEED_FILER)) {
      expect(Object.keys(post).every((k) => ['teams', 'fixtures', 'runder'].includes(k)), id).toBe(true);
      expect(existsSync(fuld(post.teams)), `${id}: ${post.teams}`).toBe(true);
      expect(existsSync(fuld(post.fixtures)), `${id}: ${post.fixtures}`).toBe(true);
      const hold = await holdliste(post.teams);
      expect(hold?.length, `${id}: holdliste`).toBeGreaterThan(0);
      for (const t of hold) expect(Number.isFinite(t.elo), `${id}: ${t.name}.elo`).toBe(true);
      // Programmet i intervallet: ingen dubletter, og hvert holdnavn kendes af
      // holdlisten. Et ukendt navn får ellers neutral Elo uden et ord — og
      // med opslaget er det netop parret holdliste+program, der kan drive.
      const fx = iInterval(kampprogram(post.fixtures), parseRunder(post.runder));
      expect(fx.length, `${id}: kampe`).toBeGreaterThan(0);
      expect(() => tjekDubletter(fx), id).not.toThrow();
      expect(ukendteHold(fx, hold), id).toEqual([]);
    }
  });
});

describe('udfyldFraOpslag', () => {
  it('kun --game → filerne slås op', () => {
    expect(udfyldFraOpslag({ game: 'pl2627-efteraar', flags: new Set() })).toMatchObject({
      game: 'pl2627-efteraar',
      teams: 'src/data/premierLeagueTeams2026.js',
      fixtures: 'scripts/premier-league-fixtures-2627.json',
      runder: '1-18',
      kilde: 'seed-filer',
    });
    const sl = udfyldFraOpslag({ game: 'superliga2627' });
    expect(sl.kilde).toBe('seed-filer');
    expect(sl).not.toHaveProperty('runder');
  });

  it('er BLOT ÉT af --teams/--fixtures/--runder givet, bruges opslaget slet ikke', () => {
    for (const egne of [{ teams: 'a.js' }, { fixtures: 'b.json' }, { runder: '19-38' }]) {
      const ud = udfyldFraOpslag({ game: 'pl2627-efteraar', ...egne });
      expect(ud.kilde, JSON.stringify(egne)).toBe('argumenter');
      // Intet blandes ind: en egen --fixtures må ikke få opslagets --runder.
      for (const k of ['teams', 'fixtures', 'runder']) expect(ud[k], k).toBe(egne[k]);
    }
  });

  it('et spil uden post afvises med listen over kendte — intet tavst valg af et andet spils filer', () => {
    expect(() => udfyldFraOpslag({ game: 'hvm2027' }))
      .toThrow(/"hvm2027" har ingen post i scripts\/seed-filer\.mjs\. Kendte: superliga2627, pl2627-efteraar/);
    // Navne, der findes på ethvert objekt, er ikke spil.
    for (const game of ['__proto__', 'toString', 'constructor', 'hasOwnProperty']) {
      expect(() => udfyldFraOpslag({ game }), game).toThrow(/har ingen post/);
    }
  });

  it('uden --game rører den ingenting (scriptets egen "Mangler argumenter" svarer)', () => {
    expect(udfyldFraOpslag({ flags: new Set() })).toEqual({ flags: new Set(), kilde: 'argumenter' });
  });
});

// ---------------------------------------------------------------------------
// WORKFLOWET. Læses som tekst — der er ingen YAML-parser blandt repoets
// afhængigheder, og formen er fast: trin starter med "      - name:".
// ---------------------------------------------------------------------------
const YML = readFileSync(fuld('.github/workflows/deploy-platform.yml'), 'utf8');

function trin(yml) {
  const ud = [];
  let cur = null;
  for (const linje of yml.split('\n')) {
    const m = /^ {6}- name: (.*)$/.exec(linje);
    if (m) { cur = { navn: m[1], linjer: [] }; ud.push(cur); continue; }
    if (cur) cur.linjer.push(linje);
  }
  return ud.map((t) => {
    const tekst = t.linjer.join('\n');
    const kode = t.linjer.filter((l) => !l.trim().startsWith('#')).join('\n');
    const runIdx = t.linjer.findIndex((l) => /^ {8}run: \|/.test(l));
    const run = runIdx < 0 ? '' : t.linjer.slice(runIdx + 1).filter((l) => /^ {10}/.test(l)).join('\n');
    const hvis = /^ {8}if: (.*)$/m.exec(tekst)?.[1] ?? null;
    return { navn: t.navn, tekst, kode, run, hvis };
  });
}
const TRIN = trin(YML);
const seedTrin = TRIN.filter((t) => /seed-football\.mjs/.test(t.run));
const efterHvis = (input) => {
  const t = TRIN.find((x) => x.hvis === `\${{ inputs.${input} }}`);
  expect(t, `trin med if: inputs.${input}`).toBeTruthy();
  return t;
};

describe('deploy-platform.yml — seed-trinnene slår op, de vælger ikke selv', () => {
  it('finder de fire seed-football-trin (ellers tester resten ingenting)', () => {
    expect(seedTrin.map((t) => t.hvis).sort()).toEqual([
      '${{ inputs.seedKampe }}', '${{ inputs.seedKickoffs }}',
      '${{ inputs.seedSuperliga }}', '${{ inputs.seedTeams }}',
    ].sort());
  });

  it('intet seed-trin nævner en holdliste, et kampprogram eller et runde-interval', () => {
    for (const t of seedTrin) {
      expect(t.run, t.navn).not.toMatch(/--teams\b(?!-)/);
      expect(t.run, t.navn).not.toMatch(/--fixtures\b/);
      expect(t.run, t.navn).not.toMatch(/--runder\b/);
      expect(t.run, t.navn).not.toMatch(/src\/data\/|\.json\b/);
      // Shell-ternæren, der gav alle andre spil Superligaens holdliste.
      expect(t.run, t.navn).not.toMatch(/\$\(\[/);
    }
  });

  it('seedKampe, seedKickoffs og seedTeams tager spillet fra seedSpil via miljøet — aldrig et hårdkodet id', () => {
    for (const input of ['seedKampe', 'seedKickoffs', 'seedTeams']) {
      const t = efterHvis(input);
      expect(t.kode, input).toMatch(/^ {10}SPIL: \$\{\{ inputs\.seedSpil \}\}$/m);
      expect(t.run, input).toMatch(/--game "\$SPIL"/);
      // Ikke interpoleret ind i argumentstrengen (ordsplitning = smuglede flag).
      expect(t.run, input).not.toMatch(/inputs\.seedSpil/);
      for (const id of Object.keys(SEED_FILER)) expect(t.run, `${input}: ${id}`).not.toContain(id);
    }
  });

  it('seedSuperliga er uændret i adfærd: Superligaen, altid --skriv, filerne fra opslaget', () => {
    const t = efterHvis('seedSuperliga');
    expect(t.run).toMatch(/--game superliga2627\b/);
    expect(t.run).toMatch(/--skriv\b/);
    expect(t.run).not.toMatch(/--overskriv-hold/);
  });

  it('hvert trin tørkører, indtil SIT EGET skriv-flueben er sat', () => {
    for (const [input, skriv] of [['seedKampe', 'seedKampeSkriv'], ['seedKickoffs', 'seedKickoffsSkriv'], ['seedTeams', 'seedTeamsSkriv']]) {
      const t = efterHvis(input);
      expect(t.run, input).toContain(`\${{ inputs.${skriv} && '--skriv' || '' }}`);
      // Et ubetinget --skriv ved siden af ville gøre fluebenet dekorativt.
      expect(t.run.replace(`\${{ inputs.${skriv} && '--skriv' || '' }}`, ''), input).not.toMatch(/--skriv\b/);
    }
    expect(efterHvis('seedTeams').run).toMatch(/--teams-only\b/);
    expect(efterHvis('seedKickoffs').run).toMatch(/--kickoffs-only\b/);
    const kampe = efterHvis('seedKampe').run;
    expect(kampe).not.toMatch(/--(teams|kickoffs)-only|--overskriv-hold/);
  });

  it('seedSpil er en STRENG med Superligaen som default — ikke en fast liste, der skal spejle games.mjs', () => {
    const blok = /^ {6}seedSpil:\n((?: {8}.*\n)+)/m.exec(YML)?.[1] ?? '';
    expect(blok).toMatch(/^ {8}type: string$/m);
    expect(blok).toMatch(/^ {8}default: superliga2627$/m);
    expect(blok).not.toMatch(/options:/);
    // Det gamle input må ikke stå tilbage og vælge noget, intet trin læser.
    expect(YML).not.toMatch(/seedTeamsSpil/);
  });

  it('holder sig under GitHubs loft på 25 inputs', () => {
    const blok = /^ {4}inputs:\n((?: {6,}.*\n|\n)+)/m.exec(YML)?.[1] ?? '';
    const navne = [...blok.matchAll(/^ {6}([A-Za-z]+):$/gm)].map((m) => m[1]);
    expect(navne).toContain('seedSpil');
    expect(navne.length).toBeLessThanOrEqual(25);
  });

  // Labelen er det ENESTE, operatøren ser i klik-øjeblikket. Den sagde
  // "skriver ALTID teams og eloCurrent" — efter rettelsen ville den lyve.
  it('seedSuperligas label lover ikke længere, at teams og eloCurrent altid skrives', () => {
    const label = /^ {6}seedSuperliga:\n(?: {8}#.*\n)*\s{8}description: '([^']*)'/m.exec(YML)?.[1] ?? '';
    expect(label).toMatch(/holdliste og eloCurrent skrives kun, hvis spillet ikke har dem/);
    expect(label).not.toMatch(/ALTID teams og eloCurrent/);
    expect(YML).not.toMatch(/skrives ubetinget/);
  });
});
