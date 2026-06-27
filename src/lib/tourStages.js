// ---------------------------------------------------------------------------
// Etape-model: normalisering af proxyens etapeliste + etape-status/lås.
// Ren logik (ingen Firebase) — bruges til seed og visning. Tippet på en etape
// LÅSES ved etapestart (grundlagets "skjult før, afsløret efter").
// ---------------------------------------------------------------------------

// Touren køres i juli → altid CEST (UTC+02:00). Vi bruger det til at danne et
// konkret lås-tidspunkt ud fra etapedatoen + en standard-starttime.
const TOUR_TZ_OFFSET = '+02:00';

/** Standard lås-time (lokal, CEST) hvis admin ikke har sat et præcist tidspunkt. */
export const DEFAULT_LOCK_HOUR = 12;

/** Standard-sæson (årstal) hvis admin ikke har sat en aktiv sæson. */
export const DEFAULT_SEASON = 2026;

/**
 * Sæson-scopet etape-id. `2026-stage-7`. Holder data adskilt pr. år, så 2025,
 * 2026 og senere kan ligge side om side uden at overskrive hinanden.
 */
export function stageId(number, season = DEFAULT_SEASON) {
  return `${season}-stage-${number}`;
}

/** Udled {season, number} af et etape-id. */
export function parseStageId(id) {
  const m = /^(\d{4})-stage-(\d+)$/.exec(String(id || ''));
  return m ? { season: Number(m[1]), number: Number(m[2]) } : null;
}

/**
 * Groft etape-type ud fra PCS `stage_type`/`profile_icon`. Bruges til labels og
 * (senere) evt. vægtning. Ukendt → 'unknown'.
 */
export function classifyStageType(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (/(itt|individual time trial|enkeltstart)/.test(s)) return 'itt';
  if (/(ttt|team time trial|holdtidskørsel)/.test(s)) return 'ttt';
  if (/(mountain|bjerg|summit|hc|mtf)/.test(s)) return 'mountain';
  if (/(hill|kuperet|medium)/.test(s)) return 'hilly';
  if (/(flat|flad|sprint)/.test(s)) return 'flat';
  if (/p5|p4/.test(s)) return 'mountain'; // PCS profile-ikoner (grove)
  if (/p2|p3/.test(s)) return 'hilly';
  if (/p1/.test(s)) return 'flat';
  return 'unknown';
}

/**
 * Danner et lås-tidspunkt (ISO) ud fra etapedato + time. Deterministisk: ingen
 * Date.now/locale — vi sætter eksplicit CEST-offset (Touren er altid i juli).
 * @param {string} date  'YYYY-MM-DD'
 * @param {number} [hour]
 * @returns {string|null} ISO-streng, fx '2026-07-05T12:00:00+02:00'
 */
export function deriveKickoff(date, hour = DEFAULT_LOCK_HOUR) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const h = String(Math.max(0, Math.min(23, Math.floor(Number(hour) || 0)))).padStart(2, '0');
  return `${date}T${h}:00:00${TOUR_TZ_OFFSET}`;
}

/**
 * Normaliserer proxyens /api/stages-svar til etape-dokumenter klar til seed.
 * @param {{year?:number, stages?:Array}} resp
 * @param {{lockHour?:number}} [opts]
 * @returns {Array<object>}
 */
export function normalizeStageList(resp, opts = {}) {
  const lockHour = opts.lockHour ?? DEFAULT_LOCK_HOUR;
  const season = opts.season ?? DEFAULT_SEASON;
  const stages = (resp && Array.isArray(resp.stages)) ? resp.stages : [];
  return stages
    .filter((s) => s && s.number != null && s.number !== '' && Number.isFinite(Number(s.number)))
    .map((s) => {
      const number = Number(s.number);
      return {
        id: stageId(number, season),
        season,
        number,
        date: s.date ?? null,
        name: s.name ?? null,
        type: classifyStageType(s.profile_icon ?? s.stage_type),
        profileIcon: s.profile_icon ?? null,
        kickoff: s.date ? deriveKickoff(s.date, lockHour) : null,
        hasResults: Boolean(s.has_results),
        status: 'scheduled',
      };
    })
    .sort((a, b) => a.number - b.number);
}

/**
 * Etape-status til UI/lås-logik. `now` injiceres (ren funktion).
 *   'scheduled' – før lås (tip åbent)
 *   'locked'    – efter lås, intet endeligt resultat endnu
 *   'done'      – resultat foreligger
 * @param {{kickoff?:?string, hasResults?:boolean, result?:object}} stage
 * @param {Date|number|string} now
 */
export function stageStatus(stage, now) {
  if (!stage) return 'scheduled';
  const hasResult = Boolean(stage.hasResults) ||
    (stage.result && Object.values(stage.result).some((v) => v != null && v !== ''));
  if (hasResult) return 'done';
  if (!stage.kickoff) return 'scheduled';
  const t = new Date(now).getTime();
  const k = new Date(stage.kickoff).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(k)) return 'scheduled';
  return t >= k ? 'locked' : 'scheduled';
}

/** Er tip stadig åbent for etapen? */
export function isTipOpen(stage, now) {
  return stageStatus(stage, now) === 'scheduled';
}
