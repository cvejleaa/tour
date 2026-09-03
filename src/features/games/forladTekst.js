// ---------------------------------------------------------------------------
// Teksterne i Forlad-dialogerne. Ren funktion, så testene kan assertere på
// INDHOLDET (tallet, spillets navn, hvad der sker) — ikke kun at en dialog
// blev vist. Hele advarselsteksten i en bekræftelsesdialog kunne ellers
// erstattes med "OK?" med grøn suite (CLAUDE.md).
//
// Modellen er ARKIV, ikke sletning (functions-platform/forladSpil.js): man
// forsvinder fra stillingen og sine ligaer, tips på kommende kampe slettes,
// men point og historik bliver stående — kommer man tilbage i sæsonen, får
// man sin stilling igen. Teksterne må ikke love mere eller mindre end det.
// ---------------------------------------------------------------------------
import { fmtPoints } from '../../lib/daNum';

/** Første dialog — alle, der forlader. */
export function forladBekraeftelse(game) {
  return `Forlad "${game.name}"?\n\n`
    + 'Du forsvinder fra stillingen og dine ligaer i spillet, og dine tips på kommende kampe slettes. '
    + 'Tips på kampe, der allerede er spillet, bliver stående.';
}

/** Anden dialog — kun når spilleren har point. Tallet skal stå der. */
export function forladPointAdvarsel(game, point) {
  return `Du står med ${fmtPoints(point)} point i ${game.name}.\n\n`
    + 'Du får ingen nye point, mens du er ude. Pointene bliver stående i arkivet: '
    + 'kommer du tilbage i sæsonen, får du din stilling igen — men ikke tips, du er gået glip af imens.\n\n'
    + 'Vil du forlade spillet?';
}
