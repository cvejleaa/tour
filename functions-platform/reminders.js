// ---------------------------------------------------------------------------
// functions-platform/reminders.js — per-spil tip-påmindelser via e-mail.
// For ét spil: find kampe med kickoff inden for det næste døgn (stadig
// tippelige), og mail de deltagere der mangler at tippe på dem.
// ---------------------------------------------------------------------------
const { escapeHtml, sendEmail, emailByUidMap, APP_URL } = require('./mailer');
// Samme gate som pointgivningen — en spiller må aldrig rykkes for en kamp,
// der ikke giver point.
const { gatedeKampe, startRundeFor } = require('./startGate');

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
function toMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Date.parse(v); return Number.isNaN(n) ? null : n; }
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v.seconds != null) return v.seconds * 1000;
  return null;
}

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
    const k = toMillis(m.kickoff);
    if (k == null) return false;
    if (gatede && gatede.has(m.id)) return false;
    return k > now.getTime() && k < windowEnd.getTime();
  });
}

/**
 * Kør påmindelser for ét spil. Returnerer { sent, reason?, upcoming, members }.
 * No-op'er pænt uden transporter (mangler SMTP_PASSWORD).
 */
async function runGameTipReminders(db, transporter, gameId, now = new Date()) {
  if (!transporter) return { sent: 0, reason: 'no-smtp-password' };
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
  if (upcoming.length === 0) return { sent: 0, reason: 'no-matches' };
  const upcomingIds = new Set(upcoming.map((m) => m.id));

  const playersSnap = await gameRef.collection('players').get();
  const memberUids = playersSnap.docs.map((d) => d.id);
  if (memberUids.length === 0) return { sent: 0, reason: 'no-members' };

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
      console.error(`gameTipReminders(${gameId}): kunne ikke sende til ${email}:`, e && e.message);
    }
  }
  return { sent, gameId, upcoming: upcoming.length, members: memberUids.length };
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
    .map((m) => ({ ...m, _ms: toMillis(m.kickoff) }))
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

module.exports = { runGameTipReminders, sendGameTestReminder, upcomingMatches };
