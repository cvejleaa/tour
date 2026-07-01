// ---------------------------------------------------------------------------
// TeamsPage – oversigt over de 23 hold (/hold). Hvert kort linker til holdets
// egen side. Kan sorteres efter navn, holdets verdensrang eller summen af
// rytternes verdensrangsplacering (startlisten; uden for top-2000 = nr. 2000).
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Hero from '../components/Hero';
import { TEAMS, prettyTeam } from '../data/tourTeams2026';
import { teamProfile } from '../data/teamProfiles2026';
import { staticStartlist } from '../data/startlist2026';
import { useStartlist } from '../features/teams/useStartlist';
import RiderSearch from '../features/teams/RiderSearch';
import { buildRiderIndex } from '../features/teams/riderSearch';
import { teamWorldRank, riderRankSum } from '../data/uciRanking2026';

const SORTS = [
  { key: 'name', label: 'Navn' },
  { key: 'rank', label: 'Verdensrang (hold)' },
  { key: 'sum', label: 'Rytter-sum' },
];

export default function TeamsPage() {
  const live = useStartlist();
  const [sort, setSort] = useState('name');

  const isAnnounced = (code) => (live.byCode[code]?.announced ?? staticStartlist(code)?.announced) === true;
  const ridersOf = (code) => (live.byCode[code]?.riders ?? staticStartlist(code)?.riders ?? []);
  const announcedCount = TEAMS.filter((t) => isAnnounced(t.code)).length;

  // Fladt rytter-indeks til søgning (opdateres når den live startliste ændrer sig).
  const riderIndex = useMemo(
    () => buildRiderIndex(TEAMS, ridersOf, prettyTeam),
    [live], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Dekorér + sortér holdene efter det valgte kriterium.
  const rows = useMemo(() => {
    const decorated = TEAMS.map((t) => {
      const wr = teamWorldRank(t.code);
      const sum = riderRankSum(ridersOf(t.code), t.code); // null hvis ingen startliste
      return { t, teamRank: wr ? wr.rank : Infinity, sum: sum == null ? Infinity : sum };
    });
    const byName = (a, b) => prettyTeam(a.t.name).localeCompare(prettyTeam(b.t.name), 'da');
    decorated.sort((a, b) => {
      if (sort === 'rank') return (a.teamRank - b.teamRank) || byName(a, b);
      if (sort === 'sum') return (a.sum - b.sum) || byName(a, b);
      return byName(a, b);
    });
    return decorated;
  }, [sort, live]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <Hero
        title="Hold"
        subtitle="Overblik over de 23 hold og deres primære profil. Klik på et hold for at se det nærmere."
        chips={[`${TEAMS.length} hold`, `${announcedCount} har udtaget`]}
      />

      {/* Søg efter en rytter på tværs af holdene */}
      <RiderSearch index={riderIndex} />

      {/* Sortering */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>Sortér efter:</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSort(s.key)}
            data-testid={`sort-${s.key}`}
            className={`btn btn--sm ${sort === s.key ? '' : 'btn--ghost'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sort === 'sum' && (
        <p style={{ fontSize: '0.76rem', color: 'var(--c-muted)', margin: '0.4rem 0 0' }}>
          Σ = summen af startlistens rytteres verdensrang (uden for top-2000 tæller som 2000). Hold uden offentliggjort startliste vises sidst.
        </p>
      )}

      <div
        data-testid="teams-grid"
        style={{
          display: 'grid', gap: '0.6rem', marginTop: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        }}
      >
        {rows.map(({ t, sum }) => (
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
            {teamProfile(t.code) && (
              <span style={{ fontSize: '0.75rem', color: 'var(--c-muted)', lineHeight: 1.25 }}>
                {teamProfile(t.code).profile}
              </span>
            )}
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {teamWorldRank(t.code) && (
                <span className="badge badge--muted" style={{ fontSize: '0.68rem' }} title="UCI verdensrang">
                  🌍 #{teamWorldRank(t.code).rank}
                </span>
              )}
              {sort === 'sum' && Number.isFinite(sum) && (
                <span className="badge badge--muted" style={{ fontSize: '0.68rem' }} title="Sum af rytternes verdensrang">
                  Σ {sum.toLocaleString('da-DK')}
                </span>
              )}
              <span
                className={`badge ${isAnnounced(t.code) ? 'badge--green' : 'badge--muted'}`}
                style={{ fontSize: '0.68rem' }}
              >
                {isAnnounced(t.code) ? '✅ Udtaget' : '⏳ Afventer'}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
