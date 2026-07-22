/**
 * Rene hjælpere til fodbold-spil: grupper kampe i runder og find den runde,
 * spilleren skal se/tip'e nu. Ingen Firebase-afhængigheder (testbar).
 */

/** Millisekunder fra et Firestore-Timestamp | Date | tal | ISO-streng. */
export function toMillis(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  if (typeof t === 'string') { const n = Date.parse(t); return Number.isNaN(n) ? null : n; }
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds != null) return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  return null;
}

/**
 * Skjul kampe der ligger FØR spillets starttidspunkt (game.startAt). Bruges når
 * spillet først går i gang midt i sæsonen — så tæller/vises kun runder fra
 * starttidspunktet og frem. Uden starttidspunkt vises alle kampe.
 * Kampe uden kickoff bevares (kan ikke afgøres som "før start").
 * @param {Array<object>} matches
 * @param {number|null} startMs  millisekunder (fra toMillis(game.startAt))
 * @returns {Array<object>}
 */
export function afterStart(matches, startMs) {
  if (startMs == null) return matches || [];
  return (matches || []).filter((m) => {
    const k = toMillis(m.kickoff);
    return k == null || k >= startMs;
  });
}

/**
 * Grupper kampe i runder. Kampe uden runde-nummer samles i runde 0.
 * @param {Array<object>} matches
 * @returns {Array<{round:number, matches:Array<object>}>} sorteret efter runde
 */
export function groupByRound(matches) {
  const byRound = new Map();
  for (const m of matches || []) {
    const r = Number.isFinite(m.round) ? m.round : 0;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r).push(m);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, ms]) => ({
      round,
      matches: ms.slice().sort((a, b) => (toMillis(a.kickoff) ?? 0) - (toMillis(b.kickoff) ?? 0)),
    }));
}

/**
 * Vælg den "aktive" runde ud fra tidspunktet nu:
 * den tidligste runde der stadig har mindst én kamp, hvis kickoff ikke er
 * passeret. Hvis alle kampe er begyndt, vælges den sidste runde.
 * @param {Array<{round:number, matches:Array<object>}>} rounds
 * @param {number} nowMs
 * @returns {number|null} runde-nummeret, eller null hvis ingen runder
 */
export function activeRound(rounds, nowMs) {
  if (!rounds || rounds.length === 0) return null;
  for (const { round, matches } of rounds) {
    const hasUpcoming = matches.some((m) => {
      const k = toMillis(m.kickoff);
      return k == null || k > nowMs;
    });
    if (hasUpcoming) return round;
  }
  return rounds[rounds.length - 1].round;
}

/** Er kampens deadline (kickoff) passeret? */
export function isLocked(match, nowMs) {
  const k = toMillis(match?.kickoff);
  return k != null && k <= nowMs;
}
