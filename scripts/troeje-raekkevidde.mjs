// ---------------------------------------------------------------------------
// scripts/troeje-raekkevidde.mjs — HVOR MEGET flytter `thirdColor` sig?
//
// Skrevet, fordi spørgsmålet "hvad ser ejeren dagen efter, vi retter
// holdlisten i produktion?" blev besvaret med "kun Randers' kampkort". Det er
// forkert, og forskellen er ikke til at gætte: `matchBadges` vælger den
// FJERNESTE af ude og tredje, så en tredjefarve kan slå igennem i par, der
// intet har med det hold at gøre, man kiggede på.
//
// Kørslen sammenligner hver ORDNET parring (hjemme, ude) i en holdliste med
// og uden `thirdColor` og tæller, hvor mange udetrøjer der skifter farve.
// Den siger INTET om produktionen — den måler repoets egne lister, og det er
// netop pointen: det er den øvre grænse for, hvad en komplet holdliste kan
// ændre.
//
// BRUG:  npx vite-node scripts/troeje-raekkevidde.mjs
//
// vite-node og ikke bar node: harnesset importerer den ÆGTE `matchBadges` fra
// `src/features/`, hvor importerne står uden filendelse (bundleren gætter
// dem). Alternativet — at skrive reglen af her — ville være to udgaver af
// "hvornår skiftes der til tredjetrøjen", og så måler harnesset sig selv.
// ---------------------------------------------------------------------------

import { SUPERLIGA_TEAMS_2026 } from '../src/data/superligaTeams2026.js';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../src/data/premierLeagueTeams2026.js';
import { matchBadges, klubAccentAf } from '../src/features/games/football/badges.js';

/** Samme liste uden tredjefarver — altså den tilstand, en forældet prod har. */
const udenTredje = (teams) => teams.map((t) => {
  const kopi = { ...t };
  delete kopi.thirdColor;
  return kopi;
});

function maal(navn, teams) {
  const uden = udenTredje(teams);
  let par = 0;
  let skift = 0;
  const eksempler = [];
  for (const h of teams) {
    for (const a of teams) {
      if (h.name === a.name) continue;
      par += 1;
      const foer = matchBadges(uden, h.name, a.name, {}).a.color;
      const efter = matchBadges(teams, h.name, a.name, {}).a.color;
      if (foer !== efter) {
        skift += 1;
        if (eksempler.length < 5) eksempler.push(`${h.name}–${a.name}: ${foer} → ${efter}`);
      }
    }
  }

  // Side-temaet er en ANDEN kæde end kampkortet: klubAccentAf går
  // hjemme → ude → tredje og tager den første med kulør nok. Et hold, hvis to
  // første trøjer er kulørløse, får altså sin accent fra tredjetrøjen — og
  // dermed skifter hele spilsiden farve for dem, der har holdet som yndling.
  const temaSkift = [];
  for (const t of teams) {
    const foer = klubAccentAf(uden, {}, t.name);
    const efter = klubAccentAf(teams, {}, t.name);
    if (foer !== efter) temaSkift.push(`${t.name}: ${foer ?? 'ingen'} → ${efter ?? 'ingen'}`);
  }

  console.log(`\n${navn} (${teams.length} hold)`);
  console.log(`  kampkort : ${skift} af ${par} ordnede par skifter udetrøje`);
  for (const e of eksempler) console.log(`             ${e}`);
  console.log(`  sidetema : ${temaSkift.length} hold skifter accent`);
  for (const e of temaSkift) console.log(`             ${e}`);
  return { skift, par, temaSkift: temaSkift.length };
}

console.log('Hvad ændrer `thirdColor` sig, hvis den kommer med i holdlisten?');
maal('Superligaen 2026/27', SUPERLIGA_TEAMS_2026);
maal('Premier League 2026/27', PREMIER_LEAGUE_TEAMS_2026);
console.log('\nTallene er repoets lister, ikke produktionens — de er den øvre grænse.\n');
