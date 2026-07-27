// ---------------------------------------------------------------------------
// functions-platform/reminders.js — per-spil tip-påmindelser via e-mail.
// For ét spil: find kampe med kickoff inden for det næste døgn (stadig
// tippelige), og mail de deltagere der mangler at tippe på dem.
// ---------------------------------------------------------------------------
const { escapeHtml, sendEmail, emailByUidMap, APP_URL } = require('./mailer');

const DAY_MS = 24 * 3600 * 1000;

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
 * Kampe FØR spillets starttidspunkt (game.startAt) tælles ikke med — de vises
 * ikke i appen og giver ingen point, så der skal heller ikke rykkes for dem.
 * @param {Array<object>} matches
 * @param {Date} now
 * @param {Date} windowEnd
 * @param {number|null} [startMs] spillets starttidspunkt i ms
 */
function upcomingMatches(matches, now, windowEnd, startMs = null) {
  return matches.filter((m) => {
    const k = toMillis(m.kickoff);
    if (k == null) return false;
    if (startMs != null && k < startMs) return false;
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

  // Spillets starttidspunkt afgør hvad der overhovedet er i spil.
  const gameSnap = await gameRef.get();
  const startMs = gameSnap.exists ? toMillis(gameSnap.data().startAt) : null;

  const matchesSnap = await gameRef.collection('matches').get();
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const upcoming = upcomingMatches(matches, now, windowEnd, startMs);
  if (upcoming.length === 0) return { sent: 0, reason: 'no-matches' };
  const upcomingIds = new Set(upcoming.map((m) => m.id));

  const playersSnap = await gameRef.collection('players').get();
  const memberUids = playersSnap.docs.map((d) => d.id);
  if (memberUids.length === 0) return { sent: 0, reason: 'no-members' };

  // uid → Set(matchId) af tippede kommende kampe.
  const betsSnap = await gameRef.collection('bets').get();
  const betByUid = new Map();
  for (const d of betsSnap.docs) {
    const b = d.data();
    if (!b || !b.uid || !upcomingIds.has(b.matchId)) continue;
    if (!betByUid.has(b.uid)) betByUid.set(b.uid, new Set());
    betByUid.get(b.uid).add(b.matchId);
  }

  const emails = await emailByUidMap(db);
  const usersSnap = await db.collection('users').get();
  const userById = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
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
  const gameSnap = await gameRef.get();
  const startMs = gameSnap.exists ? toMillis(gameSnap.data().startAt) : null;
  const matchesSnap = await gameRef.collection('matches').get();
  const nowMs = Date.now();
  const next = matchesSnap.docs
    .map((d) => ({ id: d.id, ...d.data(), _ms: toMillis(d.data().kickoff) }))
    .filter((m) => m._ms != null && m._ms > nowMs && (startMs == null || m._ms >= startMs))
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
