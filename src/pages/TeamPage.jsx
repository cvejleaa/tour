// ---------------------------------------------------------------------------
// TeamPage – ét holds egen side (/hold/:code). Header med logo/trøje/farve, en
// kurateret PROFIL (disciplin + nøgleryttere) og den fulde STARTLISTE (live fra
// Firestore, ellers statisk snapshot) med danske ryttere fremhævet. Hold der
// endnu ikke har udtaget vises med en "afventer"-tilstand.
// ---------------------------------------------------------------------------
import { useParams, Link } from 'react-router-dom';
import Hero from '../components/Hero';
import { teamMeta, prettyTeam } from '../data/tourTeams2026';
import { teamProfile, normRiderName } from '../data/teamProfiles2026';
import { staticStartlist } from '../data/startlist2026';
import { useStartlist } from '../features/teams/useStartlist';
import { teamWorldRank, riderWorldRank } from '../data/uciRanking2026';

function RiderList({ riders, starNames }) {
  return (
    <ul data-testid="rider-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.3rem' }}>
      {riders.map((r, i) => {
        const isDane = r.country === 'Danmark';
        const isStar = starNames?.has(normRiderName(r.name));
        const wr = riderWorldRank(r.name); // verdensrang hvis rytteren er i top-N
        return (
          <li
            key={`${r.name || i}`}
            data-testid="rider-row"
            style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.92rem' }}
          >
            {isStar && <span title="Hovednavn">⭐</span>}
            <span style={{ fontWeight: isDane || isStar ? 800 : 600 }}>{r.name || '—'}</span>
            {isDane && <span title="Dansk rytter">🇩🇰</span>}
            {wr && (
              <span className="badge badge--muted" title={`UCI verdensrang · ${wr.points} point`} style={{ fontSize: '0.7rem' }}>
                🌍 #{wr.rank}
              </span>
            )}
            {r.country && <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>· {r.country}</span>}
          </li>
        );
      })}
    </ul>
  );
}


export default function TeamPage() {
  const { code } = useParams();
  const meta = teamMeta(code);
  const live = useStartlist();

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
  const profile = teamProfile(meta.code);
  const starNames = new Set((profile?.stars || []).map((s) => normRiderName(s.name)));
  const teamRank = teamWorldRank(meta.code);
  // Startliste: foretræk den live (Firestore) frem for den statiske snapshot.
  const startlist = live.byCode[meta.code] || staticStartlist(meta.code) || { announced: false, riders: [] };
  const riders = Array.isArray(startlist.riders) ? startlist.riders : [];

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
              {teamRank && (
                <span
                  className="badge" data-testid="team-world-rank"
                  title={`UCI verdensrang · ${teamRank.points.toLocaleString('da-DK')} point`}
                  style={{ fontSize: '0.74rem', background: 'var(--c-pitch)', color: '#fff' }}
                >
                  🌍 Verdensrang #{teamRank.rank}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Profil + nøgleryttere (kurateret) */}
        {profile && (
          <section data-testid="team-profile" style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ marginBottom: '0.4rem' }}>Profil</h3>
            <p style={{ margin: '0 0 0.6rem' }}>
              <span className="badge" style={{ background: accent, color: '#fff', fontSize: '0.8rem' }}>
                {profile.profile}
              </span>
            </p>
            {profile.stars?.length > 0 && (
              <>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>
                  Hovednavne 2026
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {profile.stars.map((s) => (
                    <li key={s.name} data-testid="key-rider" className="badge badge--muted" style={{ fontSize: '0.85rem' }}>
                      ⭐ {s.name}{s.note ? <span style={{ color: 'var(--c-muted)' }}> · {s.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {profile.goal && (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.85rem' }}>
                <strong>Mål:</strong> {profile.goal}
              </p>
            )}
          </section>
        )}

        {/* Ryttere – fuld startliste (live fra Firestore eller statisk snapshot) */}
        <section data-testid="riders-section">
          <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Ryttere
            <span
              className={`badge ${startlist.announced ? 'badge--green' : 'badge--muted'}`}
              style={{ fontSize: '0.72rem' }}
            >
              {startlist.announced ? '✅ Udtaget' : '⏳ Afventer'}
            </span>
          </h3>
          {riders.length > 0 ? (
            <RiderList riders={riders} starNames={starNames} />
          ) : (
            <p data-testid="riders-pending" style={{ margin: 0, color: 'var(--c-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {meta.name} har endnu ikke udtaget sit hold til touren. Rytterne vises
              her automatisk, så snart de er offentliggjort (typisk tættere på
              løbsstart 4. juli).
            </p>
          )}
        </section>
      </div>

      <Link className="btn btn--ghost" to="/hold" style={{ marginTop: '0.75rem' }}>← Alle hold</Link>
    </div>
  );
}
