// ---------------------------------------------------------------------------
// TeamsPage – oversigt over de 23 hold (/hold). Hvert kort linker til holdets
// egen side. Bruger den statiske holdliste (TEAMS) med trøje/logo/farve.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import Hero from '../components/Hero';
import { TEAMS, prettyTeam } from '../data/tourTeams2026';

export default function TeamsPage() {
  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <Hero
        title="Hold"
        subtitle="De 23 hold i Tour de France 2026. Klik på et hold for at se det nærmere."
        chips={[`${TEAMS.length} hold`]}
      />

      <div
        data-testid="teams-grid"
        style={{
          display: 'grid', gap: '0.6rem', marginTop: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        }}
      >
        {TEAMS.map((t) => (
          <Link
            key={t.code}
            to={`/hold/${t.code}`}
            data-testid={`team-card-${t.code}`}
            className="card"
            style={{
              textDecoration: 'none', color: 'inherit', display: 'flex',
              flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
              textAlign: 'center', padding: '0.8rem 0.6rem',
              borderTop: `4px solid ${t.color && t.color !== '#000000' ? t.color : 'var(--c-pitch)'}`,
            }}
          >
            {t.jersey && (
              <img src={t.jersey} alt="" loading="lazy" style={{ width: 60, height: 60, objectFit: 'contain' }} />
            )}
            <span style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>{prettyTeam(t.name)}</span>
            {t.nationality && (
              <span className="badge badge--muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>
                {t.nationality}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
