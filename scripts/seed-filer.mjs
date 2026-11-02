// ---------------------------------------------------------------------------
// scripts/seed-filer.mjs — HVILKE FILER, ET SPIL SEEDES FRA. Ét opslag pr. spil.
//
// HVORFOR DEN FINDES. deploy-platform.yml havde filvalget skrevet ind i selve
// trinnene: holdlisten blev valgt med en shell-ternær (`pl2627-efteraar` →
// PL-listen, alt andet → Superligaens), og kickoff-trinnet var låst til
// `superliga2627`. Et tredje spil kunne derfor ikke seedes uden at redigere
// workflowet — og valgtes det alligevel i holdliste-trinnet, fik det TAVST
// Superligaens holdliste (drift.md beskrev netop den fælde). Nu slår
// seed-football.mjs selv op her, når den kun får `--game`, og workflowet
// nævner hverken spil-id'er eller filstier i sine seed-trin.
//
// IKKE PÅ GAMES-POSTERNE. seed-games.mjs skriver HVERT felt i en GAMES-post
// ud på spil-dokumentet (scripts/seed-payload.mjs), og merge fjerner aldrig et
// felt igen. En filsti i produktionsdata ville være støj for altid. Derfor bor
// opslaget her, ved siden af — og games.test.mjs kræver, at hvert aktivt
// fodboldspil i GAMES har en post, og at hver post her er et fodboldspil.
//
// Stierne opløses mod repoets rod af seed-football.mjs (`sti`), ikke mod den
// mappe, man står i.
//
//   teams     JS-modul, der eksporterer holdlisten
//   fixtures  kampprogrammet (JSON: liste eller { fixtures: [...] })
//   runder    valgfrit interval ("1-18"). Premier League er skåret i to spil
//             på rundenummer; uden intervallet ville efterårsspillet få alle
//             38 runder — og kickoff-rettelsen ville melde runde 19-38 som
//             "IKKE SEEDET" ved hver kørsel.
// ---------------------------------------------------------------------------

export const SEED_FILER = Object.freeze({
  superliga2627: Object.freeze({
    teams: 'src/data/superligaTeams2026.js',
    fixtures: 'scripts/superliga-fixtures.json',
  }),
  'pl2627-efteraar': Object.freeze({
    teams: 'src/data/premierLeagueTeams2026.js',
    fixtures: 'scripts/premier-league-fixtures-2627.json',
    runder: '1-18',
  }),
});

// De argumenter, opslaget kan levere. Er BLOT ÉT af dem givet på
// kommandolinjen, bruges opslaget slet ikke: en egen `--fixtures` kombineret
// med opslagets `--runder` ville være en tredje kørsel, ingen af de to kilder
// beskriver.
const FRA_OPSLAG = ['teams', 'fixtures', 'runder'];

/**
 * Udfyld --teams/--fixtures/--runder fra SEED_FILER, når ingen af dem er givet.
 *
 * @param {{game?:string, teams?:string, fixtures?:string, runder?:string}} args
 * @param {Record<string, {teams:string, fixtures:string, runder?:string}>} [opslag]
 * @returns {object} args med filerne udfyldt, plus `kilde`:
 *   'argumenter' (kommandolinjen bestemmer) | 'seed-filer' (opslaget)
 * @throws hvis kun `--game` er givet, og spillet ikke har en post. Et ukendt
 *   spil-id skal være en fejl med listen over kendte — ikke et tavst valg af
 *   et andet spils filer, som den gamle ternær i workflowet gav.
 */
export function udfyldFraOpslag(args, opslag = SEED_FILER) {
  if (FRA_OPSLAG.some((k) => args?.[k] != null)) return { ...args, kilde: 'argumenter' };
  if (!args?.game) return { ...args, kilde: 'argumenter' };
  // Object.hasOwn, ikke `in`/opslag: '__proto__' og 'toString' findes på
  // ethvert objekt og må ikke tælle som et spil.
  if (!Object.hasOwn(opslag, args.game)) {
    throw new Error(
      `spillet "${args.game}" har ingen post i scripts/seed-filer.mjs. `
      + `Kendte: ${Object.keys(opslag).join(', ')}. `
      + 'Tilføj spillets holdliste og kampprogram dér — eller giv --teams og --fixtures selv.',
    );
  }
  const post = opslag[args.game];
  const ud = { ...args, teams: post.teams, fixtures: post.fixtures, kilde: 'seed-filer' };
  if (post.runder != null) ud.runder = post.runder;
  return ud;
}

/**
 * Hvorfor opslaget IKKE blev brugt — til scriptets «Mangler argumenter».
 *
 * Giver man `--game superliga2627 --fixtures …` uden `--teams`, slår den
 * egne fil opslaget fra (se FRA_OPSLAG), og scriptet mangler så `--teams`.
 * Hjælpeteksten lige under siger «er --game nok» — uden denne linje ser de to
 * beskeder ud til at modsige hinanden.
 *
 * @returns {string|null} en færdig dansk sætning, eller null når opslaget
 *   ikke er grunden (intet spil, et spil uden post, eller opslaget blev brugt)
 */
export function opslagSlaaetFra(args, opslag = SEED_FILER) {
  if (args?.kilde !== 'argumenter' || !args?.game || !Object.hasOwn(opslag, args.game)) return null;
  const egne = FRA_OPSLAG.filter((k) => args[k] != null);
  if (!egne.length) return null;
  return `Opslaget i scripts/seed-filer.mjs for ${args.game} blev IKKE brugt, fordi `
    + `${egne.map((k) => `--${k}`).join(' og ')} er givet på kommandolinjen — så skal den bære `
    + 'alle filerne selv. Udelad dem for at bruge opslaget.';
}
