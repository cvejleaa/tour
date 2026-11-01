#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/sportprofil-golden.mjs — facit for "ren omskrivning" af sportsprofilen.
//
// Skriver de odds og den Elo, Superligaen og Premier League FÅR i dag, på
// rigtige kampprogrammer og rigtige holdlister, ad begge produktionsveje:
//
//   klient  buildMatches (seed-football.mjs → frosne odds på nye kampe)
//   server  recomputeSeasonElo (levende Elo + ompris af ikke-låste kampe)
//   klient  pointModForventning (Holdsidens "point mod forventning")
//
// Filen, den skriver, blev lavet af koden FØR sportProfil fandtes (commit
// 62e20aa), og testene `src/lib/sportProfil.test.js` (klient) og
// `gameScoring.test.js` (server) kræver, at koden EFTER giver præcis de samme
// tal — byte for byte, ikke "tæt på". Det er beviset for, at profilen ikke
// har flyttet noget for de to fodboldspil.
//
// Kør den IKKE for at "få testen grøn". Et facit, der genskabes af den kode,
// det skal efterprøve, bekræfter kun sig selv. Ændres Elo-modellen med vilje
// (fx DRAW_BASE), er det en ny model og et nyt facit — og så hører det
// hjemme i samme commit som modelændringen, med begrundelsen ved siden af.
//
// vite-node, ikke node: holdStatistik.js importerer uden filendelse, hvad
// Vite forstår og Node ikke gør.
//
//   npx vite-node scripts/sportprofil-golden.mjs > functions-platform/testdata/sportprofil-golden.json
//
// Efterprøv facit mod den gamle kode. Scriptet kom i samme commit som
// profilen, så det kopieres ind i en udcheckning af 62e20aa:
//   git worktree add /tmp/gammel 62e20aa
//   cp scripts/sportprofil-golden.mjs /tmp/gammel/scripts/
//   cp scripts/lib/sportprofilGolden.mjs /tmp/gammel/scripts/lib/
//   ln -s "$PWD/node_modules" /tmp/gammel/node_modules
//   (cd /tmp/gammel && npx vite-node scripts/sportprofil-golden.mjs) \
//     | diff - functions-platform/testdata/sportprofil-golden.json
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { buildMatches } from '../src/lib/superligaSeed.js';
import { pointModForventning } from '../src/features/games/football/holdStatistik.js';
import { SUPERLIGA_TEAMS_2026 } from '../src/data/superligaTeams2026.js';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../src/data/premierLeagueTeams2026.js';
import { goldenKampe, GOLDEN_NU_MS, makeEloDb } from './lib/sportprofilGolden.mjs';

const require = createRequire(import.meta.url);
const { recomputeSeasonElo } = require('../functions-platform/gameScoring.js');

const ROD = new URL('..', import.meta.url);
const laes = (sti) => {
  const d = JSON.parse(readFileSync(new URL(sti, ROD), 'utf8'));
  return Array.isArray(d) ? d : d.fixtures;
};

const LIGAER = {
  sl: { fixtures: laes('scripts/superliga-fixtures.json'), teams: SUPERLIGA_TEAMS_2026 },
  pl: { fixtures: laes('scripts/premier-league-fixtures-2627.json'), teams: PREMIER_LEAGUE_TEAMS_2026 },
};

const FieldValue = { serverTimestamp: () => 'ts' };

const ud = {};
for (const [liga, { fixtures, teams }] of Object.entries(LIGAER)) {
  // Klientvejen: de frosne odds, et fuldt seed ville skrive.
  const seedet = {};
  for (const m of buildMatches(fixtures, teams)) {
    seedet[m.id] = [m.odds['1'], m.odds.X, m.odds['2'], m.eloHome, m.eloAway];
  }

  // Servervejen: runde 1-10 spillet med et fast, konstrueret facit; resten
  // ligger i fremtiden og bliver omprist af den opdaterede Elo. Elo-tallene
  // bliver dermed IKKE hele tal, så selv en ændring på sidste decimal i
  // updateElo slår igennem i de fremtidige odds.
  const db = makeEloDb({ teams }, goldenKampe(buildMatches(fixtures, teams)));
  // dryRun:false — eloCurrent skrives kun på spil-dokumentet ved en rigtig
  // kørsel, og det er den, der viser updateElo-kæden direkte.
  const res = await recomputeSeasonElo(db, FieldValue, liga, GOLDEN_NU_MS, { dryRun: false });
  const ompris = {};
  for (const a of res.aendringer) ompris[a.id] = [a.efter['1'], a.efter.X, a.efter['2']];

  // Holdsidens "point mod forventning" — den tredje vej, Elo-modellen bruges
  // ad. Regnet på de spillede kampe og den historik, servervejen netop skrev.
  const seedElo = Object.fromEntries(teams.map((t) => [t.name, t.elo]));
  const spillede = db._matches.map((m) => m.data).filter((m) => m.result);
  const forventning = {};
  for (const t of teams) {
    const r = pointModForventning(spillede, t.name, db._game.eloHistory, seedElo);
    forventning[t.name] = [r.faktiske, r.ventede, r.forskel, r.kampe];
  }

  // Historikken gemmes med, så klienttesten kan regne forventningen på samme
  // grundlag uden at køre serverens kode. Som map runde → ratings, ikke som
  // liste: én runde pr. linje i filen.
  const eloHistory = Object.fromEntries(db._game.eloHistory.map((h) => [h.round, h.elo]));

  ud[liga] = { seedet, ompris, eloCurrent: db._game.eloCurrent, eloHistory, forventning };
}

// Én kamp pr. linje, så en fejl i en test peger på en kamp, ikke på en fil.
const linjer = ['{'];
const ligaer = Object.keys(ud);
ligaer.forEach((liga, li) => {
  linjer.push(`  ${JSON.stringify(liga)}: {`);
  const dele = Object.keys(ud[liga]);
  dele.forEach((del, di) => {
    const obj = ud[liga][del];
    const noegler = Object.keys(obj);
    linjer.push(`    ${JSON.stringify(del)}: {`);
    noegler.forEach((k, ki) => {
      linjer.push(`      ${JSON.stringify(k)}: ${JSON.stringify(obj[k])}${ki < noegler.length - 1 ? ',' : ''}`);
    });
    linjer.push(`    }${di < dele.length - 1 ? ',' : ''}`);
  });
  linjer.push(`  }${li < ligaer.length - 1 ? ',' : ''}`);
});
linjer.push('}');
process.stdout.write(`${linjer.join('\n')}\n`);
