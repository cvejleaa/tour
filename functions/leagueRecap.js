'use strict';
// ---------------------------------------------------------------------------
// leagueRecap.js — ren logik til AI-genererede morgenopslag på liga-væggen.
// Selve AI-kaldet (Anthropic) og Firestore-adgangen ligger i index.js; her er
// kun det testbare: liga-scoring, fakta-opbygning og system-prompten.
// ---------------------------------------------------------------------------

const RECAP_SYSTEM = `Du er "VM-Botten", som skriver ét kort, varmt morgenopslag på dansk til en privat VM 2026-tippeliga.
Skriv 70-150 ord i naturlig, sammenhængende prosa (ikke punktopstilling, ingen overskrift, ingen anførselstegn). Brug 1-2 emojis.

Du får et JSON-faktaobjekt. Du må KUN bruge de oplyste fakta og tal. Find ALDRIG på navne, kampe, resultater, point eller placeringer, og lav ALDRIG dine egne udregninger.

Felterne betyder:
- "matches": kampene spillet SIDEN sidste opslag (med resultat) — beskriv kun dem.
- "bonusResolved": bonus-/ekstraspørgsmål der er blevet AFGJORT siden sidste opslag (kan være tom). Hvert element har "type" ("topScorer" = topscorer, "groupWinner" = gruppevinder), "label" (selve spørgsmålet) og "facit" (det rigtige svar; for "groupWinner" er facit en FIFA-landekode — brug det danske landenavn). Nævn dem kort og naturligt, hvis der er nogen.
- "standings": den AKTUELLE samlede stilling NU (nattens point er allerede lagt til). For hver spiller er "points" deres TOTALE pointtal, og "dayPoints" er hvad de har vundet siden sidste opslag. Bemærk: "dayPoints" kan stamme fra både kampe OG afgjorte bonusspørgsmål — ikke kun kampe.
- "standout": spilleren med FLEST "dayPoints" siden sidste opslag. "dayPoints" = nattens udbytte, "points" = vedkommendes nuværende total.
- "standoutTie": true hvis FLERE spillere deler nattens bedste score (se "dayWinners"). "leader": fører lige nu. "previousLeader": hvem der førte ved sidste opslag. "leadChanged": true hvis førstepladsen har skiftet.

Ufravigelige regler:
- "points" betyder ALTID totalen; "dayPoints" betyder ALTID nattens point. Forveksl dem ALDRIG. Når du nævner en total, så brug "points"; når du nævner nattens udbytte, så brug "dayPoints".
- Skriv kun at nogen "overhalede"/"tog førstepladsen", hvis "leadChanged" er true. Er "leadChanged" false, kan du skrive at lederen "fører stadig".
- Hold er FIFA-landekoder (fx BRA=Brasilien, ARG=Argentina, DEN=Danmark) — brug de danske landenavne.
- Er BÅDE "matches" og "bonusResolved" tomme (intet nyt siden sidst), så skriv en kort, opmuntrende god-morgen-hilsen og mind venligt om at få tippet dagens kampe. Er "matches" tom, men "bonusResolved" har noget, så skriv om de afgjorte spørgsmål og de point, de gav (brug "dayPoints"/"standout" som altid).
- Slut gerne med en lille optakt til dagens kampe, hvis "upcoming" har nogle.

Tone over for dagens topscorer:
- Er "standoutTie" false (ÉN klar dagsvinder = "standout"), så lykønsk vedkommende med et glimt i øjet — du må gerne være let drillende og hoverende på en venlig, humoristisk måde (en kærlig stikpille til de andre om at hænge på). Hold det godmodigt, aldrig hånligt eller personligt.
- Er "standoutTie" true (flere deler nattens bedste, se "dayWinners"), så hold tonen neutral og varm: nævn dem ligeværdigt og undlad at drille nogen.`;

/**
 * Minimal liga-scoring (spejler leagueScore i frontend; uden liga-bonus, som
 * beregnes klient-side). Bruges til at finde totaler og lederen i recap'en.
 */
function leagueTotal(user, scoring) {
  const s = scoring || {};
  const on = (k) => s[k] !== false; // mangler feltet ⇒ tæller (default til)
  let t = 0;
  if (on('group')) t += Number(user?.groupPoints || 0);
  if (on('knockout')) t += Number(user?.knockoutPoints || 0) * (s.doubleKnockout ? 2 : 1);
  if (on('bonus')) t += Number(user?.bonusPoints || 0);
  return t;
}

/** Er en runde knockout (alt undtagen 'group')? */
function isKnockoutRound(round) {
  return !!round && round !== 'group';
}

/**
 * Point en spiller får for ÉN kamp i en given liga, med ligaens scoring-regler
 * påført (gruppe/knockout til/fra + dobbelt-knockout). Bruges til at gøre
 * "dayPoints" konsistent med totalen (leagueTotal) — samme grundlag.
 * @param {number} rawPoints  rå tip-point for kampen (bet.points)
 * @param {string} round      kampens runde ('group' | 'r32' | ...)
 * @param {object} scoring    ligaens scoring-objekt
 * @returns {number}
 */
function leagueMatchPoints(rawPoints, round, scoring) {
  const s = scoring || {};
  const on = (k) => s[k] !== false;
  const p = Number(rawPoints || 0);
  if (isKnockoutRound(round)) return on('knockout') ? p * (s.doubleKnockout ? 2 : 1) : 0;
  return on('group') ? p : 0;
}

/**
 * Rekonstruér medlemmernes point-nedbrydning, som den var op til et bestemt
 * tidspunkt (untilMs), ud fra de kampe der var spillet til da. Bruges til at
 * genskrive gamle opslag med datidens stilling (bonus tælles ikke med — den er
 * forsvindende i gruppespillet).
 * @param {Array<{id:string, displayName?:string}>} memberDocs
 * @param {Array<{id:string, round:string, kickoffMs:number}>} finished  alle spillede kampe
 * @param {Object<string, Object<string, number>>} pointsByMatchUid  matchId → (uid → rå point)
 * @param {number} untilMs  kun kampe med kickoff <= untilMs tæller med
 */
function historicalMembers(memberDocs, finished, pointsByMatchUid, untilMs) {
  return (memberDocs || []).map((u) => {
    let groupPoints = 0;
    let knockoutPoints = 0;
    for (const m of finished || []) {
      if (m.kickoffMs > untilMs) continue;
      const raw = Number((pointsByMatchUid[m.id] || {})[u.id] || 0);
      if (isKnockoutRound(m.round)) knockoutPoints += raw;
      else groupPoints += raw;
    }
    return { id: u.id, displayName: u.displayName || 'Spiller', groupPoints, knockoutPoints, bonusPoints: 0 };
  });
}

/**
 * Point pr. spiller for et sæt kampe (fx vinduet siden sidste opslag), med
 * ligaens scoring-regler påført — samme grundlag som totalen.
 * @param {string[]} memberIds
 * @param {Array<{id:string, round:string}>} windowMatches
 * @param {Object<string, Object<string, number>>} pointsByMatchUid
 * @param {object} scoring
 * @returns {Object<string, number>} uid → dayPoints
 */
function windowDayPoints(memberIds, windowMatches, pointsByMatchUid, scoring) {
  const dayPointsByUid = {};
  for (const m of windowMatches || []) {
    const map = pointsByMatchUid[m.id] || {};
    for (const uid of memberIds || []) {
      const pts = leagueMatchPoints(map[uid], m.round, scoring);
      if (pts) dayPointsByUid[uid] = (dayPointsByUid[uid] || 0) + pts;
    }
  }
  return dayPointsByUid;
}

/** Saml fakta-objektet (kun tal/navne) som Claude skriver prosa ud fra. */
function buildRecapFacts({ league, members, dayPointsByUid = {}, matches = [], bonusResolved = [], upcoming = [], now = new Date() }) {
  const date = now.toLocaleDateString('da-DK', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Copenhagen',
  });
  const scoring = league && league.scoring ? league.scoring : null;

  // Én fælles kilde: hver spillers total NU og point vundet siden sidste opslag.
  // points = total (allerede inkl. dayPoints), dayPoints = vundet siden sidst.
  const rows = members.map((u) => ({
    name: u.displayName || 'Spiller',
    points: leagueTotal(u, scoring),
    dayPoints: Number(dayPointsByUid[u.id] || 0),
  }));

  const byTotal = [...rows].sort((a, b) => b.points - a.points);
  const standings = byTotal.slice(0, 6).map((r, i) => ({
    rank: i + 1, name: r.name, points: r.points, dayPoints: r.dayPoints,
  }));

  // Stilling FØR dette døgns point (total minus dayPoints) → hvem førte sidst.
  const byPrev = [...rows].sort((a, b) => (b.points - b.dayPoints) - (a.points - a.dayPoints));
  const previousLeader = byPrev.length ? byPrev[0].name : null;
  const leader = byTotal.length ? { name: byTotal[0].name, points: byTotal[0].points } : null;
  const leadChanged = !!(leader && previousLeader && previousLeader !== leader.name);

  const dayPoints = rows
    .filter((r) => r.dayPoints > 0)
    .sort((a, b) => b.dayPoints - a.dayPoints)
    .map((r) => ({ name: r.name, dayPoints: r.dayPoints }));

  // Nattens topscore kan deles af flere → så skal tonen være neutral (ikke drillende).
  const maxDay = dayPoints.length ? dayPoints[0].dayPoints : 0;
  const dayWinners = dayPoints.filter((r) => r.dayPoints === maxDay).map((r) => r.name);
  const standoutTie = dayWinners.length > 1;

  let standout = null;
  if (dayPoints.length) {
    const top = byTotal.find((r) => r.name === dayPoints[0].name) || dayPoints[0];
    const rank = byTotal.findIndex((r) => r.name === dayPoints[0].name) + 1;
    standout = { name: dayPoints[0].name, dayPoints: dayPoints[0].dayPoints, points: top.points, rank };
  }

  return {
    leagueName: (league && league.name) || 'ligaen',
    date,
    matches,
    bonusResolved,
    standings,
    dayPoints,
    standout,
    standoutTie,
    dayWinners,
    leader,
    previousLeader,
    leadChanged,
    upcoming,
    memberCount: members.length,
  };
}

/** Standard-tidspunkt for AI-morgenopslaget (kan overstyres i config/settings). */
const RECAP_DEFAULT_TIME = '08:15';

/** 'HH:MM' → minutter siden midnat, ellers null ved ugyldigt format. */
function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s == null ? '' : s).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Er det aktuelle klokkeslæt inden for opslags-vinduet [target, target+window)?
 * Begge tidspunkter er 'HH:MM' (lokal tid). Bruges til at lade en hyppig cron
 * ramme et admin-valgt tidspunkt uden at gen-deploye.
 * @param {string} currentHM  nuværende 'HH:MM'
 * @param {string} targetHM   ønsket 'HH:MM'
 * @param {number} [windowMin] vinduets længde i minutter (default 60)
 * @returns {boolean}
 */
function recapWindowOpen(currentHM, targetHM, windowMin = 60) {
  const cur = parseHM(currentHM);
  const tgt = parseHM(targetHM);
  if (cur == null || tgt == null) return false;
  return cur >= tgt && cur < tgt + windowMin;
}

module.exports = {
  RECAP_SYSTEM, RECAP_DEFAULT_TIME, leagueTotal, leagueMatchPoints,
  isKnockoutRound, historicalMembers, windowDayPoints,
  buildRecapFacts, parseHM, recapWindowOpen,
};
