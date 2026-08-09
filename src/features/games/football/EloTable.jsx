/**
 * EloTable — holdenes Elo-rating fulgt gennem sæsonen. Efter hver færdigspillet
 * runde tilføjes en NY kolonne FØRST i tabellen (nyeste til venstre) med den nye
 * rating og en markering af udviklingen (▲/▼ siden forrige runde).
 */
import { useMemo } from 'react';
import { teamsOf, teamInfo } from './teamInfo';
import { eloRows } from './eloHistory';
import ClubBadge from '../../../components/ClubBadge';
// Delt med kampkortet, så ▲/▼ betyder det samme begge steder.
import Delta from './EloDelta';

export default function EloTable({ game }) {
  // Elo BEREGNES på serveren; her vises kun game.eloHistory (rundevis snapshots).
  const teams = teamsOf(game);
  const { rows, rounds: cols } = useMemo(
    () => eloRows(teams, game?.eloHistory), [teams, game?.eloHistory],
  );
  const colsDesc = [...cols].reverse(); // nyeste runde først

  return (
    <div>
      <div className="card mb-2">
        <h3 className="card__title">📈 Elo-rating gennem sæsonen</h3>
        <p style={{ color: 'var(--c-muted)', margin: 0 }}>
          Holdenes styrke-rating (elo-lite), som odds og point bygger på. Efter hver spillet runde
          kommer en ny kolonne til venstre med den nye rating og udviklingen. Ratingen starter fra de
          kalibrerede sæson-startværdier.
        </p>
      </div>

      {cols.length === 0 && (
        <p className="badge badge--muted" style={{ display: 'inline-block', marginBottom: '0.6rem' }}>
          Endnu ingen færdigspillede runder — tabellen viser start-ratingen. Kolonner tilføjes efterhånden.
        </p>
      )}

      <div className="elo-wrap">
        <table className="elo-table">
          <thead>
            <tr>
              <th className="elo-team-col">Hold</th>
              {colsDesc.map((r) => <th key={r}>R{r}</th>)}
              <th className="elo-start-col">Start</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const info = teamInfo(teams, row.name);
              const cellsDesc = [...row.cells].reverse();
              return (
                <tr key={row.name}>
                  <td className="elo-team-col">
                    <span className="elo-team">
                      <ClubBadge
                        variant="troeje" code={row.short || info?.short} color={row.color || info?.color} size={22}
                        color2={info?.troejer?.hjemme?.sekundaer} moenster={info?.troejer?.hjemme?.moenster}
                        aerme={info?.troejer?.hjemme?.aerme} title={row.name}
                      />
                      <span className="elo-team__name">{row.short || info?.short || row.name}</span>
                    </span>
                  </td>
                  {cellsDesc.map((c) => (
                    <td key={c.round} className="elo-cell">
                      <span className="elo-cell__rating">{c.elo}</span>
                      <Delta d={c.delta} />
                    </td>
                  ))}
                  <td className="elo-start-col elo-cell"><span className="elo-cell__rating">{row.start}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
