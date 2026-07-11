// ---------------------------------------------------------------------------
// RiderTypeExplorer – klik på en ryttertype (Kaptajn/Bjergrytter/Sprinter/
// Allrounder) og få en sorterbar tabel over alle ryttere af den type med
// deres placering/point/tid i hver konkurrence indtil videre i touren.
// ---------------------------------------------------------------------------
import { Fragment, useMemo, useState } from 'react';
import { useClassifications } from '../tour/useClassifications';
import { profileLabel, prettyRiderName, isDanishRider } from '../../data/ridersTdf2026';
import { riderFlag } from '../../data/uciRanking2026';
import { prettyTeam, teamMeta } from '../../data/tourTeams2026';
import { useRiderProfiles } from '../riders/useRiderProfiles';
import { STAT_COMPS, buildRiderStats, riderRowsForProfile, riderRowsForBibs, riderRowComparator, groupRowsByTeam } from './riderTypeStats';

const PROFILES = ['leader', 'climber', 'sprinter', 'polyvalent'];

/** Lille tag-chip. AI-tags markeres diskret med ✨ + evidens som tooltip. */
function TagChip({ tag }) {
  const ai = tag.source === 'ai';
  return (
    <span
      data-testid="rider-tag"
      title={ai && tag.evidence ? `AI · etape ${tag.stage ?? '?'}: ${tag.evidence}` : (ai ? 'AI-udledt' : 'manuelt tag')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        fontSize: '0.68rem', fontWeight: 600, lineHeight: 1.4,
        padding: '0 6px', borderRadius: 999,
        background: ai ? 'rgba(120,80,200,0.12)' : 'var(--c-surface-alt, #eef3f0)',
        color: ai ? 'var(--c-accent, #6a44c7)' : 'var(--c-muted)',
      }}
    >
      {ai && <span aria-hidden>✨</span>}{tag.label}
    </span>
  );
}

function statCell(stat, valueType) {
  if (!stat) return <span style={{ color: 'var(--c-muted)' }}>–</span>;
  if (valueType === 'points') {
    return stat.points != null
      ? <span style={{ fontWeight: 600 }}>{stat.points} p</span>
      : <span style={{ color: 'var(--c-muted)' }}>–</span>;
  }
  // Tid: vis placering + tid (tid som sekundær).
  if (stat.rank == null) return <span style={{ color: 'var(--c-muted)' }}>–</span>;
  return (
    <span>
      <strong>#{stat.rank}</strong>
      {stat.time ? <span style={{ color: 'var(--c-muted)', marginLeft: 4, fontSize: '0.82em' }}>{stat.time}</span> : null}
    </span>
  );
}

function RiderRow({ row, showTeam, tags = [] }) {
  const name = prettyRiderName(`${row.first} ${row.last}`);
  const danish = isDanishRider(name);
  const flag = danish ? '🇩🇰' : riderFlag(name);
  return (
    <tr data-testid="rider-row" style={danish ? { background: 'rgba(198,12,48,0.06)' } : undefined}>
      <td>
        <div style={{ whiteSpace: 'nowrap' }}>
          {flag && <span aria-hidden style={{ marginRight: 4 }}>{flag}</span>}
          <span style={{ fontWeight: 600 }}>{name}</span>
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
            {tags.map((t) => <TagChip key={`${t.source}-${t.label}`} tag={t} />)}
          </div>
        )}
      </td>
      <td style={{ whiteSpace: 'nowrap', color: 'var(--c-muted)' }}>
        {showTeam ? row.teamName : ''}
      </td>
      {STAT_COMPS.map((c) => (
        <td key={c.key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {statCell(row.stats[c.key], c.valueType)}
        </td>
      ))}
    </tr>
  );
}

export default function RiderTypeExplorer() {
  const { data, loading } = useClassifications();
  const { tagsForBib, typeOverrides, allTags, bibsForTag } = useRiderProfiles();
  const [profile, setProfile] = useState(null);
  const [tag, setTag] = useState(null);
  const [sortCol, setSortCol] = useState('samlet');
  const [desc, setDesc] = useState(false);
  const [grouped, setGrouped] = useState(false);

  // Ét valg ad gangen: en profiltype ELLER et frit tag.
  const selectProfile = (p) => { setProfile((cur) => (cur === p ? null : p)); setTag(null); };
  const selectTag = (t) => { setTag((cur) => (cur === t ? null : t)); setProfile(null); };
  const active = profile || tag;

  const statsByBib = useMemo(() => buildRiderStats(data?.standings || {}), [data]);

  const rows = useMemo(() => {
    if (!profile && !tag) return [];
    const base = tag
      ? riderRowsForBibs(bibsForTag(tag), statsByBib)
      : riderRowsForProfile(profile, statsByBib, typeOverrides);
    const list = base.map((r) => {
      const meta = teamMeta(r.team);
      return { ...r, teamName: meta ? prettyTeam(meta.name) : r.team, tags: tagsForBib(r.bib) };
    });
    return list.sort(riderRowComparator(sortCol, desc));
  }, [profile, tag, statsByBib, sortCol, desc, typeOverrides, tagsForBib, bibsForTag]);

  // Gruppér på hold: HOLDENE sorteres efter deres samlede værdi i den valgte
  // kolonne (fx total bjergpoint), og rytterne bevarer kolonnesorteringen
  // inden for hvert hold. null = flad visning.
  const groups = useMemo(
    () => (grouped ? groupRowsByTeam(rows, sortCol, desc) : null),
    [grouped, rows, sortCol, desc],
  );
  const sortComp = STAT_COMPS.find((c) => c.key === sortCol);

  function toggleSort(col) {
    if (col === sortCol) { setDesc((d) => !d); return; }
    setSortCol(col);
    setDesc(false);
  }

  const arrow = (col) => (col === sortCol ? (desc ? ' ▼' : ' ▲') : '');
  const hasStandings = !!data?.standings && STAT_COMPS.some((c) => (data.standings[c.key] || []).length);

  return (
    <div style={{ marginTop: '1rem' }}>
      <h2 className="card__title" style={{ margin: '0 0 0.4rem' }}>🚴 Ryttertyper</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--c-muted)', margin: '0 0 0.5rem' }}>
        Klik på en type — eller et tag (fx <em>baroudeur</em>) — og se hvordan rytterne står
        i hver konkurrence indtil videre.
      </p>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {PROFILES.map((p) => {
          const meta = profileLabel(p);
          const isActive = p === profile;
          return (
            <button
              key={p}
              type="button"
              onClick={() => selectProfile(p)}
              data-testid={`profile-${p}`}
              className={`btn btn--sm ${isActive ? '' : 'btn--ghost'}`}
            >
              {meta ? `${meta.emoji} ${meta.label}` : p}
            </button>
          );
        })}
        {active && (
          <button
            type="button"
            onClick={() => setGrouped((g) => !g)}
            data-testid="group-teams"
            className={`btn btn--sm ${grouped ? '' : 'btn--ghost'}`}
            style={{ marginLeft: 'auto' }}
          >
            {grouped ? '✓ Grupperet på hold' : '👥 Gruppér på hold'}
          </button>
        )}
      </div>

      {/* Frie tags (manuelle + AI ✨) som klikbare filtre — kun når der er nogen. */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.4rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)', marginRight: 2 }}>Tags:</span>
          {allTags.map((t) => {
            const isActive = t.label === tag;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => selectTag(t.label)}
                data-testid={`tag-filter-${t.label}`}
                className={`btn btn--sm ${isActive ? '' : 'btn--ghost'}`}
                style={{ fontSize: '0.72rem', padding: '0.1rem 0.5rem' }}
              >
                {t.label} <span style={{ opacity: 0.6 }}>{t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {active && (
        <div style={{ marginTop: '0.75rem' }} data-testid="rider-type-table">
          {loading && <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>Henter stillinger…</p>}
          {!loading && !hasStandings && (
            <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>
              Ingen klassement-data endnu — kolonnerne udfyldes når de første etaper er afgjort.
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.84rem' }}>
              <thead>
                <tr>
                  <th
                    style={{ textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    onClick={() => toggleSort('name')}
                    data-testid="sort-name"
                  >
                    Rytter{arrow('name')}
                  </th>
                  <th
                    style={{ textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    onClick={() => toggleSort('team')}
                    data-testid="sort-team"
                  >
                    Hold{arrow('team')}
                  </th>
                  {STAT_COMPS.map((c) => (
                    <th
                      key={c.key}
                      style={{ textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      onClick={() => toggleSort(c.key)}
                      data-testid={`sort-${c.key}`}
                      title={c.label}
                    >
                      {c.icon} {c.label}{arrow(c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups
                  ? groups.map(({ teamName, rows: teamRows, agg }) => (
                    <Fragment key={teamName}>
                      <tr data-testid="team-group">
                        <th
                          colSpan={2 + STAT_COMPS.length}
                          style={{ textAlign: 'left', background: 'var(--c-surface-alt, #f6faf8)', padding: '0.3rem 0.5rem' }}
                        >
                          {teamName}
                          <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> · {teamRows.length} ryttere</span>
                          {sortComp && agg != null && (
                            <span style={{ color: 'var(--c-pitch)', fontWeight: 700, marginLeft: '0.5rem' }}>
                              {sortComp.icon} {sortComp.valueType === 'points' ? `${agg} p` : `bedst #${agg}`}
                            </span>
                          )}
                        </th>
                      </tr>
                      {teamRows.map((r) => <RiderRow key={r.bib} row={r} showTeam={false} tags={r.tags} />)}
                    </Fragment>
                  ))
                  : rows.map((r) => <RiderRow key={r.bib} row={r} showTeam tags={r.tags} />)}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--c-muted)', marginTop: '0.4rem' }}>
            {rows.length} ryttere · klik på en kolonne for at sortere{grouped ? ' inden for hvert hold' : ''}.
          </p>
        </div>
      )}
    </div>
  );
}
