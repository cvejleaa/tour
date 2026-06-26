// ---------------------------------------------------------------------------
// TeamPage – ét holds kampe (spillede + kommende). Nås ved at klikke på et
// hold via <TeamLink> overalt i appen (/hold/:code).
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMatches } from '../features/matches/useMatches';
import {
  formatKickoffDate, formatKickoffTime, roundLabel, teamMatchOutcome,
} from '../features/matches/matchHelpers';
import { teamName, TEAMS } from '../lib/teams';
import { MATCH_STATUS } from '../lib/constants';
import Flag from '../components/Flag';
import TeamLink from '../components/TeamLink';

const OUTCOME = {
  win:  { label: 'Vundet',    cls: 'badge--green', chip: 'V', color: 'var(--c-ok)' },
  draw: { label: 'Uafgjort',  cls: 'badge--muted', chip: 'U', color: 'var(--c-muted)' },
  loss: { label: 'Tabt',      cls: 'badge--muted', chip: 'T', color: 'var(--c-err)' },
};

function FormChips({ outcomes }) {
  if (!outcomes.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {outcomes.slice(-5).map((o, i) => (
        <span key={i} title={OUTCOME[o].label} style={{
          width: 18, height: 18, borderRadius: 4, fontSize: '0.66rem', fontWeight: 700,
          color: '#fff', background: OUTCOME[o].color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{OUTCOME[o].chip}</span>
      ))}
    </span>
  );
}

function TeamMatchRow({ match, code }) {
  const isHome = match.homeTeam === code;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  const opponentName = opponent ? teamName(opponent) : (isHome ? match.awayPlaceholder : match.homePlaceholder) || 'TBD';
  const finished = match.status === MATCH_STATUS.FINISHED && match.result;
  const live = match.status === MATCH_STATUS.LIVE;
  const outcome = finished ? teamMatchOutcome(match, code) : null;
  const roundTxt = match.round === 'group'
    ? (match.groupName ? `Gruppe ${match.groupName}` : 'Gruppespil')
    : roundLabel(match.round);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.5rem 0.2rem', borderBottom: '1px solid var(--c-border)', fontSize: '0.9rem',
    }}>
      <span className="badge badge--muted" style={{ fontSize: '0.66rem', minWidth: 24, textAlign: 'center' }}>
        {isHome ? 'H' : 'U'}
      </span>
      <TeamLink code={opponent} style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {opponent ? <Flag code={opponent} size={20} /> : <span>❓</span>}
          <span style={{ fontWeight: 600 }}>{opponentName}</span>
        </span>
      </TeamLink>
      <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>{roundTxt}</span>
      {finished ? (
        <>
          <strong style={{ fontVariantNumeric: 'tabular-nums', minWidth: 42, textAlign: 'center' }}>
            {match.result.home}–{match.result.away}
          </strong>
          {outcome && <span className={`badge ${OUTCOME[outcome].cls}`} style={{ fontSize: '0.66rem' }}>{OUTCOME[outcome].label}</span>}
        </>
      ) : live ? (
        <span className="badge badge--red" style={{ fontSize: '0.68rem' }}>LIVE</span>
      ) : (
        <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>
          {formatKickoffDate(match.kickoff)} · {formatKickoffTime(match.kickoff)}
        </span>
      )}
    </div>
  );
}

export default function TeamPage() {
  const { code } = useParams();
  const { matches, loading, error } = useMatches();

  const teamMatches = useMemo(
    () => matches.filter((m) => m.homeTeam === code || m.awayTeam === code),
    [matches, code],
  );

  const played = teamMatches.filter((m) => m.status === MATCH_STATUS.FINISHED && m.result);
  const upcoming = teamMatches.filter((m) => !(m.status === MATCH_STATUS.FINISHED && m.result));
  const outcomes = played.map((m) => teamMatchOutcome(m, code)).filter(Boolean);
  const record = {
    win: outcomes.filter((o) => o === 'win').length,
    draw: outcomes.filter((o) => o === 'draw').length,
    loss: outcomes.filter((o) => o === 'loss').length,
  };

  const known = !!TEAMS[code];

  if (loading) {
    return (
      <div className="container">
        <div className="spinner" aria-label="Henter hold…" />
      </div>
    );
  }

  return (
    <div className="container">
      <Link to="/turnering" className="badge badge--muted" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '0.75rem' }}>
        ← Turnering
      </Link>

      {/* Holdoverskrift */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <Flag code={code} size={44} />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{known ? teamName(code) : 'Ukendt hold'}</h1>
          {played.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: 4 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>
                {record.win} V · {record.draw} U · {record.loss} T
              </span>
              <FormChips outcomes={outcomes} />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--c-err)' }}>
          <p style={{ color: 'var(--c-err)', margin: 0 }}>Kunne ikke hente kampe.</p>
        </div>
      )}

      {!error && teamMatches.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🏟️</div>
          <div className="empty-state__title">Ingen kampe fundet for dette hold</div>
        </div>
      )}

      {played.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Spillede kampe</h2>
          {played.map((m) => <TeamMatchRow key={m.id} match={m} code={code} />)}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="card">
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Kommende kampe</h2>
          {upcoming.map((m) => <TeamMatchRow key={m.id} match={m} code={code} />)}
        </div>
      )}
    </div>
  );
}
