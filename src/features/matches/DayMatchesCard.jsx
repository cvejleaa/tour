// Forside-kort: kampe på en valgt dag (kan bladre dag for dag). Viser resultat
// for spillede/igangværende kampe, ellers kickoff-tidspunkt.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dayKey, tournamentDays, formatKickoffTime } from './matchHelpers';
import { teamName } from '../../lib/teams';
import { MATCH_STATUS } from '../../lib/constants';
import Flag from '../../components/Flag';
import TeamLink from '../../components/TeamLink';
import DaySelector from '../../components/DaySelector';

function Row({ match }) {
  const finished = match.status === MATCH_STATUS.FINISHED && match.result;
  const live = match.status === MATCH_STATUS.LIVE && match.result;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.1rem', borderBottom: '1px solid var(--c-border)', fontSize: '0.86rem' }}>
      <TeamLink code={match.homeTeam} style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end' }}>
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamName(match.homeTeam)}</span>
        {match.homeTeam ? <Flag code={match.homeTeam} size={18} /> : null}
      </TeamLink>
      <span style={{ minWidth: 54, textAlign: 'center' }}>
        {finished || live ? (
          <strong style={{ fontVariantNumeric: 'tabular-nums', color: live ? 'var(--c-err)' : 'var(--c-text)' }}>
            {match.result.home}–{match.result.away}
          </strong>
        ) : (
          <span style={{ color: 'var(--c-muted)', fontSize: '0.8rem' }}>{formatKickoffTime(match.kickoff)}</span>
        )}
      </span>
      <TeamLink code={match.awayTeam} style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
        {match.awayTeam ? <Flag code={match.awayTeam} size={18} /> : null}
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamName(match.awayTeam)}</span>
      </TeamLink>
    </div>
  );
}

export default function DayMatchesCard({ matches }) {
  const days = useMemo(() => tournamentDays(matches), [matches]);
  const [day, setDay] = useState(null);

  useEffect(() => {
    if (day == null && days.length > 0) {
      const today = dayKey(new Date());
      setDay(days.includes(today) ? today : days[0]);
    }
  }, [days, day]);

  const dayMatches = useMemo(
    () => matches.filter((m) => dayKey(m.kickoff) === day),
    [matches, day],
  );

  if (days.length === 0) return null;

  return (
    <div className="card" data-testid="day-matches-card" style={{ marginBottom: '1rem' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
        <h2 className="card__title" style={{ margin: 0 }}>Kampe</h2>
        <Link to="/kampe" className="badge badge--blue" style={{ textDecoration: 'none' }}>Alle kampe →</Link>
      </div>
      <DaySelector days={days} value={day} onChange={setDay} testId="dashboard-day-selector" />
      {dayMatches.length === 0 ? (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: 0 }}>Ingen kampe denne dag.</p>
      ) : (
        dayMatches.map((m) => <Row key={m.id} match={m} />)
      )}
    </div>
  );
}
