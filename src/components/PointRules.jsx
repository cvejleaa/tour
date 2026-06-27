// Kort, sammenfoldelig oversigt over pointreglerne for hold-spillet. Værdier
// kommer fra den centrale pointlogik (tourScoring), så de altid matcher den
// faktiske beregning.
import { POINTS } from '../lib/scoring';
import { useTourSettings } from '../features/stages/useTourSettings';

export default function PointRules() {
  const { points } = useTourSettings();
  const ROWS = [
    { pts: points.winnerTeam, label: 'Etapevinderens hold', ex: 'ram holdet som etapevinderen kører for' },
    { pts: points.gcTeam, label: 'Bedste hold blandt de første ryttere', ex: 'holdet med samlet bedste resultat på de forreste ryttere' },
    { pts: points.mountainTeam, label: 'Flest bjergpoint', ex: 'holdet der tager flest bjergpoint på etapen' },
    { pts: points.sprintTeam, label: 'Flest sprintpoint', ex: 'holdet der tager flest sprintpoint på etapen' },
  ];
  return (
    <details className="card" style={{ marginBottom: '1rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>🎯 Sådan får du point</span>
        <span className="badge badge--blue" style={{ fontWeight: 600 }}>klik for detaljer</span>
      </summary>

      <div style={{ marginTop: '0.85rem' }}>
        <p style={{ margin: '0 0 0.6rem', color: 'var(--c-text)', fontSize: '0.85rem', lineHeight: 1.6 }}>
          På hver etape tipper du <strong>cykelhold</strong> på fire spørgsmål. Hvert ramt hold giver point:
        </p>
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
            <strong>Bonus:</strong> <strong>{POINTS.BONUS} point</strong> for hvert korrekt bonus-svar (sæson- og klassements-spørgsmål).
          </li>
          <li>
            <strong>Utippet etape:</strong> lader du en etape stå helt utippet, trækkes der <strong>−{points.untippedPenalty} point</strong> fra, når etapen er afgjort.
          </li>
          <li>
            <strong>Deadline:</strong> hvert tip låses ved etapens start – du kan ikke ændre det bagefter.
          </li>
        </ul>
      </div>
    </details>
  );
}
