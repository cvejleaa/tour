// ---------------------------------------------------------------------------
// Startliste 2026 (statisk snapshot fra TV2). Et fallback/udgangspunkt indtil
// den planlagte sync har skrevet en frisk liste til Firestore (config/startlist).
// Form pr. holdkode: { announced: bool, riders: [{ name, country, leader }] }.
// ---------------------------------------------------------------------------
import STARTLIST from './riders2026.json';

export const STATIC_STARTLIST = STARTLIST;

/** Slå et holds startliste op via holdkode. Returnerer { announced, riders } | null. */
export function staticStartlist(code) {
  return (code && STARTLIST[code]) || null;
}
