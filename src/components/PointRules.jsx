// Kort, sammenfoldelig oversigt over pointreglerne. Værdier kommer fra
// den centrale pointlogik, så de altid matcher den faktiske beregning.
import { POINTS } from '../lib/scoring';

const ROWS = [
  { pts: POINTS.EXACT, label: 'Helt korrekt score', ex: 'fx du tipper 2–1, og det ender 2–1' },
  { pts: POINTS.GOAL_DIFF, label: 'Korrekt målforskel + vinder', ex: 'fx du tipper 2–1, det ender 3–2' },
  { pts: POINTS.OUTCOME, label: 'Korrekt vinder/uafgjort', ex: 'fx du tipper 2–1, det ender 4–0' },
  { pts: POINTS.WRONG, label: 'Forkert udfald', ex: 'fx du tipper hjemmesejr, men holdet taber' },
];

export default function PointRules() {
  return (
    <details className="card" style={{ marginBottom: '1rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>🎯 Sådan får du point</span>
        <span className="badge badge--blue" style={{ fontWeight: 600 }}>klik for detaljer</span>
      </summary>

      <div style={{ marginTop: '0.85rem' }}>
        <table className="table" style={{ fontSize: '0.88rem' }}>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <td style={{ width: '3.2rem' }}>
                  <span className="badge badge--green" style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    {r.pts} p
                  </span>
                </td>
                <td>
                  <strong>{r.label}</strong>
                  <div style={{ color: 'var(--c-muted)', fontSize: '0.8rem' }}>{r.ex}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem', color: 'var(--c-text)', fontSize: '0.85rem', lineHeight: 1.7 }}>
          <li>
            <strong>Slutspil:</strong> ud over scoren får du <strong>+{POINTS.KNOCKOUT_ADVANCE} point</strong> for
            at ramme, hvilket hold der går videre (gælder forlænget tid/straffe).
          </li>
          <li>
            <strong>Bonus:</strong> <strong>{POINTS.BONUS} point</strong> for hvert korrekt bonus-svar (topscorer og gruppevindere).
          </li>
          <li>
            <strong>Deadline:</strong> hvert tip låses ved kampens kickoff – du kan ikke ændre det bagefter.
          </li>
        </ul>
      </div>
    </details>
  );
}
