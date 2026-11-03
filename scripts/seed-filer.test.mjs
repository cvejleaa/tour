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
import { SEED_FILER, udfyldFraOpslag, opslagSlaaetFra } from './seed-filer.mjs';
import { OVERSKRIV_VEJ } from '../src/lib/seedFootball.js';
import { parseRunder, iInterval, ukendteHold, tjekDubletter } from '../src/lib/seedFootball.js';
import { GAMES } from './games.mjs';

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

  // Håndbold-VM seedes KUN med den indledende runde herfra: intervallet er
  // kalenderens første fase. Senere faser oprettes på serveren, når holdene
  // kendes (planens D9) — et gen-seed herfra må ikke blive vejen til dem.
  it('Håndbold-VM: holdlisten, programmet og den indledende runde som interval', () => {
    expect(SEED_FILER.hvm2027).toEqual({
      teams: 'src/data/haandboldVm2027Hold.js',
      fixtures: 'scripts/haandbold-vm2027-program.json',
      runder: '1-7',
    });
    const forste = GAMES.find((g) => g.id === 'hvm2027').faser[0];
    expect(SEED_FILER.hvm2027.runder).toBe(`${forste.fra}-${forste.til}`);
  });

  // Intervallet må ikke TAVST tabe kampe: hver kamp i programfilen ligger i
  // det, og antallet er fasens. Og ingen kamp uden kickoff (QC: strandede-
  // alarmen melder kickoff:null med det samme, og kickoff ER deadlinen).
  it('Håndbold-VM: hele programfilen er den indledende runde — 48 kampe, alle med kickoff', () => {
    const forste = GAMES.find((g) => g.id === 'hvm2027').faser[0];
    const alle = kampprogram(SEED_FILER.hvm2027.fixtures);
    const i = iInterval(alle, parseRunder(SEED_FILER.hvm2027.runder));
    expect(i).toHaveLength(alle.length);
    expect(i).toHaveLength(forste.antalKampe);
    expect(forste.antalKampe).toBe(48);
    for (const f of i) expect(Number.isFinite(Date.parse(f.kickoff)), f.id).toBe(true);
  });

  // O11/O11b: begge frysnings-lag kunne fjernes med grøn suite. Opslaget er
  // det, et workflow-trin skriver i produktion ud fra — det må ikke kunne
  // ændres af en importør i samme proces.
  it('opslaget er frosset — både ydre objekt og hver post', () => {
    expect(Object.isFrozen(SEED_FILER)).toBe(true);
    for (const [id, post] of Object.entries(SEED_FILER)) expect(Object.isFrozen(post), id).toBe(true);
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
    expect(() => udfyldFraOpslag({ game: 'em2028' }))
      .toThrow(/"em2028" har ingen post i scripts\/seed-filer\.mjs\. Kendte: superliga2627, pl2627-efteraar, hvm2027\./);
    // Navne, der findes på ethvert objekt, er ikke spil.
    for (const game of ['__proto__', 'toString', 'constructor', 'hasOwnProperty']) {
      expect(() => udfyldFraOpslag({ game }), game).toThrow(/har ingen post/);
    }
  });

  it('uden --game rører den ingenting (scriptets egen "Mangler argumenter" svarer)', () => {
    expect(udfyldFraOpslag({ flags: new Set() })).toEqual({ flags: new Set(), kilde: 'argumenter' });
  });
});

// «Mangler argumenter» stod lige over hjælpetekstens «er --game nok» — uden at
// sige, at det var den egne --fixtures, der slog opslaget fra.
describe('opslagSlaaetFra', () => {
  const som = (a) => opslagSlaaetFra(udfyldFraOpslag(a));
  it('nævner præcis de egne filer, der slog opslaget fra', () => {
    expect(som({ game: 'superliga2627', fixtures: 'b.json' })).toBe(
      'Opslaget i scripts/seed-filer.mjs for superliga2627 blev IKKE brugt, fordi --fixtures er givet '
      + 'på kommandolinjen — så skal den bære alle filerne selv. Udelad dem for at bruge opslaget.',
    );
    expect(som({ game: 'pl2627-efteraar', teams: 'a.js', runder: '19-38' }))
      .toMatch(/for pl2627-efteraar blev IKKE brugt, fordi --teams og --runder er givet/);
  });

  it('er tavs, når opslaget ikke er grunden', () => {
    expect(som({ game: 'superliga2627' })).toBeNull();          // opslaget blev brugt
    expect(som({ flags: new Set() })).toBeNull();                // intet spil
    expect(som({ game: 'egen-test', teams: 'a.js' })).toBeNull(); // spil uden post
    expect(opslagSlaaetFra(undefined)).toBeNull();
    // Kaldt direkte uden egne filer: ingen halv sætning («fordi  er givet»).
    expect(opslagSlaaetFra({ game: 'superliga2627', kilde: 'argumenter' })).toBeNull();
  });
});

// Fejlbeskederne (teamsVagt, fuldtSeed) sender operatøren til drift.md for
// --overskriv-hold. Står vejen ikke dér, er henvisningen en blindgyde.
describe('docs/drift.md bærer den vej, fejlbeskederne peger på', () => {
  const DRIFT = readFileSync(fuld('docs/drift.md'), 'utf8');
  it('afsnittet findes og siger, at --overskriv-hold køres lokalt med produktionsnøglen', () => {
    const navn = /«([^»]+)»/.exec(OVERSKRIV_VEJ)?.[1];
    expect(navn).toBe('Seed et nyt fodbold-spil');
    const afsnit = new RegExp(`^## ${navn}\\n([\\s\\S]*?)^## `, 'm').exec(DRIFT)?.[1] ?? '';
    expect(afsnit).toMatch(/`--overskriv-hold` \*\*lokalt\*\*, med produktionsnøglen i\n`GOOGLE_APPLICATION_CREDENTIALS`/);
    expect(afsnit).toMatch(/intet\nworkflow-input til det/);
  });

  // QC-fund: D6 blev begrundet med, at nye kampe prises af den levende Elo.
  // Seedet priser af start-Elo i teams[].elo — og drift.md skal sige det, for
  // det er nødvejen «seed næste fase i hånden», operatøren står i.
  it('seed-afsnittet siger, at nye kampe prises af start-Elo, og hvordan de får levende odds', () => {
    const afsnit = /^## Seed et nyt fodbold-spil\n([\s\S]*?)^## /m.exec(DRIFT)?.[1] ?? '';
    expect(afsnit).toContain(
      '**Nye kampe prises af start-Elo, ikke af den levende Elo.** Seedet bruger\n'
      + '`teams[].elo` (startværdierne), aldrig `eloCurrent`.',
    );
    expect(afsnit).toMatch(/De får levende odds ved næste facit — eller tryk \*\*💰 Ompris\*\*\n\(Admin → 🗓️ Spil-tidsplan\) og skriv ændringerne\./);
    expect(DRIFT).not.toMatch(/prises af (den levende Elo|eloCurrent)/);
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

  // Y1-Y3/Y3b: `default: true` på et skriv-flueben (eller et seed-trin)
  // overlevede med hele suiten grøn — testen herunder læser kun `run:`. Men
  // defaulten ER vagten: det er den, operatøren får uden at tage stilling, og
  // den eneste ting mellem første klik og skrevne tip-deadlines og odds.
  it('alle skriv-flueben og seed-trin er boolean med default false', () => {
    const blok = /^ {4}inputs:\n((?: {6,}.*\n|\n)+)/m.exec(YML)?.[1] ?? '';
    const inputs = new Map(
      [...blok.matchAll(/^ {6}([A-Za-z]+):\n((?: {8}.*\n)+)/gm)].map((m) => [m[1], m[2]]),
    );
    const skriv = [...inputs.keys()].filter((n) => /Skriv$/.test(n)).sort();
    // Listen er FAST: et nyt skriv-flueben skal med her, ikke slippe udenom.
    expect(skriv).toEqual(['seedGamesSkriv', 'seedKampeSkriv', 'seedKickoffsSkriv', 'seedTeamsSkriv']);
    for (const navn of [...skriv, 'seedKampe', 'seedKickoffs', 'seedTeams', 'seedSuperliga', 'seedGames']) {
      const felter = (inputs.get(navn) ?? '').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
      expect(felter, navn).toMatch(/^ {8}type: boolean$/m);
      expect(felter, navn).toMatch(/^ {8}default: false$/m);
      expect(felter, navn).not.toMatch(/^ {8}default: (?!false$)/m);
    }
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
    // seedGames: samme mønster, og trinnet kører kun seed-games.mjs.
    const games = efterHvis('seedGames');
    expect(games.run).toContain("${{ inputs.seedGamesSkriv && '--skriv' || '' }}");
    expect(games.run.replace("${{ inputs.seedGamesSkriv && '--skriv' || '' }}", '')).not.toMatch(/--skriv\b/);
    expect(games.run).toMatch(/^ {10}node scripts\/seed-games\.mjs \\$/m);
    expect(games.kode).toMatch(/^ {10}GOOGLE_APPLICATION_CREDENTIALS: \$\{\{ runner\.temp \}\}\/sa\.json$/m);
    const kampe = efterHvis('seedKampe').run;
    expect(kampe).not.toMatch(/--(teams|kickoffs)-only|--overskriv-hold/);
    // Y9b: --overskriv-hold har med vilje intet workflow-input — heller ikke
    // på et af de andre trin (drift.md: det køres lokalt).
    for (const t of seedTrin) expect(t.run, t.navn).not.toMatch(/--overskriv-hold/);
  });

  // Rækkefølgen bærer en regel: kampene prises af spillets sport, som står på
  // spil-dokumentet, så seedGames skal køre FØR seedKampe i samme kørsel.
  it('seedGames-trinnet står før seedKampe-trinnet', () => {
    const navne = TRIN.map((t) => t.hvis);
    expect(navne.indexOf('${{ inputs.seedGames }}')).toBeGreaterThan(-1);
    expect(navne.indexOf('${{ inputs.seedGames }}')).toBeLessThan(navne.indexOf('${{ inputs.seedKampe }}'));
  });

  it('seedSpil er en STRENG med Superligaen som default — ikke en fast liste, der skal spejle games.mjs', () => {
    const blok = /^ {6}seedSpil:\n((?: {8}.*\n)+)/m.exec(YML)?.[1] ?? '';
    expect(blok).toMatch(/^ {8}type: string$/m);
    expect(blok).toMatch(/^ {8}default: superliga2627$/m);
    expect(blok).not.toMatch(/options:/);
    // Det gamle input må ikke stå tilbage og vælge noget, intet trin læser.
    expect(YML).not.toMatch(/seedTeamsSpil/);
  });

  // M35: et trin uden nøglen fejler først inde i Firebase-SDK'et. Højlydt,
  // men i trinnet, der skulle skrive — ikke i et tjek.
  it('hvert seed-football-trin får service-account-nøglen', () => {
    for (const t of seedTrin) {
      expect(t.kode, t.navn).toMatch(/^ {10}GOOGLE_APPLICATION_CREDENTIALS: \$\{\{ runner\.temp \}\}\/sa\.json$/m);
    }
  });

  // seedSpil er ÉT felt for tre trin. Kørt sammen rammer de samme spil —
  // det skal stå i labelen, for den er det eneste, operatøren ser.
  it('seedSpils label siger, at feltet gælder alle tre trin i samme kørsel', () => {
    const label = /^ {6}seedSpil:\n(?: {8}#.*\n)*\s{8}description: '([^']*)'/m.exec(YML)?.[1] ?? '';
    expect(label).toMatch(/Gælder ALLE tre trin i samme kørsel — skal de ramme hver sit spil, så kør dem i hver sin kørsel\./);
  });

  // --teams-only AFVISER en ændret kortkode (teamsVagt). Labels, der lover at
  // seedTeams retter kortkoder, sender operatøren ind i en afvisning.
  it('ingen label lover, at seedTeams retter kortkoder', () => {
    const labels = [...YML.matchAll(/^ {8}description: '([^']*)'/gm)].map((m) => m[1]);
    for (const l of labels) expect(l).not.toMatch(/kortkoder/);
    const teams = /^ {6}seedTeams:\n(?: {8}#.*\n)*\s{8}description: '([^']*)'/m.exec(YML)?.[1] ?? '';
    expect(teams).toMatch(/\(trøjefarver, stadion\)/);
    expect(teams).toMatch(/afviser ændret elo, kortkode eller antal hold/);
  });

  // Y19/Y21: labelen er det ENESTE, operatøren ser i klik-øjeblikket, og de to
  // labels kunne skrives om til noget forkert med grøn suite.
  it('seedKampes og seedKickoffs labels siger, hvad trinnet rører — og hvad det lader være', () => {
    const label = (navn) => new RegExp(`^ {6}${navn}:\\n(?: {8}#.*\\n)*\\s{8}description: '([^']*)'`, 'm').exec(YML)?.[1] ?? '';
    expect(label('seedKampe')).toBe(
      'Seed kampprogrammet for spillet i seedSpil (kampe, der allerede har odds, springes over). '
      + 'Holdliste og eloCurrent skrives kun, hvis spillet ikke har dem.',
    );
    expect(label('seedKickoffs')).toBe(
      'Ret KUN kickoff-tider fra kampprogram-filen for spillet i seedSpil (rører hverken odds, Elo eller resultater)?',
    );
    // Før var kickoff-trinnet låst til Superligaen; labelen må ikke sige det.
    for (const n of ['seedKampe', 'seedKickoffs']) expect(label(n), n).not.toMatch(/[Ss]uperliga/);
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
