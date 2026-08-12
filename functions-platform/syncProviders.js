// ---------------------------------------------------------------------------
// functions-platform/syncProviders.js — kilde-SNITTET for resultat-synken.
//
// Kernerne i superligaSync.js (vagter, batching, heartbeat, rækkefølge) er
// liga-agnostiske; alt det, der er bundet til ÉN kilde — URL'er, parsing,
// status-oversættelse og hvordan en API-kamp genfinder sit kamp-dokument —
// bor her, som én provider pr. kilde. En tredje liga er en ny post i
// PROVIDERS + SYNCED_GAMES; kernerne røres ikke.
//
// KONTRAKTEN, en provider skal opfylde:
//   hentFaerdige(sync, fetchFn) → [{ sourceKey, homeGoals, awayGoals }]
//       Kun kampe med ENDELIGT facit og brugbare mål.
//   hentLive(sync, fetchFn)     → { events, stadigIGang }
//       events: [{ sourceKey, home, away, status, statusRaw }] — kampe i gang
//       med brugbar stilling; status fra det LUKKEDE sæt i footballRounds.js.
//       stadigIGang: Set af sourceKeys, kilden stadig kalder i gang — bygget
//       på den UFILTREREDE liste, så en kamp med ubrugelig score ikke læses
//       som slutfløjt. SKAL kaste på et svar uden liste (fravær er et
//       skrive-signal i kernen — se syncLiveCore).
//   hentStandings(sync, fetchFn) → rækker i FootballTable-formen
//       ({rank, teamName, teamShortName, points, played, won, draw, lost,
//         gf, ga, rankType}).
//   resolveDocs(sourceKeys, docIds) → Map<sourceKey, docId>
//       Hvordan en API-kamp genfinder sit dokument. Ukendte nøgler udelades —
//       kernen springer dem over, som den altid har gjort.
//
// `sync` er spillets synk-konfiguration. Den STÅR OGSÅ på game-dokumentet
// (seedet fra scripts/games.mjs — klienten bruger provider-navnet til
// kildelinjen), men serveren læser den HERFRA: en statisk liste koster nul
// opslag pr. minut og kan ikke miste et spil, fordi et felt mangler i
// produktionen. Paritetstesten mod scripts/games.mjs holder de to i trit.
// ---------------------------------------------------------------------------

// --- Superligaen (api.superliga.dk) ----------------------------------------

const SEASON_ID = 35802; // 3F Superliga 2026/2027 (fra tournament_by_season)
const TOURNAMENT_ID = 46; // 3F Superliga (template)
const STAGE_ID = 935487; // grundspillet 2026/27 (fra tournament_by_season.stages)
const API_BASE = 'https://api.superliga.dk';
// Offentligt app-token (ligger i superliga.dk's offentlige app — ikke en secret).
const ACCESS_TOKEN = '5b6ab6f5eb84c60031bbbd24';
const APP_NAME = 'dk.releaze.livecenter.spdk';

// Et hængende kald holder funktionen kørende, til dens egen timeout løber ud.
//
// Funktion og ikke en konstant: AbortSignal.timeout() starter uret med det
// samme, så et delt signal ville udløbe 10 sekunder efter modulet blev
// indlæst og derefter afbryde hvert eneste kald.
const hentOpt = () => ({ signal: AbortSignal.timeout(10000) });

/** Dokument-id: r{runde}-{slug(hjemme)}-{slug(ude)} (spejler superligaSeed.matchId). */
function matchDocId(round, home, away) {
  const slug = (s) => String(s ?? '')
    .toLowerCase()
    .replace(/ø/g, 'o').replace(/å/g, 'a').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return `r${round}-${slug(home)}-${slug(away)}`;
}

// API'ets statusFull er engelsk fritekst. Oversæt til et LUKKET sæt server-side,
// så der aldrig kan slippe engelsk ud på skærmen — og så en værdi, vi ikke har
// set før, ikke vælter noget.
//
// 'afbrudt' er den vigtige: en afbrudt kamp har stadig statusType 'inprogress',
// og at kalde den "DIREKTE" ville være en løgn.
const LIVE_STATUS = {
  '1st half': 'foerste',
  'halftime': 'pause',
  'half time': 'pause',
  'ht': 'pause',
  '2nd half': 'anden',
  'extra time': 'forlaenget',
  '1st extra': 'forlaenget',
  '2nd extra': 'forlaenget',
  'awaiting extra time': 'forlaenget',
  'penalties': 'straffe',
  'penalty shootout': 'straffe',
  'interrupted': 'afbrudt',
  'abandoned': 'afbrudt',
  'postponed': 'afbrudt',
};

/** statusFull → vores lukkede sæt. Ukendt bliver 'ukendt' og logges. */
function liveStatus(raw) {
  const n = String(raw ?? '').trim().toLowerCase();
  // hasOwnProperty og ikke et almindeligt opslag: `LIVE_STATUS['constructor']`
  // rammer Object.prototype og giver en FUNKTION tilbage. Den kan Admin SDK
  // ikke serialisere, så hele synken ville kaste hvert minut — tavst, fordi
  // runScheduledSync fanger fejlen — og hverken live eller slut blev skrevet
  // for nogen kamp. '__proto__' giver tilsvarende et objekt, som skrive-vagten
  // aldrig kan sammenligne sig ud af, så hver kørsel ville skrive igen.
  const kendt = Object.prototype.hasOwnProperty.call(LIVE_STATUS, n) ? LIVE_STATUS[n] : null;
  if (!kendt && n) console.warn(`superliga: ukendt live-status "${raw}" — vises som blot "direkte".`);
  return kendt || 'ukendt';
}

/** URL til færdigspillede kampe i en sæson. */
function resultsUrl(seasonId = SEASON_ID) {
  return `${API_BASE}/events-v2?appName=${APP_NAME}&access_token=${ACCESS_TOKEN}`
    + `&env=production&locale=da&seasonId=${seasonId}&status=finished`;
}

/** URL til kampe, der er I GANG lige nu. */
function liveUrl(seasonId = SEASON_ID) {
  return `${API_BASE}/events-v2?appName=${APP_NAME}&access_token=${ACCESS_TOKEN}`
    + `&env=production&locale=da&seasonId=${seasonId}&status=inprogress`;
}

/** URL til den OFFICIELLE stilling (grundspil-stage), med form (last5). */
function standingsUrl(seasonId = SEASON_ID, stageId = STAGE_ID) {
  return `${API_BASE}/tournaments/${TOURNAMENT_ID}/standings?appName=superligadk&access_token=${ACCESS_TOKEN}`
    + `&env=production&locale=da&addResults=true&resultsLimit=6&form=last5&seasonId=${seasonId}&stageId=${stageId}`;
}

const superliga = {
  async hentFaerdige(sync, fetchFn) {
    const res = await fetchFn(resultsUrl(sync.seasonId), hentOpt());
    if (!res.ok) throw new Error(`superliga API HTTP ${res.status}`);
    const data = await res.json();
    // `|| []` med vilje: et manglende felt betyder her bare "intet facit
    // fundet", og det er harmløst — modsat hentLive, hvor fravær er et
    // skrive-signal og derfor SKAL kaste.
    return (data.events || [])
      .filter((e) => e.statusType === 'finished'
        && e.score && Number.isFinite(e.score.home) && Number.isFinite(e.score.away))
      .map((e) => ({
        sourceKey: matchDocId(e.round, e.homeName, e.awayName),
        homeGoals: e.score.home,
        awayGoals: e.score.away,
      }));
  },

  async hentLive(sync, fetchFn) {
    const res = await fetchFn(liveUrl(sync.seasonId), hentOpt());
    if (!res.ok) throw new Error(`superliga live HTTP ${res.status}`);
    const data = await res.json();
    // Fravær af data er et SKRIVE-signal i kernen (det markerer kampe slut),
    // og derfor skal en tom liste kunne skelnes fra et svar, vi ikke forstod.
    // Et HTTP 200 med `{}` — afkortet krop, ændret format, fejl pakket som
    // succes — ville ellers betyde "ingen kampe i gang" og markere hver
    // spillende kamp som slut. Ved at kaste følger vi samme fail-silent-vej
    // som en HTTP-fejl: intet skrives, og næste minut prøver igen.
    if (!data || !Array.isArray(data.events)) throw new Error('superliga live: svar uden events-liste');
    const iGang = data.events.filter((e) => e.statusType === 'inprogress');
    return {
      events: iGang
        .filter((e) => e.score && Number.isFinite(e.score.home) && Number.isFinite(e.score.away))
        .map((e) => ({
          sourceKey: matchDocId(e.round, e.homeName, e.awayName),
          home: e.score.home,
          away: e.score.away,
          status: liveStatus(e.statusFull),
          // Kun til fejlsøgning i loggen — må ALDRIG renderes. Klippet:
          // feltet kommer fra en fremmed kilde og udleveres til alle klienter.
          statusRaw: String(e.statusFull ?? '').slice(0, 40),
        })),
      // Bygget på den UFILTREREDE liste: brugte vi events ovenfor, ville vores
      // eget score-filter blive brugt som bevis på, at kampen er slut, og en
      // kamp i gang med en ubrugelig score fik markeret sin stilling "slut"
      // midt i det hele.
      stadigIGang: new Set(iGang.map((e) => matchDocId(e.round, e.homeName, e.awayName))),
    };
  },

  async hentStandings(sync, fetchFn) {
    const res = await fetchFn(standingsUrl(sync.seasonId, sync.stageId), hentOpt());
    if (!res.ok) throw new Error(`superliga standings HTTP ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .map((r) => ({
        rank: Number(r.rank) || 0,
        teamName: r.teamName,
        teamShortName: r.teamShortName || null,
        points: Number(r.points) || 0,
        played: Number(r.matchesPlayed) || 0,
        won: Number(r.matchesWon) || 0,
        draw: Number(r.matchesDraw) || 0,
        lost: Number(r.matchesLost) || 0,
        gf: Number(r.goalsScored) || 0,
        ga: Number(r.goalsConceded) || 0,
        rankType: r.rankType || null,
      }))
      .filter((r) => r.teamName)
      .sort((a, b) => a.rank - b.rank);
  },

  // Superligaens sourceKey ER dokument-id'et (begge genskabes fra runde +
  // holdnavne, og program og facit kommer fra SAMME API, så navnene er
  // identiske). Ukendte nøgler udelades, så kernen kan springe dem over.
  resolveDocs(sourceKeys, docIds) {
    const kendte = new Set(docIds);
    const map = new Map();
    for (const k of sourceKeys) if (kendte.has(k)) map.set(k, k);
    return map;
  },
};

// --- Registret --------------------------------------------------------------

// pulselive (Premier League) tilføjes som næste delopgave — kontrakten oven-
// for er skåret efter begge kilder (sourceKey er pulselives matchId, som
// allerede står som suffiks i dokument-id'erne r{runde}-{matchId}).
const PROVIDERS = { superliga };

// Spillene, den skemalagte synk kører for. STATISK af tre grunde: nul
// Firestore-opslag pr. minut, et produktionsdokument uden sync-felt kan ikke
// tabe et spil ud af synken, og listen kan paritetstestes mod
// scripts/games.mjs (spejlfils-reglen). Et nyt spil = ny post her + i
// games.mjs + functions-deploy — og et spil, der udgår, fjernes her uden at
// røre dokumentet.
const SYNCED_GAMES = [
  {
    gameId: 'superliga2627',
    provider: 'superliga',
    sync: { seasonId: SEASON_ID, tournamentId: TOURNAMENT_ID, stageId: STAGE_ID },
  },
];

module.exports = {
  PROVIDERS, SYNCED_GAMES,
  SEASON_ID, TOURNAMENT_ID, STAGE_ID,
  matchDocId, liveStatus, LIVE_STATUS, resultsUrl, liveUrl, standingsUrl, hentOpt,
};
