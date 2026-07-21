/**
 * Auto-kontrast tekstfarve på en vilkårlig baggrundsfarve (til klub-badges).
 * Bruger WCAG relativ luminans; tærskel ~0.55 rammer brandfarver pænt.
 */
export function textOn(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.55 ? '#10151b' : '#ffffff';
}

/** RGB-værdier [0-255] fra hex, eller null hvis ugyldig. */
function rgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Euklidisk RGB-afstand mellem to farver (0–441). */
export function colorDistance(a, b) {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return Infinity;
  return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
}

/**
 * Er to farver "for tæt på hinanden" (trøje-clash)? Standard-tærskel ~120 af 441
 * fanger samme farvefamilie (hvid/hvid, navy/sort, rød/rød).
 */
export function colorsClash(a, b, threshold = 120) {
  return colorDistance(a, b) < threshold;
}
