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

// 'in' tager højst 30 værdier pr. forespørgsel.
const IN_CHUNK = 30;

/** Del en liste i grupper af højst `size`. */
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const RECAP_SYSTEM = `Du er "Runde-Botten", som skriver ét kort, varmt opslag på dansk til en privat fodbold-tippeliga, lige efter kampene i en Superliga-rundes egen uge er spillet.
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
- "nextRound": næste rundes nummer (kan mangle, hvis sæsonen er slut).

Ufravigelige regler:
- "points" betyder ALTID totalen; "roundPoints" betyder ALTID pointene i denne runde. Forveksl dem ALDRIG.
- Feltnavnene er INTERNE: skriv ALDRIG "roundPoints", "standout" el.lign. i teksten — skriv naturligt dansk ("8 point i runden", "i alt 31 point").
- Skriv kun at nogen "overhalede"/"tog førstepladsen", hvis "leadChanged" er true. Ellers kan du skrive at lederen "fører stadig".
- Slut gerne med en lille optakt: mind om at tippe næste runde, hvis "nextRound" findes.

Tone over for rundens bedste:
- Er "standoutTie" false (ÉN klar rundevinder = "standout"), så lykønsk vedkommende med et glimt i øjet — gerne let drillende og hoverende på en venlig, humoristisk måde (en kærlig stikpille til de andre om at hænge på). Godmodigt, aldrig hånligt.
- Er "standoutTie" true, så hold tonen neutral og varm: nævn "roundWinners" ligeværdigt og undlad at drille nogen.`;

/**
 * Rens et spiller-navn før det lægges i AI-fakta (værn mod prompt-injection via
 * frit displayName — fjerner kontroltegn/kontekst-brydende tegn, klipper længde).
 */
function sanitizeName(name) {
  const s = String(name == null ? '' : name)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[<>{}[\]`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = s.slice(0, 40).trim();
  return cut || 'Spiller';
}

/** ms fra Firestore-Timestamp | tal | ISO. */
function toMs(k) {
  if (k == null) return null;
  if (typeof k === 'number') return k;
  if (typeof k === 'string') { const n = Date.parse(k); return Number.isNaN(n) ? null : n; }
  if (typeof k.toMillis === 'function') return k.toMillis();
  if (k.seconds != null) return k.seconds * 1000;
  return null;
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
  round, roundMatches, players, betsByUid, nextRound = null, udsatte = [],
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

  const best = Math.max(0, ...rows.map((r) => r.roundPoints));
  const roundWinners = rows.filter((r) => r.roundPoints === best && best > 0).map((r) => r.name);
  const leader = rows.find((r) => r.rank === 1) || rows[0] || null;
  const prevLeader = rows.find((r) => r.previousRank === 1) || null;
  const leadChanged = !!(leader && prevLeader && leader.name !== prevLeader.name);

  return {
    round,
    matches: roundMatches.map((m) => ({
      home: m.home, away: m.away,
      score: (m.homeGoals != null && m.awayGoals != null) ? `${m.homeGoals}-${m.awayGoals}` : null,
      surprise: isSurprise(m),
    })),
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
    nextRound,
  };
}

/** Kald Claude med retries ved midlertidige fejl (samme mønster som Tour-botten). */
async function generateRecapText(anthropic, facts) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 600,
        thinking: { type: 'adaptive' },
        system: RECAP_SYSTEM,
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
  const startMs = toMs(game.startAt);

  const matchesSnap = await gameRef.collection('matches').get();
  const all = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => {
      const k = toMs(m.kickoff);
      return startMs == null || k == null || k >= startMs; // start-gate
    });

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
  const playerUids = playersSnap.docs.map((d) => d.id);
  if (playerUids.length < 2) return { posted: 0, reason: 'too-few-players', round };

  const [userDocs, ...betSnaps] = await Promise.all([
    db.getAll(...playerUids.map((uid) => db.collection('users').doc(uid))),
    ...chunk(roundMatches.map((m) => m.id), IN_CHUNK)
      .map((ids) => gameRef.collection('bets').where('matchId', 'in', ids).get()),
  ]);
  const nameOf = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data().displayName]));
  const players = playersSnap.docs.map((d) => ({
    uid: d.id, name: nameOf.get(d.id) || 'Spiller', ...d.data(),
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

  const nextRound = settledRounds.length && byRound.size
    ? ([...byRound.keys()].sort((a, b) => a - b).find((r) => r > round) ?? null)
    : null;

  const facts = buildRoundRecapFacts({
    round, roundMatches, players, betsByUid, nextRound, udsatte,
  });
  const text = await generateRecapText(anthropic, facts);
  if (!text) return { posted: 0, reason: 'empty-text', round };

  if (dryRun) return { posted: 0, dryRun: true, round, text };

  const leaguesSnap = await gameRef.collection('leagues').get();
  let posted = 0;
  for (const ld of leaguesSnap.docs) {
    const memberUids = Array.isArray(ld.data().memberUids) ? ld.data().memberUids : [];
    if (memberUids.length < 2) continue;
    await ld.ref.collection('messages').add({
      uid: 'runde-bot',
      displayName: 'Runde-Botten',
      avatarEmoji: '🤖',
      system: true,
      text,
      createdAt: FieldValue.serverTimestamp(),
    });
    posted += 1;
  }
  await gameRef.set({ recappedRounds: FieldValue.arrayUnion(round) }, { merge: true });
  return { posted, round, text };
}

module.exports = {
  RECAP_SYSTEM, sanitizeName, isSurprise, buildRoundRecapFacts, generateRecapText, runGameRoundRecap,
};
