// ---------------------------------------------------------------------------
// TeamPage – ét holds egen side (/hold/:code). Header med logo/trøje/farve +
// en RYTTER-sektion der er klar til at vise startlisten, så snart den er på
// plads (meta.riders). Indtil da vises en pæn "kommer snart"-tilstand.
// ---------------------------------------------------------------------------
import { useParams, Link } from 'react-router-dom';
import Hero from '../components/Hero';
import { teamMeta, prettyTeam } from '../data/tourTeams2026';

function RiderList({ riders }) {
  return (
    <ul data-testid="rider-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.3rem' }}>
      {riders.map((r, i) => (
        <li
          key={`${r.name || r.bib || i}`}
          data-testid="rider-row"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem' }}
        >
          {r.bib != null && (
            <span className="badge badge--muted" style={{ minWidth: 28, textAlign: 'center', fontSize: '0.74rem' }}>
              {r.bib}
            </span>
          )}
          <span style={{ fontWeight: 600 }}>{r.name || '—'}</span>
          {r.role && <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>· {r.role}</span>}
          {r.nationality && (
            <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)', textTransform: 'uppercase' }}>
              {r.nationality}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function TeamPage() {
  const { code } = useParams();
  const meta = teamMeta(code);

  if (!meta) {
    return (
      <div className="page" style={{ paddingBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Hold ikke fundet</h2>
          <p style={{ color: 'var(--c-muted)' }}>Vi kunne ikke finde holdet «{code}».</p>
          <Link className="btn" to="/hold">Tilbage til holdene</Link>
        </div>
      </div>
    );
  }

  const accent = meta.color && meta.color !== '#000000' ? meta.color : 'var(--c-pitch)';
  const riders = Array.isArray(meta.riders) ? meta.riders : [];

  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <Hero title={prettyTeam(meta.name)} subtitle="Hold · Tour de France 2026" chips={meta.nationality ? [meta.nationality.toUpperCase()] : []} />

      <div className="card" data-testid="team-presentation" style={{ borderTop: `4px solid ${accent}` }}>
        {/* Header: logo + trøje + navn */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {meta.logo && <img src={meta.logo} alt="" loading="lazy" style={{ width: 72, height: 72, objectFit: 'contain' }} />}
          {meta.jersey && <img src={meta.jersey} alt="Holdtrøje" loading="lazy" style={{ width: 72, height: 72, objectFit: 'contain' }} />}
          <div>
            <h2 style={{ margin: 0 }}>{prettyTeam(meta.name)}</h2>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
              <span className="badge badge--muted" style={{ fontSize: '0.74rem' }}>{meta.code}</span>
              {meta.nationality && (
                <span className="badge badge--muted" style={{ fontSize: '0.74rem', textTransform: 'uppercase' }}>{meta.nationality}</span>
              )}
            </div>
          </div>
        </div>

        {/* Ryttere – klar til at modtage startlisten */}
        <section data-testid="riders-section">
          <h3 style={{ marginBottom: '0.5rem' }}>Ryttere</h3>
          {riders.length > 0 ? (
            <RiderList riders={riders} />
          ) : (
            <p data-testid="riders-pending" style={{ margin: 0, color: 'var(--c-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Startlisten er ikke offentliggjort endnu. Holdets ryttere vises her,
              så snart de er på plads (typisk tættere på løbsstart 4. juli).
            </p>
          )}
        </section>
      </div>

      <Link className="btn btn--ghost" to="/hold" style={{ marginTop: '0.75rem' }}>← Alle hold</Link>
    </div>
  );
}
