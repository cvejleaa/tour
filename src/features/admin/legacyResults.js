/**
 * legacyResults — hjælpere til "Indsæt top 5" i Send mail: formatér en gammel
 * ligas slutstilling (fra legacyLeagueResults, eksporteret af workflowet) som
 * en tekstblok, og flet den + [VINDER]/[LIGANAVN] ind i emne/besked.
 */
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** Hent alle eksporterede liga-slutstillinger (kun admin må læse iflg. reglerne). */
export async function fetchLegacyResults() {
  try {
    const snap = await getDocs(collection(db, 'legacyLeagueResults'));
    const rows = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    rows.sort((a, b) => (a.sourceLabel || '').localeCompare(b.sourceLabel || '', 'da')
      || (a.name || '').localeCompare(b.name || '', 'da'));
    return { ok: true, results: rows };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke hente gamle liga-resultater.' };
  }
}

/** Ét pænt tal (1 decimal kun når nødvendigt). */
function fmtPts(p) {
  const n = Number(p) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

/**
 * Formatér top 5 som tekstblok til mailen. Medaljer følger RANGEN (delte
 * placeringer giver samme medalje), øvrige får "4."-stil.
 * @param {{name:string, top:Array<{rank:number,name:string,points:number}>}} result
 */
export function formatTop5Block(result) {
  const lines = (result?.top || []).map((r) => {
    const prefix = MEDALS[r.rank] || `${r.rank}.`;
    return `${prefix} ${r.name} – ${fmtPts(r.points)} point`;
  });
  return `Sådan endte ${result?.name || 'ligaen'}:\n\n${lines.join('\n')}`;
}

/**
 * Flet en gammel ligas resultat ind i emne + besked:
 *  - [TOP5]     → hele blokken (findes tokenet ikke, tilføjes blokken til sidst)
 *  - [VINDER]   → nr. 1's navn (i både emne og besked)
 *  - [LIGANAVN GAMMEL] → den gamle ligas navn
 * @param {{subject:string, body:string, result:object}} args
 * @returns {{subject:string, body:string}}
 */
export function applyLegacyResult({ subject = '', body = '', result }) {
  const block = formatTop5Block(result);
  const winner = result?.top?.[0]?.name || '';
  let newBody = body.includes('[TOP5]')
    ? body.split('[TOP5]').join(block)
    : `${body.trimEnd()}\n\n${block}\n`;
  let newSubject = subject;
  if (winner) {
    newBody = newBody.split('[VINDER]').join(winner);
    newSubject = newSubject.split('[VINDER]').join(winner);
  }
  if (result?.name) {
    newBody = newBody.split('[LIGANAVN GAMMEL]').join(result.name);
    newSubject = newSubject.split('[LIGANAVN GAMMEL]').join(result.name);
  }
  return { subject: newSubject, body: newBody };
}
