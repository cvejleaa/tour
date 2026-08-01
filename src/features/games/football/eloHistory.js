/**
 * Ren FORMATTER til Elo-tabellen. Elo BEREGNES kun på serveren (recomputeSeasonElo
 * gemmer `eloHistory` = rundevis snapshots på spillet). Her laver vi udelukkende
 * visnings-rækker: rating pr. runde + udvikling (delta) vs. forrige kolonne.
 * Ingen Elo-formel her → beregningen vedligeholdes ét sted (serveren).
 */

/**
 * @param {Array<{name:string, short?:string, color?:string, elo:number}>} teams  – seed (start-rating)
 * @param {Array<{round:number, elo:Record<string,number>}>} serverHistory        – game.eloHistory
 * @returns {{ rows: Array<object>, rounds: number[] }}
 *   rows: pr. hold { name, short, color, start, current, cells:[{round, elo, delta}] } (ældst→nyest)
 */
export function eloRows(teams, serverHistory) {
  const start = {};
  for (const t of teams || []) start[t.name] = Math.round(Number(t.elo) || 0);
  const cols = [...(serverHistory || [])].sort((a, b) => a.round - b.round);

  const rows = (teams || []).map((t) => {
    const cells = cols.map((c, i) => {
      const cur = Math.round(c.elo?.[t.name] ?? start[t.name]);
      const prev = i > 0 ? Math.round(cols[i - 1].elo?.[t.name] ?? start[t.name]) : start[t.name];
      return { round: c.round, elo: cur, delta: cur - prev };
    });
    const current = cols.length ? Math.round(cols[cols.length - 1].elo?.[t.name] ?? start[t.name]) : start[t.name];
    return {
      name: t.name, short: t.short, color: t.color, start: start[t.name], current, cells,
    };
  });
  rows.sort((a, b) => b.current - a.current || a.name.localeCompare(b.name, 'da'));
  return { rows, rounds: cols.map((c) => c.round) };
}

/** Hvor mange udviklingspunkter tip-fladen viser pr. hold. */
export const FORM_POINTS = 5;

/**
 * Opslag holdnavn → rating og de seneste udviklingspunkter. Bruges på
 * tip-fladen, hvor der ikke er plads til hele sæsonen.
 *
 * Er der færre end n spillede runder, vises dem der er — formen skal ikke
 * lyve om, hvor meget den bygger på. Er der ingen, er form tom, og current er
 * start-ratingen.
 *
 * @param {Array<object>} teams          – seed (start-rating)
 * @param {Array<object>} serverHistory  – game.eloHistory
 * @param {number} [n=FORM_POINTS]       – højst så mange punkter, nyeste sidst
 * @returns {Record<string, {current:number, start:number, form:Array<object>, trend:number}>}
 *   trend = summen af de VISTE deltaer, ikke hele sæsonens bevægelse.
 */
export function eloFormByTeam(teams, serverHistory, n = FORM_POINTS) {
  const { rows } = eloRows(teams, serverHistory);
  const antal = Math.max(0, Math.floor(Number(n)) || 0);
  const out = {};
  const snapshots = serverHistory || [];
  for (const r of rows) {
    // Optræder holdet slet ikke i historikken (ukendt navn, omdøbt hold,
    // tilføjet efter sæsonstart), falder eloRows tilbage til start-ratingen i
    // hver runde og laver dermed et ±0-punkt pr. runde. På kortet ville det
    // ligne et hold, der har spillet fem helt flade kampe. Det er værre end
    // ingen data: vis hellere ingenting og lad "Start-rating"-beskeden stå.
    const kendtIHistorik = snapshots.some((c) => Number.isFinite(Number(c?.elo?.[r.name])));
    const form = antal && kendtIHistorik ? r.cells.slice(-antal) : [];
    out[r.name] = {
      current: r.current,
      start: r.start,
      form,
      trend: form.reduce((sum, c) => sum + c.delta, 0),
    };
  }
  return out;
}
