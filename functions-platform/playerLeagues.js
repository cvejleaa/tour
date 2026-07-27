// ---------------------------------------------------------------------------
// functions-platform/playerLeagues.js — denormaliseret liga-medlemskab på
// games/{gameId}/players/{uid}.leagueIds.
//
// Hvorfor: security rules kan ikke slå "er vi i samme liga?" op ved at læse en
// liste af ligaer — reglen skal kunne afgøres ud fra selve dokumentet. Derfor
// skriver SERVEREN (denne trigger) medlemskabet med på hver spillers dokument,
// så en spillers point kun kan læses af dem, der deler mindst én liga med dem.
//
// Feltet er server-only: reglerne forbyder klienten at røre 'leagueIds'.
// Rene funktioner her — Cloud Functions-wrapperen ligger i index.js.
// ---------------------------------------------------------------------------

/** memberUids fra et liga-dokument (tolerant over for manglende/forkert felt). */
function memberUidsOf(data) {
  const m = data && data.memberUids;
  return Array.isArray(m) ? m.filter((u) => typeof u === 'string' && u) : [];
}

/**
 * Hvilke spillere skal have ligaen tilføjet/fjernet efter en ændring?
 * @param {object|null} before liga-dokument før
 * @param {object|null} after  liga-dokument efter (null = slettet)
 * @returns {{added:Array<string>, removed:Array<string>}}
 */
function membershipDelta(before, after) {
  const b = new Set(memberUidsOf(before));
  const a = new Set(memberUidsOf(after));
  return {
    added: [...a].filter((u) => !b.has(u)),
    removed: [...b].filter((u) => !a.has(u)),
  };
}

/**
 * Skriv ændringen ned på de berørte players-dokumenter.
 * Spillere uden players-dokument springes over (de kan endnu ikke ses i
 * stillingen alligevel) — set(..., {merge:true}) ville ellers lave et
 * halvt dokument uden uid/joinedAt.
 */
async function applyMembershipDelta(db, FieldValue, gameId, leagueId, { added, removed }) {
  const players = db.collection('games').doc(gameId).collection('players');
  let updated = 0;
  const touch = async (uid, value) => {
    const ref = players.doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.update({ leagueIds: value });
    updated += 1;
  };
  for (const uid of added) await touch(uid, FieldValue.arrayUnion(leagueId));
  for (const uid of removed) await touch(uid, FieldValue.arrayRemove(leagueId));
  return { updated, added: added.length, removed: removed.length };
}

/**
 * Genopbyg leagueIds for ALLE spillere i ét spil ud fra ligaernes memberUids.
 * Bruges til engangs-backfill (og som selvhelbredelse, hvis noget er drevet).
 * @returns {Promise<{players:number, changed:number}>}
 */
async function rebuildGamePlayerLeagues(db, gameId) {
  const gameRef = db.collection('games').doc(gameId);
  const [leaguesSnap, playersSnap] = await Promise.all([
    gameRef.collection('leagues').get(),
    gameRef.collection('players').get(),
  ]);

  const byUid = new Map();
  for (const d of leaguesSnap.docs) {
    for (const uid of memberUidsOf(d.data())) {
      if (!byUid.has(uid)) byUid.set(uid, []);
      byUid.get(uid).push(d.id);
    }
  }

  let changed = 0;
  for (const d of playersSnap.docs) {
    const want = (byUid.get(d.id) || []).slice().sort();
    const have = (Array.isArray(d.data().leagueIds) ? d.data().leagueIds : []).slice().sort();
    if (want.length === have.length && want.every((v, i) => v === have[i])) continue;
    await d.ref.update({ leagueIds: want });
    changed += 1;
  }
  return { players: playersSnap.size, changed };
}

module.exports = {
  memberUidsOf, membershipDelta, applyMembershipDelta, rebuildGamePlayerLeagues,
};
