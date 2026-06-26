// Officiel stilling fra football-data.org med form-stime.
// Genbruges til VM-gruppetabeller og til forhåndsvisningen (Bundesliga m.fl.).

const FORM_COLOR = { W: 'var(--c-ok)', D: 'var(--c-muted)', L: 'var(--c-err)' };

function Form({ form }) {
  if (!form) return null;
  const items = String(form).replace(/[\s]/g, '').split(/[,]/).join('').split('');
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {items.slice(-5).map((c, i) => (
        <span
          key={i}
          title={c}
          style={{
            width: 16, height: 16, borderRadius: 4, fontSize: '0.62rem', fontWeight: 700,
            color: '#fff', background: FORM_COLOR[c] ?? 'var(--c-muted)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

function groupLabel(t) {
  return (t.group || t.stage || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function OneTable({ table, showForm }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
      <thead>
        <tr style={{ color: 'var(--c-muted)', textAlign: 'left' }}>
          <th style={{ padding: '0.3rem 0.4rem' }}>#</th>
          <th style={{ padding: '0.3rem 0.4rem' }}>Hold</th>
          <th style={{ padding: '0.3rem 0.3rem', textAlign: 'center' }}>K</th>
          <th style={{ padding: '0.3rem 0.3rem', textAlign: 'center' }}>MF</th>
          <th style={{ padding: '0.3rem 0.3rem', textAlign: 'center' }}>P</th>
          {showForm && <th style={{ padding: '0.3rem 0.4rem' }}>Form</th>}
        </tr>
      </thead>
      <tbody>
        {table.map((r) => (
          <tr key={r.position + r.teamName} style={{ borderTop: '1px solid var(--c-border)' }}>
            <td style={{ padding: '0.3rem 0.4rem', fontWeight: 700 }}>{r.position}</td>
            <td style={{ padding: '0.3rem 0.4rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                {r.crest && <img src={r.crest} alt="" width={16} height={16} style={{ objectFit: 'contain' }} />}
                {r.teamName}
              </span>
            </td>
            <td style={{ padding: '0.3rem 0.3rem', textAlign: 'center', color: 'var(--c-muted)' }}>{r.played}</td>
            <td style={{ padding: '0.3rem 0.3rem', textAlign: 'center' }}>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
            <td style={{ padding: '0.3rem 0.3rem', textAlign: 'center', fontWeight: 700 }}>{r.points}</td>
            {showForm && <td style={{ padding: '0.3rem 0.4rem' }}><Form form={r.form} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * @param {{ tables: Array<{stage,group,table}>, title?: string }} props
 */
export default function StandingsTable({ tables, title = '📊 Stilling' }) {
  if (!tables || tables.length === 0) return null;
  const showForm = tables.some((t) => t.table?.some((r) => r.form));
  const multi = tables.length > 1;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem' }}>{title}</h2>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: multi ? 'repeat(auto-fit, minmax(260px, 1fr))' : '1fr' }}>
        {tables.map((t, i) => (
          <div key={i}>
            {multi && <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.2rem' }}>{groupLabel(t)}</div>}
            <OneTable table={t.table || []} showForm={showForm} />
          </div>
        ))}
      </div>
    </div>
  );
}
