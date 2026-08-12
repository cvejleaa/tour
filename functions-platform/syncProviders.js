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
//       skrive-signal i kernen — se syncLiveCore). En kilde, der (endnu) ikke
//       kan levere live, returnerer { events: [], stadigIGang: null } — null
//       er "jeg ved det ikke", og kernen markerer så ALDRIG slut på det
//       signal. En tom Set ville betyde det modsatte: "alle kampe er væk fra
//       listen", og så fik hver spillende kamp et falsk "Slut".
//   hentStandings(sync, fetchFn) → rækker i FootballTable-formen
//       ({rank, teamName, teamShortName, points, played, won, draw, lost,
//         gf, ga, rankType}).
//   resolveDocs(sourceKeys, docIds) → Map<sourceKey, docId>
//       Hvordan en API-kamp genfinder sit dokument. Ukendte nøgler udelades —
//       kernen springer dem over, som den altid har gjort. BEMÆRK: docIds kan
//       være en engangs-iterator (kernen sender current.keys()) — læs den ÉN
//       gang ind i et Set, aldrig to gennemløb.
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
function standingsUrl(seasonId = SEASON_ID, stageId = STAGE_ID, tournamentId = TOURNAMENT_ID) {
  // tournamentId SKAL komme fra sync-posten, når den kaldes af provideren —
  // ellers er feltet i SYNCED_GAMES dekorativt, og en rettelse dér ændrer
  // ingenting (QC-fund på den første udgave).
  return `${API_BASE}/tournaments/${tournamentId}/standings?appName=superligadk&access_token=${ACCESS_TOKEN}`
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
    const res = await fetchFn(standingsUrl(sync.seasonId, sync.stageId, sync.tournamentId), hentOpt());
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

// --- Premier League (pulselive) ---------------------------------------------
//
// To API'er, samme udbyder — shapes dokumenteret i testdata/pulselive-*.json
// (hentet med scripts/probe-pulselive.mjs):
//   Kampe/facit: sdp-prem-prod (v2/matches) — samme kilde som kampprogrammet
//     blev seedet fra, så matchId'et står allerede som suffiks i dokument-
//     id'erne (r{runde}-{matchId}).
//   Stilling: det ældre footballapi (standings?compSeasons=…) — det nye API
//     har ikke et standings-endpoint (probet 12/8-2026).
// Ingen nøgle; begge kræver kun en browser-agtig Origin/Referer.

const SDP_BASE = 'https://sdp-prem-prod.premier-league-prod.pulselive.com/api/v2';
const FOOTBALLAPI_BASE = 'https://footballapi.pulselive.com/football';
const PL_HEADERS = {
  Origin: 'https://www.premierleague.com',
  Referer: 'https://www.premierleague.com/',
};
const plOpt = () => ({ ...hentOpt(), headers: PL_HEADERS });

/** Alle kampe i en sæson via _next-paginering (~4 sider à 100). */
async function plAlleKampe(sync, fetchFn) {
  const kampe = [];
  let next = '';
  // Sidetallet er et LOFT, ikke en forventning: 380 kampe er 4 sider. Løber
  // vi forbi 10, følger vi en cursor i ring — kast, så fejlen ses i loggen,
  // i stedet for at levere et halvt facit-billede.
  for (let side = 0; ; side += 1) {
    if (side >= 10) throw new Error('pulselive: mere end 10 sider — cursor i ring?');
    const url = `${SDP_BASE}/matches?competition=${sync.competitionId}&season=${sync.season}`
      + `&_limit=100${next ? `&_next=${encodeURIComponent(next)}` : ''}`;
    const res = await fetchFn(url, plOpt());
    if (!res.ok) throw new Error(`pulselive matches HTTP ${res.status}`);
    const data = await res.json();
    kampe.push(...(data.data || []));
    next = data.pagination?._next || '';
    if (!next) break;
  }
  return kampe;
}

/**
 * footballapi's compSeason-id for et sæsons-ÅR. Labels er ikke ens på tværs
 * af årgange ("English Premier League Season 2026/2027" vs "2025/26"), så vi
 * matcher på det FØRSTE årstal i labelen (2-cifret normaliseres). Slås op pr.
 * kørsel i stedet for at stå i SYNCED_GAMES: id'et er en intern footballapi-
 * detalje, og en hardcodet værdi ville overleve et sæsonskifte i stilhed.
 */
// footballapi's eget id for Premier League (≠ sdp-API'ets competition=8).
// En provider-intern detalje som compSeason — hører til her, ikke i
// SYNCED_GAMES, som spejler games.mjs' sync-felt nøgle for nøgle.
const FOOTBALLAPI_COMPETITION_ID = 1;

async function plCompSeason(sync, fetchFn) {
  const res = await fetchFn(`${FOOTBALLAPI_BASE}/competitions/${FOOTBALLAPI_COMPETITION_ID}/compseasons?page=0&pageSize=100`, plOpt());
  if (!res.ok) throw new Error(`pulselive compseasons HTTP ${res.status}`);
  const data = await res.json();
  const fund = (data.content || []).find((c) => {
    const m = String(c.label).match(/\d{4}|\d{2}/);
    if (!m) return false;
    const y = m[0].length === 2 ? 2000 + Number(m[0]) : Number(m[0]);
    return y === sync.season;
  });
  if (!fund) throw new Error(`pulselive: ingen compSeason for ${sync.season}`);
  return Math.trunc(fund.id);
}

const pulselive = {
  async hentFaerdige(sync, fetchFn) {
    return (await plAlleKampe(sync, fetchFn))
      .filter((m) => m.period === 'FullTime'
        && Number.isFinite(m.homeTeam?.score) && Number.isFinite(m.awayTeam?.score))
      .map((m) => ({
        sourceKey: String(m.matchId),
        homeGoals: m.homeTeam.score,
        awayGoals: m.awayTeam.score,
      }));
  },

  // Live er endnu ikke implementeret for pulselive: period-værdierne for en
  // kamp I GANG kan først observeres på en kampdag (fixtures har kun PreMatch
  // og FullTime). null er kontraktens "jeg ved det ikke" — kernen skriver
  // ingen live-stilling og markerer ALDRIG slut på det. Kaste må den ikke:
  // det ville fylde loggen hvert minut i hele kampvinduet.
  async hentLive() {
    return { events: [], stadigIGang: null };
  },

  async hentStandings(sync, fetchFn) {
    const compSeason = await plCompSeason(sync, fetchFn);
    const res = await fetchFn(`${FOOTBALLAPI_BASE}/standings?compSeasons=${compSeason}`, plOpt());
    if (!res.ok) throw new Error(`pulselive standings HTTP ${res.status}`);
    const data = await res.json();
    return ((data.tables?.[0]?.entries) || [])
      .map((e) => ({
        rank: Number(e.position) || 0,
        // team.name er samme navneform som sdp-kampene og spillets holdliste
        // (efterprøvet i fixtures) — så teamInfo-opslaget i FootballTable
        // rammer farver og trøjer direkte.
        teamName: e.team?.name,
        teamShortName: e.team?.club?.abbr || null,
        points: Number(e.overall?.points) || 0,
        played: Number(e.overall?.played) || 0,
        won: Number(e.overall?.won) || 0,
        draw: Number(e.overall?.drawn) || 0,
        lost: Number(e.overall?.lost) || 0,
        gf: Number(e.overall?.goalsFor) || 0,
        ga: Number(e.overall?.goalsAgainst) || 0,
        rankType: null,
      }))
      .filter((r) => r.teamName)
      .sort((a, b) => a.rank - b.rank);
  },

  // Dokument-id'erne er r{runde}-{pulseliveMatchId} (seedFootball.docId), så
  // kilde-id'et genfindes som suffiks. Runden regnes ALDRIG ud af API'ets
  // matchWeek: spillene er skåret på VORES rundenummer ved seed-tidspunktet,
  // og en flyttet kamp følger sin runde (#25) — melder kilden en ny uge,
  // ignoreres den, og kampen genfindes på sit id.
  resolveDocs(sourceKeys, docIds) {
    const efterSuffiks = new Map();
    // docIds kan være en engangs-iterator — læses ÉN gang (se kontrakten).
    for (const id of docIds) {
      const i = String(id).lastIndexOf('-');
      if (i >= 0) efterSuffiks.set(String(id).slice(i + 1), id);
    }
    const map = new Map();
    for (const k of sourceKeys) {
      const id = efterSuffiks.get(String(k));
      if (id != null) map.set(k, id);
    }
    return map;
  },
};

// --- Registret --------------------------------------------------------------

const PROVIDERS = { superliga, pulselive };

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
  {
    gameId: 'pl2627-efteraar',
    provider: 'pulselive',
    sync: { competitionId: 8, season: 2026 },
  },
];

module.exports = {
  PROVIDERS, SYNCED_GAMES,
  SEASON_ID, TOURNAMENT_ID, STAGE_ID,
  matchDocId, liveStatus, LIVE_STATUS, resultsUrl, liveUrl, standingsUrl, hentOpt,
};
