// 2.-halvlegs-fakta: hvor ofte stillingen ændrede sig efter pausen, comebacks
// og clean sheets pr. hold.
import { computeSecondHalfStats } from './statsUtils';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';
import TeamLink from '../../components/TeamLink';

export default function SecondHalfCard({ matches }) {
  const { withHalfTime, changedAfterHalf, comebacks, cleanSheets } = computeSecondHalfStats(matches);
  if (withHalfTime === 0 && cleanSheets.length === 0) return null;

  const pct = withHalfTime ? Math.round((changedAfterHalf / withHalfTime) * 100) : 0;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.6rem', fontSize: '1.15rem' }}>🔄 Efter pausen</h2>

      {withHalfTime > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <span className="badge badge--blue">{changedAfterHalf} af {withHalfTime} kampe skiftede udfald efter pausen ({pct}%)</span>
          <span className="badge badge--green">{comebacks.length} comeback{comebacks.length === 1 ? '' : 's'}</span>
        </div>
      )}

      {comebacks.length > 0 && (
        <div style={{ fontSize: '0.85rem', marginBottom: cleanSheets.length ? '0.6rem' : 0 }}>
          <span style={{ color: 'var(--c-muted)' }}>Comebacks: </span>
          {comebacks.map(({ match, team }) => (
            <span key={match.id} className="badge badge--muted" style={{ marginRight: 4 }}>
              {teamName(team)} ({match.result.home}–{match.result.away})
            </span>
          ))}
        </div>
      )}

      {cleanSheets.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Flest clean sheets</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {cleanSheets.slice(0, 5).map((c) => (
              <li key={c.team} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.15rem 0', fontSize: '0.86rem' }}>
                <TeamLink code={c.team} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Flag code={c.team} size={18} /> {teamName(c.team)}
                </TeamLink>
                <strong style={{ marginLeft: 'auto' }}>{c.count}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
