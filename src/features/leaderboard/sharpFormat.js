// Små formaterings-hjælpere til Skarpskytten-visningen.

/** Afrund til 1 decimal og fjern unødvendig ,0 (intern: punktum-format). */
export function fmt1(v) {
  return Number.isInteger(v) ? v : Math.round(v * 10) / 10;
}

/** Vis et point-tal med fortegn, fx +4 / −3 / 0. */
export function fmtSigned(v) {
  const n = fmt1(v);
  if (n > 0) return `+${n}`;
  return String(n);
}

/**
 * Vis straffen for en utippet kamp som en negativ point-tekst, fx "−2".
 * penalty gives som et positivt tal (antal point der trækkes fra).
 */
export function fmtPenalty(penalty) {
  const n = fmt1(Math.abs(Number(penalty) || 0));
  return n === 0 ? '0' : `−${n}`;
}
