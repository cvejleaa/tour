/**
 * Danske tal-formattere til visning (komma som decimaltegn).
 * Point kan være decimaltal (point følger oddsene), så vi viser dem pænt:
 * heltal uden decimaler, ellers 1 decimal — altid med dansk komma (132,7).
 */

/** Point: heltal uden decimaler, ellers 1 decimal. Dansk komma. */
export function fmtPoints(n) {
  const v = Number(n) || 0;
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ',');
}

/** Fast antal decimaler (fx odds med 2), dansk komma. */
export function fmtDec(n, decimals = 1) {
  const v = Number(n) || 0;
  return v.toFixed(decimals).replace('.', ',');
}

/** Point med fortegn foran (+3,1 / −5). Bruger ægte minus-tegn. */
export function fmtSignedPoints(n) {
  const v = Number(n) || 0;
  const body = fmtPoints(Math.abs(v));
  if (v < 0) return `−${body}`;
  return `+${body}`;
}
