/**
 * LeagueActivity — viser ligaens seneste hændelser (tilmeldinger, kommentarer m.m.).
 */
import { useLeagueActivity } from './useLeagueActivity';
import { ACTIVITY } from './activityActions';
import { formatTimestamp } from '../comments/formatTimestamp';

const ICON = {
  [ACTIVITY.JOIN]: '➕',
  [ACTIVITY.LEAVE]: '➖',
  [ACTIVITY.COMMENT]: '💬',
  [ACTIVITY.RENAME]: '✏️',
  [ACTIVITY.CREATED]: '🎉',
};

export default function LeagueActivity({ leagueId }) {
  const { items, loading } = useLeagueActivity(leagueId);

  return (
    <div className="card mt-2">
      <h3 className="card__title mb-2">📣 Aktivitet</h3>
      {loading ? (
        <div className="spinner" role="status" aria-label="Indlæser" />
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }}>Ingen aktivitet endnu.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {items.map((a) => (
            <li key={a.id} data-testid="activity-item" style={{ fontSize: '0.86rem', display: 'flex', gap: '0.45rem', alignItems: 'baseline' }}>
              <span aria-hidden="true">{ICON[a.type] || '•'}</span>
              <span style={{ flex: 1 }}>
                <strong>{a.actorName || 'Spiller'}</strong> {a.text}
              </span>
              <time style={{ fontSize: '0.72rem', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>
                {formatTimestamp(a.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
