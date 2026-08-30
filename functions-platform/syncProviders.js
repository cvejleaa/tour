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
//   hentXg(sync, fetchFn, docIds) → [{ sourceKey, xgHome, xgAway }]
//       VALGFRI. Forventede mål for FÆRDIGE kampe. Modsat de øvrige metoder
//       tager den en LISTE af nøgler ind, og det er ikke pynt: xG ligger hos
//       BEGGE kilder på et eget endpoint med ÉT kald PR. KAMP — det står
//       ikke i de lister, hentFaerdige allerede henter.
//
//       DERFOR KALDES DEN KUN FRA SWEEP'ET, aldrig fra minut-synken.
//       hentFaerdige returnerer hele sæsonens færdige kampe og kører hvert
//       minut i et kampvindue; xG dér ville være ~132 ekstra kald i minuttet
//       ved sæsonslut. Værre: hentFaerdige kaster ved timeout, og fejlen
//       sluges i runScheduledSync — så xG kunne TAVST standse facit-synken
//       midt på en kampaften. Sweep'et kører 12 gange i døgnet, har hele
//       kamplisten i forvejen og er stedet, hvor et loft kan bæres.
//
//       Den tager VORES dokument-id'er ind og returnerer KILDENS nøgler, som
//       resolveDocs så oversætter tilbage. Årsagen: resolveDocs går kun én vej
//       (kilde → dokument), og oversættelsen den anden vej er provider-viden.
//       Lagde kernen den selv, ville den skulle kende, at pulselives
//       dokument-id er `r{runde}-{matchId}` — præcis den viden, kontrakten
//       findes for at holde ude af kernen.
//
//       Kalderen sender kun id'er for kampe, der er færdige OG mangler xG, og
//       højst XG_LOFT ad gangen. Ukendte id'er udelades af svaret, og en kamp
//       uden brugbare tal SKAL udelades — aldrig 0 for "ved ikke" (brug
//       xgTal, ikke Number: Number(null) er 0, ikke NaN).
//
//       `deadlineMs` er et WALL-CLOCK-budget fra kernen, ikke en per-kald-
//       timeout. Implementationen SKAL tjekke det i toppen af sin pr.-kamp-
//       løkke og bryde ud. Uden det er løkken kun bundet af per-kald-timeouten
//       gange antallet af kampe, og en langsom kilde kan bruge hele det
//       omgivende jobs budget op — hvorefter platformen dræber invocation'en,
//       og INTET af det, jobbet ellers skulle nå, bliver gjort. Den fejl kan
//       ikke fanges af try/catch.
//
//       Et loft på antal ØNSKEDE kampe er ikke et loft på antal KALD: lister
//       kilden samme kamp flere gange, skal nøglen være opbrugt efter første
//       gennemløb (Set.delete, ikke Set.has).
//   hentKickoffs(sync, fetchFn, runder) → [{ sourceKey, kickoff: ISO-UTC|null }]
//       VALGFRI: kilder, hvis kamptider flytter sig løbende (tv-aftaler).
//       Både PL og Superligaen har den nu. Mangler en kilde metoden, springer
//       kickoff-synken spillet over, og tiderne rettes kun ad seedKickoffs-
//       vejen (drift.md). En allerede PASSERET forkert tid rettes altid ad
//       seed-vejen (genåbnings-vagten). `runder` er SPILLETS
//       runde-sæt: kilde-kampe uden for det skal droppes FØR tolkning —
//       ellers drukner mangler-alarmen i forårskampe, spillet ikke har, og
//       én ulæselig tid i en irrelevant kamp vælter hele dagens kørsel.
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

const { londonTilUtcMs } = require('./seedFootball');

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

/** URL til IKKE-STARTEDE kampe (til kickoff-synken). Vi henter KUN notstarted,
 *  så en spillet eller igangværende kamps tidspunkt aldrig kan blive flyttet —
 *  et facit er historie, ikke en deadline. */
function kickoffsUrl(seasonId = SEASON_ID) {
  return `${API_BASE}/events-v2?appName=${APP_NAME}&access_token=${ACCESS_TOKEN}`
    + `&env=production&locale=da&seasonId=${seasonId}&status=notstarted`;
}

/** URL til den OFFICIELLE stilling (grundspil-stage), med form (last5). */
function standingsUrl(seasonId = SEASON_ID, stageId = STAGE_ID, tournamentId = TOURNAMENT_ID) {
  // tournamentId SKAL komme fra sync-posten, når den kaldes af provideren —
  // ellers er feltet i SYNCED_GAMES dekorativt, og en rettelse dér ændrer
  // ingenting (QC-fund på den første udgave).
  return `${API_BASE}/tournaments/${tournamentId}/standings?appName=superligadk&access_token=${ACCESS_TOKEN}`
    + `&env=production&locale=da&addResults=true&resultsLimit=6&form=last5&seasonId=${seasonId}&stageId=${stageId}`;
}

// Number(null), Number(''), Number(false) og Number([]) er ALLE 0 — et finite
// tal, der ville slippe forbi Number.isFinite-vagten og blive skrevet som et
// ægte 0,0. Kontrakten ovenfor siger det modsatte: en kamp uden brugbare tal
// SKAL udelades, aldrig 0 for "ved ikke". Og et falsk 0 er værre end et
// manglende tal: prøvefiltret regner 0 som "har xG", så kampen genforsøges
// ALDRIG — det forkerte tal støbes fast, mens Drift-kortet melder grønt.
//
// Returnerer null for alt, der ikke er et tal (eller en talstreng), så
// kalderen kan skelne "ved ikke" fra et ægte nul.
function xgTal(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

  async hentXg(sync, fetchFn, docIds, deadlineMs) {
    // For denne kilde ER dokument-id'et og sourceKey det samme (begge er
    // matchDocId), så listen kan bruges direkte. Se pulselive for modstykket.
    const oenskede = new Set(docIds || []);
    if (!oenskede.size) return [];
    // Tidsbudgettet kommer fra kernen. Uden det er løkken kun bundet af
    // per-kald-timeouten gange antallet af kampe, og en langsom (ikke engang
    // nede) kilde kan æde hele sweep'ets budget — se syncXgCore.
    const frist = Number(deadlineMs);
    // Ét listekald for at oversætte vores dokument-nøgle til kildens eventId.
    // Nøglen er matchDocId(runde, hjemme, ude) og kan ikke udledes af et tal,
    // så opslaget er nødvendigt — modsat pulselive, hvor nøglen ER id'et.
    const res = await fetchFn(resultsUrl(sync.seasonId), hentOpt());
    if (!res.ok) throw new Error(`superliga API HTTP ${res.status}`);
    const data = await res.json();
    const ud = [];
    for (const e of (data.events || [])) {
      if (Number.isFinite(frist) && Date.now() >= frist) break;
      const key = matchDocId(e.round, e.homeName, e.awayName);
      // delete og ikke has: sættet tømmes undervejs, så en kilde, der lister
      // samme kamp mange gange, ikke kan gange kald- og skrivetallet op. Uden
      // det er XG_LOFT et loft på ØNSKEDE KAMPE, ikke på KALD — 600 dubletter
      // af én kamp gav 601 kald og 600 batch-ops, over Firestores grænse på
      // 500, så HELE xG-skrivningen tabtes hver kørsel.
      if (!oenskede.delete(key)) continue;
      const s2 = await fetchFn(
        `${API_BASE}/opta-stats/events/${e.eventId}/teams?appName=${APP_NAME}`
        + `&access_token=${ACCESS_TOKEN}&env=production&locale=da`,
        hentOpt(),
      );
      // En enkelt kamp uden statistik må ikke vælte kørslen: den skrives
      // simpelthen ikke, og tælleren på Drift-kortet bliver stående — så det
      // er SYNLIGT frem for tavst.
      if (!s2.ok) continue;
      const xg = (await s2.json())?.expectedGoals || {};
      const h = xgTal(xg.home);
      const a = xgTal(xg.away);
      if (h === null || a === null) continue;
      ud.push({ sourceKey: key, xgHome: h, xgAway: a });
    }
    return ud;
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

  // Kickoff-synk: fanger kampe, ligaen har FLYTTET, så vores deadline følger
  // med. KUN notstarted-kampe hentes (kickoffsUrl), så et facit aldrig flyttes.
  // startDate er allerede ISO-UTC (…Z) fra kilden — ingen zone-omregning som
  // PL (London). Filtreres til SPILLETS runder, præcis som pulselive.hentKickoffs.
  //
  // En MANGLENDE startDate giver kickoff:null — og den delte kickoffPlan-vagt
  // KASTER, hvis en kamp med en gemt tid pludselig mangler tid (rydder aldrig
  // en deadline som bivirkning af en rutinekørsel). En UGYLDIG startDate kaster
  // vi selv her, med kampens id, så en uforståelig kilde skriver INTET frem for
  // en forkert deadline (kickoff ER tip-deadlinen).
  async hentKickoffs(sync, fetchFn, runder) {
    const res = await fetchFn(kickoffsUrl(sync.seasonId), hentOpt());
    if (!res.ok) throw new Error(`superliga kickoffs HTTP ${res.status}`);
    const data = await res.json();
    // Som hentLive: et svar uden events-liste er et format-brud, ikke "ingen
    // kampe". Kast, så intet skrives — ellers ville {} tolkes som nul kickoffs.
    if (!data || !Array.isArray(data.events)) throw new Error('superliga kickoffs: svar uden events-liste');
    return data.events
      .filter((e) => !runder || runder.has(e.round))
      .map((e) => {
        const id = matchDocId(e.round, e.homeName, e.awayName);
        let kickoff = null;
        if (e.startDate != null) {
          const ms = Date.parse(e.startDate);
          if (!Number.isFinite(ms)) throw new Error(`superliga kickoffs: ugyldig startDate "${e.startDate}" for ${id}`);
          kickoff = new Date(ms).toISOString();
        }
        return { sourceKey: id, kickoff };
      });
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
// Ét API, to versioner — shapes dokumenteret i testdata/pulselive-*.json
// (hentet med scripts/probe-pulselive.mjs) og bekræftet mod HAR-optagelser af
// premierleague.com selv (docs/PL_*.har):
//   Kampe/facit: v2/matches — samme kilde som kampprogrammet blev seedet fra,
//     så matchId'et står allerede som suffiks i dokument-id'erne
//     (r{runde}-{matchId}).
//   Stilling: v5/…/standings — det endpoint, sitet selv bruger (fra HAR'en).
//     Rækkerne kommer USORTERET (alfabetisk), så rank-sorteringen er byrde,
//     ikke pynt.
// Ingen nøgle; begge kræver kun en browser-agtig Origin/Referer.

const SDP_API = 'https://sdp-prem-prod.premier-league-prod.pulselive.com/api';
const SDP_BASE = `${SDP_API}/v2`;
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
    // Et 200 uden data-liste SKAL kaste — samme grund som superligaens
    // hentLive: for live-kernen er fravær et SKRIVE-signal (kampe væk fra
    // listen markeres slut), så en afkortet krop eller et ændret format må
    // aldrig kunne ligne "ingen kampe". For facit og kickoffs er et halvt
    // billede tilsvarende værre end en rød log.
    if (!data || !Array.isArray(data.data)) throw new Error('pulselive: svar uden data-liste');
    kampe.push(...data.data);
    next = data.pagination?._next || '';
    if (!next) break;
  }
  return kampe;
}

// Kamp-niveauets period → vores lukkede statussæt (samme sæt som Superligaen,
// så klienten aldrig ser kildens egne ord).
//
// OBSERVERET PÅ KAMP-NIVEAU (fixtures/pl-live-runde1.json — runde 1,
// 23/8-2026, capturet mens to kampe kørte): PreMatch, SecondHalf, FullTime.
// Det er 'secondhalf' der betyder noget her: den var før GÆTTET, og er nu
// bundet af en test mod ægte kildedata.
//
// 'firsthalf' er STADIG kun set på HÆNDELSES-niveau (mål/kort bærer
// period "FirstHalf" i docs/PL_match_liv_bou.har og i samme capture) — ikke
// på kampen selv, for begge kampe var forbi pausen, da capturen blev taget.
// Samme status som før; den er altså ikke efterprøvet, blot sandsynlig.
// Ærligheden koster ingenting: en capture fra en kamps første 45 minutter
// ville lukke punktet.
//
// halftime, extratime, shootout, abandoned, postponed og suspended er
// uobserverede naboer i samme familie. En værdi, vi ikke kender, bliver
// 'ukendt' (vises som blot "DIREKTE") og logges, så et nyt token afslører sig
// selv uden at vælte noget.
const PL_PERIOD_STATUS = {
  firsthalf: 'foerste',
  halftime: 'pause',
  secondhalf: 'anden',
  extratime: 'forlaenget',
  shootout: 'straffe',
  abandoned: 'afbrudt',
  postponed: 'afbrudt',
  suspended: 'afbrudt',
};

/**
 * Kamp-niveauets period som UFARLIG streng. Feltet kommer fra en fremmed
 * kilde og kan være hvad som helst — også et objekt, som String() KASTER på
 * ({toString: null} er JSON-nåbart), og så ville ÉN giftig kamp vælte hele
 * minuttets kørsel for spillet (Security-fund). Ikke-strenge bliver
 * 'ikke-streng': regnes i gang (fail-sikkert — aldrig et falsk "Slut") og
 * vises som blot DIREKTE, mens de raske kampe kører videre.
 */
function plPeriodStr(p) {
  if (typeof p === 'string') return p;
  return p == null ? '' : 'ikke-streng';
}

/** Normaliseret period til sammenligning — ÉN stavemåde-vagt for alle veje. */
function plPeriodNorm(m) {
  return plPeriodStr(m.period).trim().toLowerCase();
}

/** period → vores lukkede sæt. Ukendt bliver 'ukendt' og logges. */
function plLiveStatus(raw) {
  const n = String(raw ?? '').trim().toLowerCase();
  // hasOwnProperty af samme grund som superligaens liveStatus: et opslag på
  // 'constructor' rammer Object.prototype og giver en funktion, Admin SDK
  // ikke kan serialisere — og så ville hele minut-synken kaste tavst.
  const kendt = Object.prototype.hasOwnProperty.call(PL_PERIOD_STATUS, n) ? PL_PERIOD_STATUS[n] : null;
  // Klippet i loggen som i statusRaw — et fjendtligt token skal ikke kunne
  // fylde loggen med vilkårlig længde.
  if (!kendt && n) console.warn(`pulselive: ukendt live-period "${n.slice(0, 40)}" — vises som blot "direkte".`);
  return kendt || 'ukendt';
}

/**
 * Er kampen i gang, set fra kilden? PreMatch og FullTime er de eneste
 * HVILE-tilstande, vi har observeret — alt andet (kendt som ukendt) regnes
 * som i gang. Den vej fejler et nyt token SIKKERT: kampen bliver i
 * stadigIGang og kan aldrig få et falsk "Slut" af, at vi ikke kendte ordet.
 * Manglende period regnes som HVILE — feltet står på hver eneste kamp i
 * fixtures, så et hul er en enkelt kamps datafejl, ikke et formatskifte
 * (det fanger data-liste-vagten i plAlleKampe).
 */
function plIGang(m) {
  const p = plPeriodNorm(m);
  return p !== '' && p !== 'prematch' && p !== 'fulltime';
}

const pulselive = {
  async hentFaerdige(sync, fetchFn) {
    // Samme normaliserede period-vagt som live-vejen (plPeriodNorm): matcher
    // vi 'FullTime' case-følsomt her og case-løst dér, kan en ren
    // stavemåde-ændring fra kilden gøre kampen stum i BEGGE ender — intet
    // facit OG ingen live — og kun sweep-alarmen fanger det timer senere.
    return (await plAlleKampe(sync, fetchFn))
      .filter((m) => plPeriodNorm(m) === 'fulltime'
        && Number.isFinite(m.homeTeam?.score) && Number.isFinite(m.awayTeam?.score))
      .map((m) => ({
        sourceKey: String(m.matchId),
        homeGoals: m.homeTeam.score,
        awayGoals: m.awayTeam.score,
      }));
  },

  async hentXg(sync, fetchFn, docIds, deadlineMs) {
    const ud = [];
    const frist = Number(deadlineMs);
    // Dokument-id'et er `r{runde}-{matchId}`, og kildens nøgle er halen —
    // samme udledning som resolveDocs laver den modsatte vej. Den ligger HER
    // og ikke i kernen, fordi id-formen er denne kildes viden alene.
    // Set: ét kald pr. kamp, også hvis kalderen skulle sende samme id to gange.
    for (const id of new Set(docIds || [])) {
      if (Number.isFinite(frist) && Date.now() >= frist) break;
      const i = String(id).lastIndexOf('-');
      const key = i >= 0 ? String(id).slice(i + 1) : String(id);
      if (!key) continue;
      const res = await fetchFn(`${SDP_API}/v3/matches/${key}/stats`, plOpt());
      if (!res.ok) continue; // se superligaens hentXg: én kamp vælter ikke kørslen
      const sider = await res.json();
      if (!Array.isArray(sider)) continue;
      const tal = (side) => xgTal(
        sider.find((x) => String(x?.side).toLowerCase() === side)?.stats?.expectedGoals,
      );
      const h = tal('home');
      const a = tal('away');
      if (h === null || a === null) continue;
      ud.push({ sourceKey: String(key), xgHome: h, xgAway: a });
    }
    return ud;
  },

  async hentKickoffs(sync, fetchFn, runder) {
    return (await plAlleKampe(sync, fetchFn))
      // Uden for spillets runder: drop FØR tolkning (se kontrakten) — PL-
      // efterårsspillet har runde 1-18, kilden leverer alle 38.
      .filter((m) => !runder || runder.has(m.matchWeek))
      .map((m) => {
      // Antagelsen "tiden er London-tid" er bærende for deadlinen — skifter
      // kilden zone-felt, skal det ses som en fejl, ikke som en times skred.
      if (m.kickoffTimezoneString && m.kickoffTimezoneString !== 'Europe/London') {
        throw new Error(`pulselive: uventet tidszone "${m.kickoffTimezoneString}" for kamp ${m.matchId}`);
      }
        return {
          sourceKey: String(m.matchId),
          kickoff: m.kickoff ? new Date(londonTilUtcMs(m.kickoff)).toISOString() : null,
        };
      });
  },

  // Samme sæson-liste som facit og kickoffs — med vilje IKKE matchweek-
  // filtreret: kilden KAN omdøbe en kamps matchWeek (resolveDocs-invarianten:
  // vores runde står fast, kampen genfindes på sit id), og en kamp, der
  // faldt uden for et matchweek-filter, ville mangle i stadigIGang og få et
  // falsk "Slut" midt i spillet. Prisen, ærligt talt: i et kampvindue henter
  // minuttets kørsel sæson-listen TO gange (hentFaerdige + hentLive deler
  // ikke svar), altså ~8 sider i minuttet — kun i kampvinduer
  // (runScheduledSync exiter tidligt uden ventende kampe). Det er prisen
  // værd; en cache på tværs af de to kald er et sæsoneftersyns-emne.
  async hentLive(sync, fetchFn) {
    const alle = await plAlleKampe(sync, fetchFn);
    const iGang = alle.filter(plIGang);
    return {
      events: iGang
        .filter((m) => Number.isFinite(m.homeTeam?.score) && Number.isFinite(m.awayTeam?.score))
        .map((m) => ({
          sourceKey: String(m.matchId),
          home: m.homeTeam.score,
          away: m.awayTeam.score,
          status: plLiveStatus(plPeriodStr(m.period)),
          // Kun til fejlsøgning i loggen — må ALDRIG renderes (samme klip og
          // samme grund som superligaens statusRaw).
          statusRaw: plPeriodStr(m.period).slice(0, 40),
        })),
      // Bygget på den UFILTREREDE i-gang-liste (kontrakten): vores eget
      // score-filter må ikke kunne læses som slutfløjt for en kamp i gang
      // med en (endnu) ubrugelig stilling.
      stadigIGang: new Set(iGang.map((m) => String(m.matchId))),
    };
  },

  async hentStandings(sync, fetchFn) {
    // live=false: den OPGJORTE tabel, ikke en, der flytter sig midt i en kamp
    // — samme princip som at facit slår live.
    const res = await fetchFn(`${SDP_API}/v5/competitions/${sync.competitionId}/seasons/${sync.season}/standings?live=false`, plOpt());
    if (!res.ok) throw new Error(`pulselive standings HTTP ${res.status}`);
    const data = await res.json();
    return ((data.tables?.[0]?.entries) || [])
      .map((e) => ({
        rank: Number(e.overall?.position) || 0,
        // team.name er samme navneform som sdp-kampene og spillets holdliste
        // (efterprøvet i fixtures) — så teamInfo-opslaget i FootballTable
        // rammer farver og trøjer direkte.
        teamName: e.team?.name,
        teamShortName: e.team?.abbr || null,
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
  matchDocId, liveStatus, LIVE_STATUS, resultsUrl, liveUrl, kickoffsUrl, standingsUrl, hentOpt,
  plLiveStatus, PL_PERIOD_STATUS,
};
