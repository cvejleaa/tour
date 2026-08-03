// ---------------------------------------------------------------------------
// liveMapUtils — rene hjælpere til live-kortet (danske gruppe-etiketter,
// tidsgab-format og bib → rytternavn med dansk markering).
// ---------------------------------------------------------------------------
import { RIDERS, prettyRiderName } from '../../data/ridersTdf2026';

const BY_BIB = new Map(RIDERS.map((r) => [r.bib, r]));

/** Racecenterets gruppenavne (fr/en) → korte danske etiketter. */
const GROUP_LABELS = [
  [/t[eê]te de la course|front of the race/i, 'Udbrud'],
  [/^peloton$/i, 'Hovedfeltet'],
  [/poursuivant|chas(e|ing)/i, 'Forfølgere'],
  [/gruppetto|autobus/i, 'Gruppetto'],
];

export function groupLabel(name) {
  const s = String(name || '').trim();
  for (const [re, label] of GROUP_LABELS) {
    if (re.test(s)) return label;
  }
  return s || 'Gruppe';
}

/** Sekunder → "+m.ss" (eller "+t.mm.ss"); 0/ugyldig → tom streng. */
export function formatGap(sec) {
  const s = Math.round(Number(sec));
  if (!Number.isFinite(s) || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `+${h}.${String(m).padStart(2, '0')}.${ss}` : `+${m}.${ss}`;
}

/**
 * Bib-numre → visningsnavne ("J. Vingegaard 🇩🇰") via letours rytterfil.
 * Ukendte bibs vises som "#<bib>", så udbruddet aldrig "mangler" ryttere.
 * @param {number[]} bibs
 * @returns {Array<{bib:number, name:string, danish:boolean}>}
 */
export function ridersForBibs(bibs) {
  return (bibs || []).map((bib) => {
    const r = BY_BIB.get(Number(bib));
    if (!r) return { bib, name: `#${bib}`, danish: false };
    return {
      bib,
      // Fuldt navn i holdsidens form ("Jonas Vingegaard") — som resten af appen.
      name: prettyRiderName(`${r.first} ${r.last}`),
      danish: r.nat === 'den',
    };
  });
}

/** Kort tekstlinje for en gruppe til chippen under kortet. */
export function groupSummary(group) {
  const label = groupLabel(group.name);
  const size = group.size > 0 && group.size < 999 ? ` (${group.size})` : '';
  const gap = formatGap(group.gapSec);
  const parts = [`${label}${size}`];
  if (gap) parts.push(gap);
  if (group.speed != null) parts.push(`${group.speed} km/t`);
  return parts.join(' · ');
}
