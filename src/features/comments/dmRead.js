/**
 * Lokal "læst"-tilstand for private samtaler (gemt i localStorage pr. browser).
 * Bruges til at vise et notifikations-badge for ulæste beskeder.
 *
 * Datastruktur: { [otherUid]: lastSeenMillis }
 */
const KEY = 'dm_seen_v1';
const EVENT = 'dm:seen';

export function getSeenMap() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/** Markér en samtale som læst til og med `millis` (default: nu). */
export function markConversationSeen(otherUid, millis = Date.now()) {
  if (!otherUid) return;
  const map = getSeenMap();
  // Behold den seneste værdi
  if (!map[otherUid] || millis > map[otherUid]) {
    map[otherUid] = millis;
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
  }
  // Giv hooks i samme fane besked (storage-event fyrer kun på tværs af faner)
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* ignore */ }
}

export const DM_SEEN_EVENT = EVENT;

/**
 * Beregn ulæste beskeder ud fra en liste af mine beskeder og "læst"-kortet.
 * En besked er ulæst hvis den er sendt TIL mig og er nyere end sidst set
 * for den pågældende samtale.
 * @param {Array<object>} messages  fra useMyMessages
 * @param {string} meUid
 * @param {Record<string, number>} seenMap
 * @returns {{ total: number, byUser: Record<string, number> }}
 */
export function computeUnread(messages, meUid, seenMap) {
  const byUser = {};
  let total = 0;
  for (const m of messages) {
    if (m.to !== meUid) continue; // kun beskeder til mig
    const other = m.from;
    const ts = m.createdAt?.toMillis?.() ?? 0;
    const seen = seenMap[other] ?? 0;
    if (ts > seen) {
      byUser[other] = (byUser[other] || 0) + 1;
      total += 1;
    }
  }
  return { total, byUser };
}
