// ---------------------------------------------------------------------------
// Premier League 2026/27 — hold + Elo-startværdier.
//
// Elo-startværdierne stammer fra clubelo.com pr. 21. august 2026 (hentet 5.
// august 2026), FORSKUDT så gennemsnittet er 1500. Kun gennemsnittet flyttes;
// forskellene mellem holdene er bevaret uændret.
//
// Det oplagte var at klemme spredningen ned, så den lignede Superliga-listens.
// Det ville være forkert, og begrundelsen er MÅLT, ikke udledt: en simulering
// af 4.000 sæsoner over dette kampprogram med modellens egne sandsynligheder
// giver med den bevarede spredning en favorit, der vinder ~85 % og et bundhold,
// der bliver sidst ~20 % — hvilket ligger inden for Premier Leagues normale
// spænd. Klemt til Superligaens spredning bliver det 78 % og 27 %, altså en
// mærkbart fladere liga, end den er. (En begrundelse om at clubelo skulle bruge
// "samme 400-nævner" ville IKKE holde: deres skala er kalibreret mod målforskel.
// At forskellene alligevel kan overføres, er noget vi har efterprøvet.)
//
// Det rammer især spil 2, hvor der tippes på top 4 og nedrykkere: en klemt
// skala ville underdrive præcis den forskel, de to tips handler om.
//
// Vi kalibrerer IKKE mod bookmakere som i Superligaen: `compute-superliga-elo`
// og `calibrate-superliga-elo` henter fra api.superliga.dk og fodres med danske
// vinderodds. Elo selv-korrigerer i løbet af sæsonen (den levende opdatering
// genberegner ratings + odds efter hvert resultat), så en startværdi, der er
// lidt skæv i august, er rettet inden for få runder.
//
// De tre oprykkere — Coventry City, Hull City og Ipswich Town — har med vilje
// IKKE fået 1500. Et nyt hold på 1500 ville stå som et midterhold, og
// `teamElo()` i superligaSeed.js falder netop TAVST tilbage til 1500 for et
// navn, den ikke kender. Deres clubelo-værdi er brugt som alle andres.
//
// `name` er de EKSAKTE navne fra pulselive-API'et (samme kilde som program +
// facit), så Elo-opslag og resultat-matchning altid rammer. Bemærk især
// 'Brighton and Hove Albion' — clubelo skriver 'Brighton', og et opslag på det
// navn ville give hele klubben neutral Elo uden en eneste fejlbesked.
// `premierLeagueTeams2026.test.js` sammenholder listen med kampprogrammet.
//
// `color` = hjemmebane-farve, `awayColor` = udebane-farve, `thirdColor` =
// tertiær (3.) farve — bruges automatisk hvis udeholdets udefarve er for tæt på
// hjemmeholdets hjemmefarve (trøje-clash). Selvstændige hold-badges — vi
// hotlinker IKKE officielle logoer. `venue` = hjemmestadion (pulselive).
// Alle farver er redigerbare i admin.
// ---------------------------------------------------------------------------

export const PREMIER_LEAGUE_TEAMS_2026 = [
  { name: 'Arsenal',                   short: 'ARS', elo: 1744, color: '#EF0107', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Emirates Stadium' },
  { name: 'Manchester City',           short: 'MCI', elo: 1651, color: '#6CABDD', awayColor: '#111111', thirdColor: '#FFFFFF', venue: 'Etihad Stadium' },
  { name: 'Aston Villa',               short: 'AVL', elo: 1602, color: '#670E36', awayColor: '#95BFE5', thirdColor: '#FFFFFF', venue: 'Villa Park' },
  { name: 'Manchester United',         short: 'MUN', elo: 1596, color: '#DA291C', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Old Trafford' },
  { name: 'Liverpool',                 short: 'LIV', elo: 1591, color: '#C8102E', awayColor: '#FFFFFF', thirdColor: '#00B2A9', venue: 'Anfield' },
  { name: 'Bournemouth',               short: 'BOU', elo: 1553, color: '#DA291C', awayColor: '#111111', thirdColor: '#FFFFFF', venue: 'Vitality Stadium' },
  { name: 'Brighton and Hove Albion',  short: 'BHA', elo: 1523, color: '#0057B8', awayColor: '#FFFFFF', thirdColor: '#FDB913', venue: 'American Express Stadium' },
  { name: 'Newcastle United',          short: 'NEW', elo: 1518, color: '#241F20', awayColor: '#FFFFFF', thirdColor: '#41B6E6', venue: "St. James' Park" },
  { name: 'Brentford',                 short: 'BRE', elo: 1517, color: '#E30613', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Gtech Community Stadium' },
  { name: 'Chelsea',                   short: 'CHE', elo: 1512, color: '#034694', awayColor: '#FFFFFF', thirdColor: '#EAB308', venue: 'Stamford Bridge' },
  { name: 'Nottingham Forest',         short: 'NFO', elo: 1503, color: '#DD0000', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'The City Ground' },
  { name: 'Fulham',                    short: 'FUL', elo: 1494, color: '#FFFFFF', awayColor: '#111111', thirdColor: '#6CACE4', venue: 'Craven Cottage' },
  { name: 'Everton',                   short: 'EVE', elo: 1484, color: '#003399', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Hill Dickinson Stadium' },
  { name: 'Crystal Palace',            short: 'CRY', elo: 1484, color: '#1B458F', awayColor: '#C4122E', thirdColor: '#FFFFFF', venue: 'Selhurst Park' },
  { name: 'Leeds United',              short: 'LEE', elo: 1478, color: '#FFFFFF', awayColor: '#1D428A', thirdColor: '#FFCD00', venue: 'Elland Road' },
  { name: 'Tottenham Hotspur',         short: 'TOT', elo: 1458, color: '#132257', awayColor: '#FFFFFF', thirdColor: '#1D428A', venue: 'Tottenham Hotspur Stadium' },
  { name: 'Sunderland',                short: 'SUN', elo: 1417, color: '#EB172B', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Stadium of Light' },
  { name: 'Coventry City',             short: 'COV', elo: 1342, color: '#78D0F3', awayColor: '#111111', thirdColor: '#FFFFFF', venue: 'Coventry Building Society Arena' },
  { name: 'Ipswich Town',              short: 'IPS', elo: 1321, color: '#0044A9', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Portman Road' },
  { name: 'Hull City',                 short: 'HUL', elo: 1213, color: '#F5A12D', awayColor: '#111111', thirdColor: '#FFFFFF', venue: 'MKM Stadium' },];
