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
