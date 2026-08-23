// ---------------------------------------------------------------------------
// functions-platform/reminders.js — per-spil tip-påmindelser via e-mail.
// For ét spil: find kampe med kickoff inden for det næste døgn (stadig
// tippelige), og mail de deltagere der mangler at tippe på dem.
// ---------------------------------------------------------------------------
const { escapeHtml, sendEmail, emailByUidMap, APP_URL } = require('./mailer');
// Samme gate som pointgivningen — en spiller må aldrig rykkes for en kamp,
// der ikke giver point.
const { gatedeKampe, startRundeFor } = require('./startGate');
const { kickoffMs } = require('./pointOpdeling');

const DAY_MS = 24 * 3600 * 1000;
// 'in' tager højst 30 værdier pr. forespørgsel.
const IN_CHUNK = 30;

/** Del en liste i grupper af højst `size`. */
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Millisekunder fra et Firestore-Timestamp | tal | ISO-streng. */
// `toMillis` stod her som en fjerde håndskrevet kopi. Begge brugssteder
// spurgte om en KAMPS kickoff, og det er præcis, hvad `kickoffMs` svarer på.

/**
 * Kampe i (now, now+24h) der stadig kan tippes (kickoff i fremtiden).
 * Kampe FØR spillets startrunde tælles ikke med — de vises ikke i appen og
 * giver ingen point, så der skal heller ikke rykkes for dem.
 *
 * `gatede` er et sæt af match-id'er, ikke et tidspunkt. Gaten er den samme som
 * pointgivningens (`startGate`), så en spiller aldrig kan blive rykket for en
 * kamp, der ikke giver point.
 * @param {Array<object>} matches
 * @param {Date} now
 * @param {Date} windowEnd
 * @param {Set<string>|null} [gatede]
 */
function upcomingMatches(matches, now, windowEnd, gatede = null) {
  return matches.filter((m) => {
    const k = kickoffMs(m);
    if (k == null) return false;
    if (gatede && gatede.has(m.id)) return false;
    return k > now.getTime() && k < windowEnd.getTime();
  });
}

/**
 * Kør påmindelser for ét spil.
 * Returnerer { sent, fejlede, reason?, upcoming, members }.
 * `fejlede` = modtagere hvor sendEmail kastede: uden det tal er "sent: 0" ved
 * totalt SMTP-nedbrud uskelneligt fra "alle har tippet" — præcis den tavse
 * fejl, driftkortet findes for at vise (arkitekt-forbehold på planen).
 * No-op'er pænt uden transporter (mangler SMTP_PASSWORD).
 */
async function runGameTipReminders(db, transporter, gameId, now = new Date()) {
  if (!transporter) return { sent: 0, fejlede: 0, reason: 'no-smtp-password' };
  const windowEnd = new Date(now.getTime() + DAY_MS);
  const gameRef = db.collection('games').doc(gameId);

  // Spillets startrunde afgør hvad der overhovedet er i spil.
  const [gameSnap, matchesSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('matches').get(),
  ]);
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const gatede = gatedeKampe(matches, startRundeFor(gameSnap.exists ? gameSnap.data() : null, matches));
  const upcoming = upcomingMatches(matches, now, windowEnd, gatede);
  if (upcoming.length === 0) return { sent: 0, fejlede: 0, reason: 'no-matches' };
  const upcomingIds = new Set(upcoming.map((m) => m.id));

  const playersSnap = await gameRef.collection('players').get();
  const memberUids = playersSnap.docs.map((d) => d.id);
  if (memberUids.length === 0) return { sent: 0, fejlede: 0, reason: 'no-members' };

  // uid → Set(matchId) af tippede kommende kampe. Hent KUN tips på de kampe der
  // er i vinduet ('in' tager 30 værdier, og en runde har langt færre) — ellers
  // ville en daglig påmindelse læse hvert eneste tip i hele sæsonen.
  const betByUid = new Map();
  for (const ids of chunk([...upcomingIds], IN_CHUNK)) {
    const snap = await gameRef.collection('bets').where('matchId', 'in', ids).get();
    for (const d of snap.docs) {
      const b = d.data();
      if (!b || !b.uid) continue;
      if (!betByUid.has(b.uid)) betByUid.set(b.uid, new Set());
      betByUid.get(b.uid).add(b.matchId);
    }
  }

  const emails = await emailByUidMap(db);
  // Kun deltagernes profiler — ikke hele brugerkartoteket.
  const userDocs = await db.getAll(...memberUids.map((uid) => db.collection('users').doc(uid)));
  const userById = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));
  const gameName = (gameSnap.exists && gameSnap.data().name) || 'spillet';

  let sent = 0;
  let fejlede = 0;
  for (const uid of memberUids) {
    const u = userById.get(uid) || {};
    const email = emails.get(uid);
    if (!email || u.emailOptOut) continue;
    const tipped = betByUid.get(uid) || new Set();
    const missing = upcoming.filter((m) => !tipped.has(m.id));
    if (missing.length === 0) continue;

    const list = missing.map((m) => `<li>${escapeHtml(m.home || '')} – ${escapeHtml(m.away || '')}</li>`).join('');
    const n = missing.length;
    const html = `
      <p>Hej ${escapeHtml(u.displayName || 'spiller')} 👋</p>
      <p>Du mangler at tippe på <strong>${n}</strong> kamp${n === 1 ? '' : 'e'} i ${escapeHtml(gameName)} det næste døgn:</p>
      <ul>${list}</ul>
      <p><a href="${APP_URL}">Afgiv dine tips på tip.vejleaa.dk</a> inden kampstart.</p>
      <p style="color:#888;font-size:12px">Du kan slå påmindelser fra på din profilside.</p>`;
    try {
      await sendEmail(db, transporter, {
        to: email,
        subject: `Du mangler at tippe på ${n} kamp${n === 1 ? '' : 'e'} det næste døgn`,
        html,
        type: 'reminder',
      });
      sent += 1;
    } catch (e) {
      fejlede += 1;
      console.error(`gameTipReminders(${gameId}): kunne ikke sende til ${email}:`, e && e.message);
    }
  }
  return { sent, fejlede, gameId, upcoming: upcoming.length, members: memberUids.length };
}

/**
 * Oversæt én kørsels udfald til driftkortets linje: { niveau, besked, tal? }.
 * REN funktion — hele afbildningen kan mutationstestes uden Firestore.
 *
 * Pausens niveau er BETINGET (spilfører-krav): pause + kampe inden for det
 * næste døgn = rødt, for dér koster pausen nogen en runde; en pause i en
 * landsholdspause er harmløs og kun gul. Sådan kan en GLEMT pause ikke ligge
 * stille i ugevis — kortet bliver rødt præcis den morgen, det gælder.
 */
function paamindelsesLinje({ paused = false, harSmtp = true, resultat = null, fejl = null } = {}) {
  if (fejl != null) {
    return { niveau: 'fejl', besked: `Kørslen fejlede: ${fejl}` };
  }
  if (!harSmtp) {
    return { niveau: 'fejl', besked: 'SMTP_PASSWORD er ikke sat — der kan ikke sendes påmindelser.' };
  }
  if (paused) {
    const kommende = resultat?.upcoming ?? 0;
    if (kommende > 0) {
      return {
        niveau: 'fejl',
        besked: `Spillet er sat på pause, og der ER ${kommende} kamp${kommende === 1 ? '' : 'e'} inden for det næste døgn `
          + '— deltagerne får ingen påmindelse og kan misse deadline. Genoptag under 🔔 Påmindelser.',
      };
    }
    return {
      niveau: 'advarsel',
      besked: 'Spillet er sat på pause — der sendes ingen påmindelser. Genoptages under 🔔 Påmindelser.',
    };
  }
  if (resultat?.reason === 'no-matches') {
    return { niveau: 'ok', besked: 'Ingen kampe inden for det næste døgn — ingen at rykke.' };
  }
  if (resultat?.reason === 'no-members') {
    return { niveau: 'ok', besked: 'Spillet har ingen deltagere endnu.' };
  }
  const { sent = 0, fejlede = 0, upcoming = 0, members = 0 } = resultat || {};
  const tal = { sent, fejlede, upcoming, members };
  if (fejlede > 0) {
    // Delvist nedbrud er gult, totalt er rødt — "Sendte 0" med grønt kort var
    // netop den tavse fejl, kortet findes for (arkitekt-forbehold, QC-krav).
    return {
      niveau: sent > 0 ? 'advarsel' : 'fejl',
      besked: `${fejlede} af ${sent + fejlede} påmindelser kunne ikke sendes (${sent} sendt, `
        + `${upcoming} kommende kampe, ${members} deltagere) — se functions-loggen.`,
      tal,
    };
  }
  if (sent === 0) {
    // sent: 0 er OGSÅ det normale "alle har tippet" — det må aldrig dele
    // ordlyd med et nedbrud (QC-fund på planen).
    return { niveau: 'ok', besked: `Ingen manglede at tippe (${upcoming} kommende kampe, ${members} deltagere).`, tal };
  }
  return {
    niveau: 'ok',
    besked: `Sendte ${sent} påmindelse${sent === 1 ? '' : 'r'} (${upcoming} kommende kampe, ${members} deltagere).`,
    tal,
  };
}

/**
 * Kør påmindelser for ÉT spil og oversæt udfaldet til driftkortets linje —
 * fanger sin EGEN fejl, så jobbet i index.js kan skrive status både ved succes
 * og nedbrud (fjernes try/catch her, bliver testen med den kastende kørsel
 * rød). For et pauset spil køres INTET, men kampvinduet tælles alligevel op,
 * så linjen kan afgøre, om pausen koster nogen en runde lige nu.
 * `deps._koer` er kun til test-injektion (kastende kørsel).
 */
async function koerPaamindelserForSpil(db, transporter, game, { now = new Date(), _koer = runGameTipReminders } = {}) {
  try {
    if (!transporter) return paamindelsesLinje({ harSmtp: false });
    if (game.paused) {
      const gameRef = db.collection('games').doc(game.id);
      const [gameSnap, matchesSnap] = await Promise.all([gameRef.get(), gameRef.collection('matches').get()]);
      const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const gatede = gatedeKampe(matches, startRundeFor(gameSnap.exists ? gameSnap.data() : null, matches));
      const upcoming = upcomingMatches(matches, now, new Date(now.getTime() + DAY_MS), gatede);
      return paamindelsesLinje({ paused: true, resultat: { upcoming: upcoming.length } });
    }
    const resultat = await _koer(db, transporter, game.id, now);
    return paamindelsesLinje({ resultat });
  } catch (e) {
    return paamindelsesLinje({ fejl: (e && e.message) || String(e) });
  }
}

/**
 * Tip-status for ÉN runde — admin-fladens "Hvem mangler at tippe?" (opgave #37).
 *
 * REN funktion: alle beslutninger bor her, så de kan mutationstestes.
 * Grænsen (QC/spilfører på planen): output indeholder KUN om der er tippet —
 * aldrig 1X2-valget. Grænsen håndhæves allerede i datastrukturen: betByUid er
 * sæt af matchId'er, pick'et bliver aldrig læst ind (se hentTipStatus).
 *
 * "haster" beregnes med SAMME vindue som runGameTipReminders (upcomingMatches,
 * 24 timer) — kortet står lige over 'Send påmindelser nu'-knappen, og et tal,
 * der modsiger knappen, er værre end intet tal (QC-fund på planen). Af samme
 * grund: rammesAfKnappenNu er ANTALLET af spillere, knappen ville sende til nu.
 *
 * En manglende kamp med passeret kickoff kan ikke længere tippes: den er
 * "naaedeDetIkke", ikke "mangler" — der er ingen at rykke.
 */
function byggTipStatus({ game, matches, memberUids, betByUid, brugere, emails, round, now = new Date() }) {
  const gatede = gatedeKampe(matches, startRundeFor(game, matches));
  const rundens = matches
    .filter((m) => m.round === round && !gatede.has(m.id))
    .sort((a, b) => (kickoffMs(a) ?? Infinity) - (kickoffMs(b) ?? Infinity));
  const hasterIds = new Set(
    upcomingMatches(matches, now, new Date(now.getTime() + DAY_MS), gatede).map((m) => m.id),
  );

  const spillere = memberUids.map((uid) => {
    const u = brugere.get(uid) || {};
    const tippede = betByUid.get(uid) || new Set();
    const manglende = rundens.filter((m) => !tippede.has(m.id)).map((m) => {
      const ko = kickoffMs(m);
      const laast = ko != null && ko <= now.getTime();
      return {
        id: m.id,
        kamp: `${m.home || '?'} – ${m.away || '?'}`,
        kickoff: ko,
        naaedeDetIkke: laast,
        haster: !laast && hasterIds.has(m.id),
      };
    });
    return {
      uid,
      navn: u.displayName || 'Spiller',
      tippet: rundens.length - manglende.length,
      ialt: rundens.length,
      manglende,
      // Kan 'Send påmindelser nu' overhovedet nå vedkommende? (mail + opt-in)
      kanRykkes: !!emails.get(uid) && !u.emailOptOut,
    };
  }).sort((a, b) => {
    const aAabne = a.manglende.filter((m) => !m.naaedeDetIkke).length;
    const bAabne = b.manglende.filter((m) => !m.naaedeDetIkke).length;
    return bAabne - aAabne || a.navn.localeCompare(b.navn, 'da');
  });

  // Præcis knappens modtagerkreds: mangler en kamp i 24-timers-vinduet OG kan
  // nås på mail. Runde-tallet ovenfor kan være større — det SKAL siges i UI.
  const rammesAfKnappenNu = spillere
    .filter((s) => s.kanRykkes && s.manglende.some((m) => m.haster))
    .length;

  return {
    runde: round,
    kampeIRunden: rundens.length,
    spillere,
    rammesAfKnappenNu,
  };
}

/**
 * Tynd læser til byggTipStatus — samme opslagsmønster som runGameTipReminders:
 * deltagernes profiler via db.getAll (aldrig hele users-kollektionen) og bets
 * pr. rundens kampe. ÆRLIGT forbehold (QC): emailByUidMap scanner hele
 * userContacts — arvet fra påmindelses-vejen; skaleres kartoteket op, skal
 * begge veje have et scoped opslag. KUN matchId læses af bettet: callablen findes,
 * fordi andres 1X2-valg ikke skal ned i admins browser — reglerne TILLADER
 * admin-læsning, så vagten er denne funktions form, ikke firestore.rules.
 */
async function hentTipStatus(db, gameId, round, now = new Date()) {
  const gameRef = db.collection('games').doc(gameId);
  const [gameSnap, matchesSnap, playersSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('matches').get(),
    gameRef.collection('players').get(),
  ]);
  if (!gameSnap.exists) return null;
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const memberUids = playersSnap.docs.map((d) => d.id);

  const rundensIds = matches.filter((m) => m.round === round).map((m) => m.id);
  const betByUid = new Map();
  for (const ids of chunk(rundensIds, IN_CHUNK)) {
    if (ids.length === 0) continue;
    const snap = await gameRef.collection('bets').where('matchId', 'in', ids).get();
    for (const d of snap.docs) {
      const b = d.data();
      if (!b || !b.uid) continue;
      if (!betByUid.has(b.uid)) betByUid.set(b.uid, new Set());
      betByUid.get(b.uid).add(b.matchId); // KUN id'et — aldrig pick
    }
  }

  const emails = await emailByUidMap(db);
  const userDocs = memberUids.length
    ? await db.getAll(...memberUids.map((uid) => db.collection('users').doc(uid)))
    : [];
  const brugere = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));

  return {
    gameNavn: gameSnap.data().name || gameId,
    ...byggTipStatus({ game: gameSnap.data(), matches, memberUids, betByUid, brugere, emails, round, now }),
  };
}

/** Send en test-påmindelse KUN til admin selv med spillets næste kampe. */
async function sendGameTestReminder(db, transporter, gameId, toEmail, displayName) {
  const gameRef = db.collection('games').doc(gameId);
  const [gameSnap, matchesSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('matches').get(),
  ]);
  const alle = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const gatede = gatedeKampe(alle, startRundeFor(gameSnap.exists ? gameSnap.data() : null, alle));
  const nowMs = Date.now();
  const next = alle
    .map((m) => ({ ...m, _ms: kickoffMs(m) }))
    .filter((m) => m._ms != null && m._ms > nowMs && !gatede.has(m.id))
    .sort((a, b) => a._ms - b._ms)
    .slice(0, 6);
  const gameName = (gameSnap.exists && gameSnap.data().name) || 'spillet';
  const list = next.length
    ? next.map((m) => `<li>${escapeHtml(m.home || '')} – ${escapeHtml(m.away || '')}</li>`).join('')
    : '<li>(ingen kommende kampe fundet)</li>';
  const html = `
    <p>Hej ${escapeHtml(displayName || 'admin')} 👋</p>
    <p><em>Testmail</em> — sådan ser en påmindelse ud for <strong>${escapeHtml(gameName)}</strong>. Næste kampe:</p>
    <ul>${list}</ul>
    <p><a href="${APP_URL}">tip.vejleaa.dk</a></p>`;
  await sendEmail(db, transporter, {
    to: toEmail, subject: `Testmail – påmindelse (${gameName})`, html, type: 'reminder-test',
  });
  return { sent: 1, to: toEmail, matches: next.length };
}

module.exports = {
  runGameTipReminders, sendGameTestReminder, upcomingMatches, byggTipStatus, hentTipStatus,
  paamindelsesLinje, koerPaamindelserForSpil,
};
