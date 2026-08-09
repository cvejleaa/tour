// ---------------------------------------------------------------------------
// Premier League 2026/27 — hold + Elo-startværdier.
//
// Elo-startværdierne er (1) hentet fra clubelo.com pr. 21. august 2026, og
// derefter (2) KALIBRERET mod bookmakernes vinder-odds (Danske Spil + bet365,
// 7. august 2026) via scripts/calibrate-premier-league-elo.mjs. Gennemsnittet
// er 1500; kun forskellene mellem holdene bærer information.
//
// HER STOD FØR NOGET FORKERT, og det er værd at vide hvorfor. Begrundelsen
// lød, at clubelos spredning skulle bevares uændret, fordi en simulering gav
// "en favorit, der vinder ~85 %, hvilket ligger inden for Premier Leagues
// normale spænd". Det tal blev aldrig holdt op mod et marked. Da det blev det,
// sagde begge bookmakere 33 % — Arsenal står i 2,50 hos dem begge. Rå clubelo
// giver 77,7 %. Vi overdrev altså favoritten med en faktor 2,3, og
// argumentet om at "en klemt skala ville gøre ligaen fladere, end den er" var
// vendt på hovedet: den var i forvejen alt for spids.
//
// Det rammer især spil 2, hvor der tippes på top 4 og nedrykkere — netop dér,
// hvor en forkert spredning slår hårdest igennem.
//
// TO PORTE afgør, hvem markedet må flytte. Den anden er den vigtige: Danske
// Spil giver ALLE outsidere 250, mens bet365 spreder fra 251 til 3001. I
// bunden er gennemsnittet af de to derfor et tal uden indhold, og uden porten
// trak det Hull +160, Ipswich +138 og Coventry +118 op mod midterfeltet — stik
// imod grunden til, at vi overhovedet bruger clubelo. Markedet bruges derfor
// kun, hvor de to bøger er enige inden for en faktor 3. Ni hold kalibreres;
// elleve beholder clubelo.
//
// Den største rettelse er Tottenham: clubelo har dem som nr. 16 (1458), mens
// BEGGE bookmakere sætter dem i 21,00 — sjettefavorit. De står nu på 1579.
// Chelsea +97, Arsenal −80.
//
// Superligaen bruger samme fremgangsmåde, men med `pSim` som port. Det ville
// IKKE virke her: Tottenham ville starte under grænsen og aldrig komme over
// den — uændret for evigt, netop fordi de var undervurderede.
//
// GRUNDLAGET er stadig clubelo og ikke historiske PL-resultater. Coventry har
// ikke spillet i Premier League siden 2001 og Hull ikke siden 2016/17; en
// beregning fra PL-resultater ville give dem præcis 1500 — et midterhold —
// hvilket er nøjagtig den tavse fælde, `teamElo()` har.
//
// Elo selv-korrigerer i løbet af sæsonen (den levende opdatering genberegner
// ratings + odds efter hvert resultat), så en startværdi, der er lidt skæv i
// august, er rettet inden for få runder.
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
//
// FARVERNE HAR NU EN KILDE. De var før skrevet fra hukommelsen om klubbernes
// spilledragter — påstande ved siden af Elo-værdier, der havde både kilde,
// kalibrering og et script. De hentes nu fra {{Infobox football club}} på
// engelsk Wikipedia med `node scripts/holdfarver-wikipedia.mjs`, som læser
// selve mønster-grafikken fra Commons; skabelonens farvefelt er kun
// BUNDfarven og giver hvid for en stribet trøje.
//
// TO TRØJER MANGLER I KILDEN: Aston Villas udetrøje og Leeds' tredjetrøje står
// tomme i infoboksen (`pattern_b2`/`body2` henholdsvis `pattern_b3`/`body3`).
// Scriptet springer tomme værdier over, så de to felter skrives ikke af det.
//
// Villas udetrøje er sat i hånden til grålig sort. Klubbens officielle butik
// har stadig kun 2025-26-udetrøjen, fordi 2026/27 ikke er udkommet — så den
// gamle føres videre, indtil den nye lander. Det er en bedre kilde end det
// leak, feltet først blev sat efter, men det er stadig den ENESTE af de tyve,
// der ikke er hentet.
//
// Villas hjemme- og tredjetrøje er derimod bekræftet mod avfc.co.uk: bordeaux
// hjemme, lyseblå med bordeaux-kanter som tredje — begge som hentet.
//
// Leeds' tredjetrøje er sort ifølge klubbutikken, men står stadig med sit
// gamle skøn: Wikipedia har feltet tomt. Den skal sættes i admin.
// ---------------------------------------------------------------------------

export const PREMIER_LEAGUE_TEAMS_2026 = [
  { name: 'Arsenal',                   short: 'ARS', elo: 1664, color: '#EC0000', awayColor: '#062967', thirdColor: '#F8F6BB', troejer: { hjemme: { aerme: '#FFFFFF' } }, venue: 'Emirates Stadium' },
  { name: 'Manchester City',           short: 'MCI', elo: 1645, color: '#A2CFF2', awayColor: '#030303', thirdColor: '#FFFFFF', venue: 'Etihad Stadium' },
  { name: 'Aston Villa',               short: 'AVL', elo: 1563, color: '#67081B', awayColor: '#262626', thirdColor: '#C5D8EE', venue: 'Villa Park' },
  { name: 'Manchester United',         short: 'MUN', elo: 1617, color: '#FC0000', awayColor: '#0001E7', thirdColor: '#111111', venue: 'Old Trafford' },
  { name: 'Liverpool',                 short: 'LIV', elo: 1624, color: '#DA0000', awayColor: '#FCFCFC', thirdColor: '#0BB4BB', troejer: { hjemme: { aerme: '#8F1E32' } }, venue: 'Anfield' },
  { name: 'Bournemouth',               short: 'BOU', elo: 1539, color: '#000000', awayColor: '#6051BA', thirdColor: '#FFFFFF', troejer: { ude: { sekundaer: '#AAA6DF', moenster: 'boejler' } }, venue: 'Vitality Stadium' },
  { name: 'Brighton and Hove Albion',  short: 'BHA', elo: 1522, color: '#004898', awayColor: '#FFFFFF', thirdColor: '#004654', venue: 'American Express Stadium' },
  { name: 'Newcastle United',          short: 'NEW', elo: 1522, color: '#FDFDFD', awayColor: '#101F35', thirdColor: '#41B6E6', troejer: { hjemme: { sekundaer: '#0A0A0A', moenster: 'striber' } }, venue: "St. James' Park" },
  { name: 'Brentford',                 short: 'BRE', elo: 1503, color: '#FF0000', awayColor: '#000040', thirdColor: '#FFFF00', troejer: { hjemme: { sekundaer: '#FFFFFF', moenster: 'striber', aerme: '#FFFFFF' }, ude: { aerme: '#000080' }, tredje: { aerme: '#FFED29' } }, venue: 'Gtech Community Stadium' },
  { name: 'Chelsea',                   short: 'CHE', elo: 1610, color: '#1B379B', awayColor: '#000000', thirdColor: '#EAB308', venue: 'Stamford Bridge' },
  { name: 'Nottingham Forest',         short: 'NFO', elo: 1489, color: '#F30310', awayColor: '#153428', thirdColor: '#111111', troejer: { hjemme: { sekundaer: '#D70926', moenster: 'boejler', aerme: '#D70926' } }, venue: 'The City Ground' },
  { name: 'Fulham',                    short: 'FUL', elo: 1480, color: '#FAFAFA', awayColor: '#FF0000', thirdColor: '#6CACE4', troejer: { ude: { sekundaer: '#000000', moenster: 'boejler' } }, venue: 'Craven Cottage' },
  { name: 'Everton',                   short: 'EVE', elo: 1470, color: '#00019E', awayColor: '#FFFFFF', thirdColor: '#111111', troejer: { hjemme: { aerme: '#0000FF' } }, venue: 'Hill Dickinson Stadium' },
  { name: 'Crystal Palace',            short: 'CRY', elo: 1470, color: '#FEFEFE', awayColor: '#1B1B1B', thirdColor: '#FFFFFF', troejer: { ude: { aerme: '#000000' } }, venue: 'Selhurst Park' },
  { name: 'Leeds United',              short: 'LEE', elo: 1464, color: '#FFFFFF', awayColor: '#FFFB00', thirdColor: '#FFCD00', venue: 'Elland Road' },
  { name: 'Tottenham Hotspur',         short: 'TOT', elo: 1579, color: '#FDFDFD', awayColor: '#000E4B', thirdColor: '#1D428A', troejer: { ude: { aerme: '#000000' } }, venue: 'Tottenham Hotspur Stadium' },
  { name: 'Sunderland',                short: 'SUN', elo: 1403, color: '#FA0000', awayColor: '#FB9CBC', thirdColor: '#111111', troejer: { hjemme: { sekundaer: '#FBFBFB', moenster: 'striber' } }, venue: 'Stadium of Light' },
  { name: 'Coventry City',             short: 'COV', elo: 1328, color: '#2C94D2', awayColor: '#F6F4F3', thirdColor: '#FFFFFF', troejer: { hjemme: { sekundaer: '#FFFFFF', moenster: 'striber', aerme: '#62B5E5' } }, venue: 'Coventry Building Society Arena' },
  { name: 'Ipswich Town',              short: 'IPS', elo: 1307, color: '#1439A1', awayColor: '#F7EBC8', thirdColor: '#111111', venue: 'Portman Road' },
  { name: 'Hull City',                 short: 'HUL', elo: 1199, color: '#FE8F00', awayColor: '#FFFFFF', thirdColor: '#FFFFFF', troejer: { hjemme: { sekundaer: '#000000', moenster: 'striber', aerme: '#000000' } }, venue: 'MKM Stadium' },];
