'use strict';
// ---------------------------------------------------------------------------
// gameRecap.js — "Runde-Botten": AI-genereret opslag på liga-væggene, når
// SIDSTE kamp i en runde er afregnet (ikke hver morgen som Tour-botten).
// Selve AI-kaldet (Anthropic/Claude) + Firestore ligger i runGameRoundRecap;
// fakta-opbygningen og system-prompten er rene og testbare.
// ---------------------------------------------------------------------------

// Combi-reglen findes ÉT sted. Den lå før i en dublet i gameScoring, som kun
// denne fil brugte — og en dublet, der driver botten, mens originalen driver
// stillingen, betyder, at ligavæggen kan komme til at sige et andet tal end
// stillingen, uden at én test falder.
const { buildRoundContext, combiBonus } = require('./pointOpdeling');
const { rensTekst } = require('./rensTekst');
const { outcomePoints, sportOrd, SPORT_ORD } = require('./superligaScoring');
const {
  harFaseKalender, harKnockout, faseKalenderAdvarsel, rundeEtiket, naesteKalenderRunde, faseFor, fmtFaseStart,
} = require('./faser');
const { kampSlut, AFGJORT_NAVN } = require('./facit');
const { gatedeKampe, startRundeFor } = require('./startGate');
const {
  ligaPoint, harRundeVektor, vektorStemmer, puljeMaksStartRunde,
} = require('./ligaPoint');
const { aktiveSpillere } = require('./forladSpil');

// 'in' tager højst 30 værdier pr. forespørgsel.
const IN_CHUNK = 30;

/**
 * Placeringer INDEN FOR en liga, ikke i hele spillet.
 *
 * `players/{uid}.rank` er spil-globalt (og oveni et rundesnapshot). Brugte
 * botten det tal i en liga på syv, ville den skrive "nr. 1, nr. 4, nr. 7" og
 * kalde en mand fører, som ligaens egne medlemmer ikke engang kan se. Rangen
 * skal regnes af PRÆCIS de spillere, opslaget handler om.
 *
 * previousRank udledes af den indbyrdes RÆKKEFØLGE af medlemmernes globale
 * previousRank — den er stadig rigtig relativt, selv om tallet ikke er det.
 * Spillere uden tidligere placering ryger bagerst og får null.
 */
function lokaleRanger(medlemmer) {
  const efterPoint = [...medlemmer].sort((a, b) => (
    (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0)
    || String(a.uid).localeCompare(String(b.uid))
  ));
  const rang = new Map();
  let r = 0;
  let sidst = null;
  efterPoint.forEach((p, i) => {
    const pts = Number(p.totalPoints) || 0;
    if (pts !== sidst) { r = i + 1; sidst = pts; }
    rang.set(p.uid, r);
  });

  const medTidligere = medlemmer.filter((p) => Number.isFinite(p.previousRank));
  medTidligere.sort((a, b) => a.previousRank - b.previousRank
    || String(a.uid).localeCompare(String(b.uid)));
  const foer = new Map();
  medTidligere.forEach((p, i) => foer.set(p.uid, i + 1));

  return medlemmer.map((p) => ({
    ...p,
    rank: rang.get(p.uid) ?? null,
    previousRank: foer.has(p.uid) ? foer.get(p.uid) : null,
  }));
}

/** Del en liste i grupper af højst `size`. */
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const RECAP_SYSTEM = `Du er "Runde-Botten", som skriver ét kort, varmt opslag på dansk til en privat fodbold-tippeliga, lige efter kampene i en rundes egen uge er spillet.
Skriv 70-150 ord i naturlig, sammenhængende prosa (ikke punktopstilling, ingen overskrift, ingen anførselstegn). Brug 1-2 emojis.

Du får et JSON-faktaobjekt. Du må KUN bruge de oplyste fakta og tal. Find ALDRIG på navne, kampe, resultater, point eller placeringer, og lav ALDRIG dine egne udregninger.

Felterne betyder:
- "round": rundens nummer — opslaget handler om denne runde.
- "matches": rundens kampe PÅ KUPONEN — dem der blev spillet i rundens egen uge. Hvert element har "home", "away", "score" (fx "2-1") og "surprise": true hvis udfaldet var en stor overraskelse (høje odds). Nævn 1-2 kampe naturligt — helst en overraskelse, hvis der er en.
- "udsatte": kampe i runden, der ligger uden for rundens uge og endnu ikke er spillet. Er listen IKKE tom, er runden ikke færdigspillet — skriv da aldrig at den er det, og nævn i ÉN sætning, at runden gøres op på ugens kampe, og at de nævnte kampe spilles senere og giver point til den tid.
- "standings": den AKTUELLE samlede stilling NU (rundens point er allerede lagt til). For hver spiller er "points" deres TOTALE pointtal, og "roundPoints" hvad de vandt i DENNE runde (inkl. evt. combi-bonus).
- "standout": spilleren med FLEST "roundPoints" i runden. "standoutTie": true hvis flere deler rundens bedste (se "roundWinners").
- "combi": spillere der fik combi-bonus, med beløbet. Bonussen falder for de FLESTE hver runde — den er hverken sjælden eller en bedrift. Nævn den KUN, hvis et beløb skiller sig ud (fx rundens klart højeste). Skriv ALDRIG at nogen "ramte hele runden", "tippede alle kampe" eller "fik næsten alt rigtigt": bonussen kræver ingen af delene.
- "leader": fører lige nu. "leadChanged": true hvis førstepladsen har skiftet i denne runde.
- "chancer": spillere der brugte Chancen — rundens mest personlige beslutning: man sætter point på spil på ÉT af sine tips (hele satsningen ligger altså på den ene kamp). Hvert element har "name", "kamp", "valg" (1/X/2), "odds" (spillerens odds på valget), "indsats", "ramt" og "netto" (±point). Mod måles i ODDS, ikke i netto: en gevinst på høje odds er modig, en gevinst på odds tæt på 1 er "satsede på det sikreste i verden og fik ét point hjem" — den slags må du gerne drille kærligt med.
- "stoersteGevinst"/"stoersteTab": FORUDBEREGNET største chance-gevinst og -tab (navn + netto); null hvis ingen eller delt. Fremhæv højst disse to — sammenlign ALDRIG selv på tværs af listen.
- "ingenChancer": true hvis INGEN i ligaen brugte Chancen i runden — det må du nævne som kollektiv observation i ÉN ledsætning ("ingen turde tage Chancen ⚡"), ALDRIG med navne på hvem der ikke satsede.
- "nextRound": næste rundes nummer (kan mangle, hvis sæsonen er slut).

Ufravigelige regler:
- "points" betyder ALTID totalen; "roundPoints" betyder ALTID pointene i denne runde. Forveksl dem ALDRIG.
- Feltnavnene er INTERNE: skriv ALDRIG "roundPoints", "standout" el.lign. i teksten — skriv naturligt dansk ("8 point i runden", "i alt 31 point").
- Skriv kun at nogen "overhalede"/"tog førstepladsen", hvis "leadChanged" er true. Ellers kan du skrive at lederen "fører stadig".
- Slut gerne med en lille optakt: mind om at tippe næste runde, hvis "nextRound" findes.

Tone om Chancen (ufravigelig):
- Højst ÉN ledsætning om en tabt chance — tabet er altid begrænset til indsatsen, så en hel sætnings undergangsstemning er misforholdt.
- Skriv ALDRIG at en chance "kostede placeringen" eller "kostede runden" — det er en udregning, du ikke må lave.
- Kommentér ALDRIG størrelsen af en indsats som fej eller lille — loftet afhænger af spillerens saldo, så en lille indsats kan være alt, hvad reglerne tillod.

Tone over for rundens bedste:
- Er "standoutTie" false (ÉN klar rundevinder = "standout"), så lykønsk vedkommende med et glimt i øjet — gerne let drillende og hoverende på en venlig, humoristisk måde (en kærlig stikpille til de andre om at hænge på). Godmodigt, aldrig hånligt.
- Er "standoutTie" true, så hold tonen neutral og varm: nævn "roundWinners" ligeværdigt og undlad at drille nogen.`;

// Udskiftningerne i en turnering MED fasekalender. Hver nøgle skal stå præcis
// én gang i RECAP_SYSTEM — ellers kaster recapSystem, i stedet for tavst at
// sende den gamle sætning med (testet: gameRecap.test.js).
const KALENDER_UDSKIFTNING = [
  [
    'lige efter kampene i en rundes egen uge er spillet.',
    'lige efter en spilledags kampe er spillet.',
  ],
  [
    '- "round": rundens nummer — opslaget handler om denne runde.',
    '- "round": spilledagens nummer i turneringens kalender — opslaget handler om denne dag.\n'
      + '- "rundeNavn": hvad dagen hedder, fx "Indledende runde · dag 2 · tor 14/1". Brug navnet, når du omtaler dagen — skriv ALDRIG "runde 7" om en spilledag: i en turnering er "runde" et fase-ord (indledende runde, hovedrunde).\n'
      + '- Hvor denne vejledning siger "runden", menes spilledagen: skriv selv "dagen" (eller dagens navn) i teksten, aldrig "runden".',
  ],
  // UGEN FINDES IKKE I EN TURNERING. Kuponen er stadig et tidsvindue, men en
  // spilledag er én dag: "rundens egen uge" og "ugens kampe" ville få botten
  // til at skrive om en uge, ingen spiller kender (modstanderens fund 5).
  [
    '- "matches": rundens kampe PÅ KUPONEN — dem der blev spillet i rundens egen uge.',
    '- "matches": dagens kampe PÅ KUPONEN — dem der blev spillet på spilledagen.',
  ],
  [
    '- "udsatte": kampe i runden, der ligger uden for rundens uge og endnu ikke er spillet. Er listen IKKE tom, er runden ikke færdigspillet — skriv da aldrig at den er det, og nævn i ÉN sætning, at runden gøres op på ugens kampe, og at de nævnte kampe spilles senere og giver point til den tid.',
    '- "udsatte": kampe fra dagen, der er flyttet og endnu ikke er spillet. Er listen IKKE tom, er dagen ikke færdigspillet — skriv da aldrig at den er det, og nævn i ÉN sætning, at dagen gøres op på de spillede kampe, og at de nævnte kampe spilles senere og giver point til den tid.',
  ],
  [
    '- "nextRound": næste rundes nummer (kan mangle, hvis sæsonen er slut).',
    '- "nextRound": næste spilledags nummer ifølge turneringens kalender. Den findes, selv om dagens kampe ikke er lagt ind endnu — "naesteKampeLagtInd": false betyder, at næste fase venter på, at holdene kendes. Turneringen er KUN slut, når "nextRound" mangler; skriv aldrig, at den er slut, ellers.\n'
      + '- "naesteRundeNavn": hvad næste spilledag hedder. "naesteRundeStart": datoen for første kamp, når næste dag begynder en ny fase.',
  ],
  [
    'mind om at tippe næste runde, hvis "nextRound" findes.',
    'mind om at tippe næste spilledag (brug "naesteRundeNavn"), hvis "nextRound" findes. Er "naesteKampeLagtInd" false, så sig, at kampene kommer, når holdene kendes — og nævn "naesteRundeStart", hvis den findes.',
  ],
  // Eksemplet er det, modellen kopierer: "8 point i runden" ville stå ordret
  // i et opslag om en spilledag.
  ['("8 point i runden", "i alt 31 point")', '("8 point på dagen", "i alt 31 point")'],
];

// Ankeret, knockout-forklaringen hægtes på: kampenes linje, som den står
// EFTER kalender-udskiftningen (knockout findes kun med en kalender).
const KNOCKOUT_ANKER = '- "matches": dagens kampe PÅ KUPONEN — dem der blev spillet på spilledagen.';

function knockoutForklaring(ord) {
  return `${KNOCKOUT_ANKER} Har en kamp feltet "slut", var den uafgjort efter ordinær tid (${ord.ordinaerTid}) og blev afgjort bagefter: "score" er stillingen efter ${ord.ordinaerTid} — den, der tippes på, så X var det rigtige tip — og "slut" er slutresultatet, "afgjort" siger hvordan (fx efter forlænget spilletid), og "vinder" gik videre. Kald ALDRIG "score" en sejr, og skriv aldrig, at et X-tip tabte, fordi nogen vandt bagefter. "ramteX" er dem i ligaen, der tippede X i netop den kamp: de fik ret, mens alle så nogen vinde — fremhæv dem gerne, når listen ikke er tom.`;
}

/**
 * System-prompten for ÉT spil. Uden fasekalender og med fodboldens ord er
 * den RECAP_SYSTEM byte for byte — Superligaen og Premier League får præcis
 * den prompt, de altid har fået.
 *
 * Sporten kommer fra sportOrd (ikke `sport === 'haandbold'`), og kalenderen
 * fra evnen harFaseKalender: uden den læste botten en manglende næste runde
 * som "sæsonen er slut" efter den indledende runde (QC).
 */
function recapSystem(game) {
  const ord = sportOrd(game);
  const kalender = harFaseKalender(game);
  if (!kalender && ord === SPORT_ORD.fodbold) return RECAP_SYSTEM;
  const erstat = (tekst, gammel, ny) => {
    if (tekst.split(gammel).length !== 2) throw new Error(`recapSystem: "${gammel}" står ikke præcis én gang i prompten`);
    return tekst.replace(gammel, ny);
  };
  let s = erstat(RECAP_SYSTEM, 'privat fodbold-tippeliga', `privat ${ord.sport}-tippeliga`);
  if (kalender) {
    for (const [gammel, ny] of KALENDER_UDSKIFTNING) s = erstat(s, gammel, ny);
  }
  // KNOCKOUT: en kamp, der stod lige efter ordinær tid, er X — også når
  // nogen vandt i forlængelsen (ejerens beslutning §11.1). Uden forklaringen
  // ville botten kalde 30-30 uafgjort om en kamp, alle så Danmark vinde, eller
  // — værre — kalde vinderen i forlængelsen for rundens rigtige tip.
  if (harKnockout(game)) s = erstat(s, KNOCKOUT_ANKER, knockoutForklaring(ord));
  return s;
}

/** Et kickoff som ms — tal (tests) eller Firestore-Timestamp (drift). */
function kickoffMs(k) {
  if (typeof k === 'number') return Number.isFinite(k) ? k : null;
  if (k && typeof k.toMillis === 'function') return k.toMillis();
  if (k instanceof Date) return k.getTime();
  return null;
}

/**
 * Kalender-felterne til fakta — KUN for et spil med fasekalender. Uden
 * kalender returneres null, og fakta får ikke én ny nøgle (SL og PL uændret).
 * @param {object} game
 * @param {number} round
 * @param {Array<object>} roundMatches rundens kampe (første kickoff → dato)
 * @param {Set<number>} oprettedeRunder runder, der har kampe
 */
function kalenderFakta(game, round, roundMatches, oprettedeRunder) {
  if (!harFaseKalender(game)) return null;
  const ms = roundMatches.map((m) => kickoffMs(m.kickoff)).filter((x) => x != null);
  const foerste = ms.length ? Math.min(...ms) : undefined;
  const naeste = naesteKalenderRunde(game, round);
  const fase = naeste != null ? faseFor(game, naeste) : null;
  return {
    rundeNavn: rundeEtiket(game, round, foerste),
    naesteRundeNavn: naeste != null ? rundeEtiket(game, naeste) : null,
    naesteRundeStart: fase && fase.dag === 1 ? fmtFaseStart(fase.start) : null,
    naesteKampeLagtInd: naeste != null ? oprettedeRunder.has(naeste) : null,
  };
}

/**
 * Rens et spiller-navn før det lægges i AI-fakta (værn mod prompt-injection via
 * frit displayName — fjerner kontroltegn/kontekst-brydende tegn, klipper længde).
 */
function sanitizeName(name) {
  // Delegerer til det fælles værn (rensTekst.js) — én vagt pr. sikkerhedsregel.
  // Navne-adfærden er uændret: max 40, fallback 'Spiller'.
  return rensTekst(name);
}


/** Er kampens udfald en "stor overraskelse"? (udfaldets odds ≥ 3.5) */
function isSurprise(m) {
  const o = m?.odds && m?.result != null ? Number(m.odds[m.result]) : NaN;
  return Number.isFinite(o) && o >= 3.5;
}

/**
 * Byg AI-fakta for en færdigspillet runde. Ren funktion (testbar).
 * @param {{round:number, roundMatches:Array<object>, players:Array<{uid:string,name:string,totalPoints:number,rank?:number,previousRank?:number}>, betsByUid:Map<string,Array<object>>, nextRound:number|null}} args
 */
function buildRoundRecapFacts({
  round, roundMatches, players, betsByUid, nextRound = null, udsatte = [], kalender = null,
}) {
  const roundIds = new Set(roundMatches.map((m) => m.id));
  const roundCtx = buildRoundContext(roundMatches);

  const rows = players.map((p) => {
    const bets = betsByUid.get(p.uid) || [];
    const roundBets = bets.filter((b) => roundIds.has(b.matchId));
    const betPts = roundBets.reduce((a, b) => a + (Number(b.points) || 0), 0);
    const combi = combiBonus(roundBets, roundCtx);
    const roundPoints = Math.round((betPts + combi) * 10) / 10;
    return {
      name: sanitizeName(p.name),
      points: Math.round((Number(p.totalPoints) || 0) * 10) / 10,
      roundPoints,
      combi: Math.round(combi * 10) / 10,
      rank: Number.isFinite(p.rank) ? p.rank : null,
      previousRank: Number.isFinite(p.previousRank) ? p.previousRank : null,
    };
  }).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.points - a.points);

  // Chancen — rundens mest personlige beslutning (opgave #29, spilførerens
  // plan-råd fulgt). Nettoen udledes med SAMME kilde som PointOpdeling
  // (points − 1X2-tip via outcomePoints), så væggen aldrig siger et andet tal
  // end fladen. Kun spillere fra `players` (ligaens medlemmer) — et navn uden
  // for ligaen er et brud på synlighedsmodellen OG en vits, ingen forstår.
  const chancer = [];
  for (const p of players) {
    for (const b of (betsByUid.get(p.uid) || [])) {
      if (!roundIds.has(b.matchId)) continue;
      const indsats = Math.floor(Number(b.chanceStake) || 0);
      if (indsats <= 0) continue;
      const info = roundCtx.byMatch[b.matchId];
      if (!info || !info.result) continue; // kampen er ikke afgjort endnu
      const tip = outcomePoints(b.pick, info.result, info.odds);
      const netto = Math.round(((Number(b.points) || 0) - tip) * 10) / 10;
      const m = roundMatches.find((x) => x.id === b.matchId);
      chancer.push({
        name: sanitizeName(p.name),
        kamp: m ? `${m.home}\u2013${m.away}` : null,
        valg: b.pick || null,
        // Spillerens frosne odds på sit valg — mod måles i odds, ikke i netto.
        odds: (info.odds && b.pick != null && Number.isFinite(Number(info.odds[b.pick])))
          ? Number(info.odds[b.pick]) : null,
        indsats,
        ramt: tip > 0,
        netto,
      });
    }
  }
  // Forudberegnet, som standout: "fremhæv den største" ER en udregning, og
  // dem må modellen ikke selv lave. null ved delt største (samme regel).
  const stoerste = (liste, bedreEnd) => {
    if (liste.length === 0) return null;
    const top = liste.reduce((a, b) => (bedreEnd(b, a) ? b : a));
    const delt = liste.filter((c) => c.netto === top.netto).length > 1;
    return delt ? null : { name: top.name, netto: top.netto };
  };
  const gevinster = chancer.filter((c) => c.netto > 0);
  const tab = chancer.filter((c) => c.netto < 0);
  const stoersteGevinst = stoerste(gevinster, (a, b) => a.netto > b.netto);
  const stoersteTab = stoerste(tab, (a, b) => a.netto < b.netto);

  const best = Math.max(0, ...rows.map((r) => r.roundPoints));
  const roundWinners = rows.filter((r) => r.roundPoints === best && best > 0).map((r) => r.name);
  const leader = rows.find((r) => r.rank === 1) || rows[0] || null;
  const prevLeader = rows.find((r) => r.previousRank === 1) || null;
  const leadChanged = !!(leader && prevLeader && leader.name !== prevLeader.name);

  return {
    round,
    matches: roundMatches.map((m) => {
      // Knockout ud over ordinær tid: "score" bliver stillingen efter
      // ordinær tid (dén, 1X2 afgøres af), og slutresultatet står for sig.
      // KUN når kampen har et gyldigt slut — en Superliga-kamp får ikke én
      // ny nøgle.
      const slut = kampSlut(m);
      // HVEM RAMTE X i en kamp, der gik i forlængelse (Spilfører c): dagens
      // bedste historie, og den kan kun fortælles af fakta — prompten må ikke
      // gætte. Kun ligaens medlemmer (`players`), i deres rækkefølge.
      const ramteX = slut
        ? players
          .filter((p) => (betsByUid.get(p.uid) || []).some((b) => b.matchId === m.id && b.pick === 'X'))
          .map((p) => sanitizeName(p.name))
        : null;
      return {
        home: m.home, away: m.away,
        score: (m.homeGoals != null && m.awayGoals != null) ? `${m.homeGoals}-${m.awayGoals}` : null,
        surprise: isSurprise(m),
        ...(slut ? {
          slut: `${slut.home}-${slut.away}`,
          afgjort: AFGJORT_NAVN[slut.afgjort],
          vinder: slut.home > slut.away ? m.home : m.away,
          ramteX,
        } : {}),
      };
    }),
    // De udsatte kampe SKAL med som eget felt. Uden dem får botten fire kampe,
    // tror det er hele runden, og skriver at den er færdigspillet — mens
    // Tip-fladen tre klik væk siger, at to kampe mangler.
    //
    // Filtreringen på !result bor HER og ikke i kaldstedet: en kamp rykket
    // FREM til ugen før ligger også uden for rundens uge, men den ER spillet,
    // og prompten fortæller modellen, at kampene i feltet mangler. Reglen
    // hører til det sted, der kan prøves af uden en database.
    udsatte: udsatte.filter((m) => !m.result).map((m) => ({ home: m.home, away: m.away })),
    standings: rows.map(({ name, points, roundPoints, rank }) => ({ name, points, roundPoints, rank })),
    standout: roundWinners.length === 1 ? roundWinners[0] : null,
    standoutTie: roundWinners.length > 1,
    roundWinners,
    combi: rows.filter((r) => r.combi > 0).map((r) => ({ name: r.name, bonus: r.combi })),
    leader: leader ? leader.name : null,
    previousLeader: prevLeader ? prevLeader.name : null,
    leadChanged,
    chancer,
    stoersteGevinst,
    stoersteTab,
    ingenChancer: chancer.length === 0,
    nextRound,
    // Kun i en turnering med fasekalender (kalenderFakta). Uden er det null,
    // og fakta har præcis de nøgler, de altid har haft.
    ...(kalender || {}),
  };
}

/**
 * Kald Claude med retries ved midlertidige fejl (samme mønster som Tour-botten).
 * `system` kan overstyres, så liga-spørgsmålenes afsløring (leagueQuestionRecap)
 * genbruger samme retry og model-kald med sin egen prompt — ét kaldested.
 */
async function generateRecapText(anthropic, facts, system = RECAP_SYSTEM) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 600,
        thinking: { type: 'adaptive' },
        system,
        messages: [{ role: 'user', content: JSON.stringify(facts) }],
      });
      return (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    } catch (err) {
      attempt += 1;
      const status = err?.status;
      const retryable = status === 429 || status === 500 || status === 503 || status === 529;
      if (retryable && attempt < 4) {
        await new Promise((r) => setTimeout(r, attempt * 5000));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Generér og post runde-opslaget for ét spil. Én tekst pr. spil (stillingen er
 * fælles), postet på ALLE spillets liga-vægge. Idempotent via game.recappedRounds.
 * @param {object} db Admin-Firestore
 * @param {object} FieldValue
 * @param {import('@anthropic-ai/sdk').default} anthropic klar klient (nøglen er tjekket af kalderen)
 * @param {string} gameId
 * @param {number|null} roundNo runde at skrive om; null = seneste helt afgjorte runde
 * @param {{dryRun?: boolean, now?: Date}} [opts]
 */
async function runGameRoundRecap(db, FieldValue, anthropic, gameId, roundNo = null, { dryRun = false } = {}) {
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) return { posted: 0, reason: 'no-game' };
  const game = gameSnap.data();
  if (game.aiRecaps === false) return { posted: 0, reason: 'disabled' };
  // EN UGYLDIG KALENDER SLÅR FRA — MEN IKKE TAVST. Uden gyldig kalender
  // regnes næste runde af de oprettede kampe, og efter den indledende runde
  // ville botten skrive "sæsonen er slut". Spillet kører videre på ligaens
  // tekster (bedre end halvt rigtige), men loggen siger hvorfor, og admin ser
  // det samme under Spil-tidsplan. Et spil UDEN faser-felt advarer ikke.
  const kalenderFejl = faseKalenderAdvarsel(game);
  if (kalenderFejl) {
    console.warn(`Runde-Botten ${gameId}: fasekalenderen er ugyldig — næste runde regnes af de oprettede kampe: ${kalenderFejl.join('; ')}`);
  }
  const matchesSnap = await gameRef.collection('matches').get();
  const alleKampe = matchesSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  // START-GATE. Samme sæt som pointgivningen bruger — botten må ikke skrive om
  // en runde, spillet ikke tæller. Den var før en dato-sammenligning her, og
  // kunne dermed komme til at referere en HALV runde.
  const gatede = gatedeKampe(alleKampe, startRundeFor(game, alleKampe));
  const all = alleKampe.filter((m) => !gatede.has(m.id));

  // Find runden: angivet, ellers den SENESTE runde hvor alle kampe har facit.
  const byRound = new Map();
  for (const m of all) {
    if (m.round == null) continue;
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round).push(m);
  }
  // "Afgjort" måles på KUPONEN, ikke på hele runden — samme kriterium som
  // afregningen og combi-bonussen bruger. Havde botten sin egen definition,
  // ville gameScoring snapshotte runden 10. august og brænde
  // snapshottedRounds, mens botten svarede "round-not-settled" og tav. Runden
  // ville aldrig få sit opslag, og ingen ville opdage det.
  const ctx = buildRoundContext(all);
  const kuponAfgjort = (r) => {
    const rc = ctx.rounds[r];
    return !!rc && rc.combiCount > 0 && rc.combiSettled === rc.combiCount;
  };
  const settledRounds = [...byRound.keys()].filter(kuponAfgjort).sort((a, b) => a - b);
  const round = roundNo != null ? roundNo : (settledRounds[settledRounds.length - 1] ?? null);
  if (round == null) return { posted: 0, reason: 'no-settled-round' };
  if (!kuponAfgjort(round)) return { posted: 0, reason: 'round-not-settled', round };
  // Botten får KUN kuponens kampe. Serverede vi de udsatte med, ville den få
  // to kampe uden resultat uden en forklaring — og digte en.
  const alleIRunden = byRound.get(round) || [];
  const roundMatches = alleIRunden.filter((m) => ctx.byMatch[m.id]?.iVindue);
  // Dem, der IKKE er på kuponen — botten skal kunne sige, at de mangler.
  // Dem, der IKKE er på kuponen. buildRoundRecapFacts frasorterer selv dem,
  // der allerede er spillet.
  const udsatte = alleIRunden.filter((m) => !ctx.byMatch[m.id]?.iVindue);

  const done = Array.isArray(game.recappedRounds) ? game.recappedRounds : [];
  if (!dryRun && done.includes(round)) return { posted: 0, reason: 'already', round };

  // Spillerne, deres navne, og KUN rundens tips. (Botten regner udelukkende på
  // rundens kampe, så hverken hele bet-samlingen eller hele brugerkartoteket
  // skal hentes — det ville vokse med hele sæsonen.)
  const playersSnap = await gameRef.collection('players').get();
  // Forladte spillere tæller ikke med i rundens opsamling.
  const playerUids = aktiveSpillere(playersSnap.docs).map((d) => d.id);
  if (playerUids.length < 2) return { posted: 0, reason: 'too-few-players', round };

  const [userDocs, ...betSnaps] = await Promise.all([
    db.getAll(...playerUids.map((uid) => db.collection('users').doc(uid))),
    ...chunk(roundMatches.map((m) => m.id), IN_CHUNK)
      .map((ids) => gameRef.collection('bets').where('matchId', 'in', ids).get()),
  ]);
  const nameOf = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data().displayName]));
  // Samme filter som playerUids: en forladt spiller må ikke snige sig ind i
  // ligaens stilling via memberUids (hun står der, til syncPlayerLeagues har
  // set ligaen ændre sig — og i testen for evigt).
  const players = aktiveSpillere(playersSnap.docs).map((d) => ({
    ...d.data(), uid: d.id, name: nameOf.get(d.id) || 'Spiller',
  }));
  const betsByUid = new Map();
  for (const snap of betSnaps) {
    for (const d of snap.docs) {
      const b = d.data();
      if (!b.uid) continue;
      if (!betsByUid.has(b.uid)) betsByUid.set(b.uid, []);
      betsByUid.get(b.uid).push(b);
    }
  }

  // NÆSTE RUNDE. I en liga er det den næste OPRETTEDE runde. I en turnering
  // med fasekalender er det kalenderens næste dag — også når dens kampe ikke
  // findes endnu. Uden det sagde botten "sæsonen er slut" efter den
  // indledende runde, fordi hovedrundens kampe først oprettes, når holdene
  // kendes (QC, blokerende fund 2).
  const nextRound = harFaseKalender(game)
    ? naesteKalenderRunde(game, round)
    : (settledRounds.length && byRound.size
      ? ([...byRound.keys()].sort((a, b) => a - b).find((r) => r > round) ?? null)
      : null);
  const kalender = kalenderFakta(game, round, roundMatches, new Set(byRound.keys()));
  const system = recapSystem(game);

  // ÉT OPSLAG PR. LIGA — ikke ét pr. spil.
  //
  // Før byggede vi fakta af HELE spillets spillere, kaldte modellen én gang og
  // sendte samme tekst til hver ligavæg. Så stod der navne og point på
  // "Familien"s væg fra folk, dens syv medlemmer ikke deler liga med — og
  // opslaget påstod, at én førte med 40 point, mens ligaens egen stilling
  // viste en anden i spidsen. Det brød hele spillets synlighedsmodel: du ser
  // dem, du deler liga med, og intet andet.
  const leaguesSnap = await gameRef.collection('leagues').get();
  const perUid = new Map(players.map((p) => [p.uid, p]));
  const udkast = [];
  let posted = 0;
  for (const ld of leaguesSnap.docs) {
    const memberUids = Array.isArray(ld.data().memberUids) ? ld.data().memberUids : [];
    // Ligaens medlemmer, der FAKTISK er spillere i spillet. Et medlem uden
    // spiller-dokument har ingen point at skrive om.
    const rawMedlemmer = memberUids.map((uid) => perUid.get(uid)).filter(Boolean);
    if (rawMedlemmer.length < 2) continue;

    // LIGAENS EGEN STARTRUNDE. En runde før den findes ikke for ligaen:
    // botten må hverken skrive om den eller regne dens point med. Uden
    // vagten ville "Kontoret" (fra runde 20) få et opslag om runde 3 med
    // point, ligaens stilling ikke indeholder.
    const ligaStart = Number.isFinite(ld.data().startRound) ? ld.data().startRound : null;
    if (ligaStart != null && round < ligaStart) continue;
    // Totalen på ligaens skala: summen af runde-vektoren fra ligaens start,
    // med puljen efter dens egen regel — samme modul som fladen bruger.
    // Puljegrænsen er SPILLETS (en turnerings dage er ikke en ligas uger).
    const puljeMaks = puljeMaksStartRunde(game);
    // Pilene ("overtog føringen") skal regnes på LIGAENS skala — spillets
    // previousRank er en anden. Før-stillingen er ligaens total UDEN den
    // aktuelle runde, af samme vektor: nøjagtig det greb, fladen bruger
    // (`ligaRanking`/`fjernRunde`), bare her.
    // SAMME VAGT SOM FLADEN. `harRundeVektor` spørger kun, om feltet findes;
    // en vektor, der mangler runder, ville give en for lav ligatotal — og
    // her ender det tal i en besked, der POSTES til hele ligaen. Se
    // vektorStemmer.
    const klarNok = (p) => harRundeVektor(p.perRound)
      && vektorStemmer(p.perRound, p.totalPoints, p.bonusPoints || 0);
    const foerTotal = (p) => {
      if (!klarNok(p)) return null;
      const uden = {};
      for (const [k, v] of Object.entries(p.perRound)) {
        if (Number(k) === round) continue;
        uden[k] = v;
      }
      return ligaPoint(uden, ligaStart, p.bonusPoints || 0, puljeMaks);
    };
    let medlemmer = rawMedlemmer;
    if (ligaStart != null) {
      const omregnede = rawMedlemmer.map((p) => ({
        ...p,
        totalPoints: klarNok(p)
          ? ligaPoint(p.perRound, ligaStart, p.bonusPoints || 0, puljeMaks)
          : 0,
        _foer: foerTotal(p),
      }));
      // Før-rang på ligaens skala. Spillere uden vektor får ingen pil.
      const medFoer = omregnede.filter((p) => p._foer != null)
        .sort((a, b) => (b._foer - a._foer) || String(a.uid).localeCompare(String(b.uid)));
      const foerRang = new Map();
      let r = 0;
      let sidst = null;
      medFoer.forEach((p, i) => {
        if (p._foer !== sidst) { r = i + 1; sidst = p._foer; }
        foerRang.set(p.uid, r);
      });
      medlemmer = omregnede.map((p) => ({
        ...p, previousRank: foerRang.get(p.uid) ?? null, _foer: undefined,
      }));
    }

    const facts = buildRoundRecapFacts({
      round,
      roundMatches,
      // Rangen regnes INDEN FOR ligaen. players/{uid}.rank er spil-globalt og
      // ville give "nr. 1, nr. 4, nr. 7" i en liga på syv.
      players: lokaleRanger(medlemmer),
      betsByUid,
      nextRound,
      udsatte,
      kalender,
    });
    const text = await generateRecapText(anthropic, facts, system);
    if (!text) continue;

    if (dryRun) {
      udkast.push({ leagueId: ld.id, navn: ld.data().name || ld.id, medlemmer: medlemmer.length, text });
      continue;
    }
    await ld.ref.collection('messages').add({
      uid: 'runde-bot',
      displayName: 'Runde-Botten',
      avatarEmoji: '🤖',
      system: true,
      // Rundenummeret PÅ beskeden. Uden det kan et opslag ikke findes igen.
      // Da de allerførste opslag skulle tages ned, fandtes feltet ikke, og de
      // måtte afgrænses på `createdAt` mod tidspunktet for en udrulning — et
      // groft snit, der ikke kan skelne to opslag fra samme dag. Med feltet
      // her kan en fremtidig nedtagning ramme præcist på runde.
      round,
      text,
      createdAt: FieldValue.serverTimestamp(),
    });
    posted += 1;
  }
  if (dryRun) return { posted: 0, dryRun: true, round, udkast };
  await gameRef.set({ recappedRounds: FieldValue.arrayUnion(round) }, { merge: true });
  return { posted, round };
}

module.exports = {
  RECAP_SYSTEM, sanitizeName, isSurprise, buildRoundRecapFacts, generateRecapText, runGameRoundRecap,
  recapSystem, kalenderFakta, KALENDER_UDSKIFTNING, KNOCKOUT_ANKER,
};
