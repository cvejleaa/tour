// Kort, sammenfoldelig oversigt over pointreglerne for hold-spillet. Værdier
// kommer fra den centrale pointlogik (tourScoring), så de altid matcher den
// faktiske beregning.
import { useTourSettings } from '../features/stages/useTourSettings';

export default function PointRules() {
  const { points, gcTopN } = useTourSettings();
  const ROWS = [
    { pts: points.winnerTeam, label: 'Etapevinderens hold', ex: 'ram holdet som etapevinderen kører for' },
    { pts: points.gcTeam, label: `Bedste hold (holdets ${gcTopN} bedste ryttere)`, ex: `holdets ${gcTopN} bedste målplaceringer lægges sammen — laveste sum vinder. Et hold med færre end ${gcTopN} ryttere i mål tæller ikke med` },
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
          På hver etape tipper du <strong>cykelhold</strong> på fire spørgsmål. Du
          får <strong>podie-point</strong> efter hvor dit hold placerer sig — point
          for både 1.-, 2.- og 3.-pladsen (tallene nedenfor):
        </p>
        <table className="table" style={{ fontSize: '0.88rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: '0.78rem', color: 'var(--c-muted)' }}>1. / 2. / 3.</th>
              <th style={{ textAlign: 'left' }}></th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <td style={{ width: '4.6rem' }}>
                  <span className="badge badge--green" style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                    {(Array.isArray(r.pts) ? r.pts : [r.pts]).join(' / ')} p
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
            <strong>Ikke alle spørgsmål på alle etaper:</strong> enkeltstarter og holdtidskørsler har færre spørgsmål — du tipper kun det, der reelt uddeles point for.
          </li>
          <li>
            <strong>Bonus:</strong> hvert bonusspørgsmål giver de point, der står ved spørgsmålet, hvis du svarer rigtigt.
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
