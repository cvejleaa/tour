// Kapløbet om guldstøvlen — turneringens topscorere fra football-data.org.
// TopScorersList er ren præsentation (genbruges i forhåndsvisningen);
// TopScorersCard henter live-data via hook'en.
import { useTopScorers } from './useTopScorers';
import { nationalityFlagUrl } from '../../lib/nationality';
import { playerAge, positionDa } from '../../lib/players';

const MEDAL = ['🥇', '🥈', '🥉'];

function formatUpdated(ts) {
  if (!ts) return null;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('da-DK', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

/**
 * @param {{ list: Array<object>, limit?: number, title?: string, updatedAt?: any }} props
 */
export function TopScorersList({ list, limit = 10, title = '⚽ Kapløbet om guldstøvlen', updatedAt = null }) {
  if (!list || list.length === 0) return null;
  const rows = list.slice(0, limit);
  const updated = formatUpdated(updatedAt);
  const showAssists = rows.some((r) => r.assists != null);
  const showPens = rows.some((r) => r.penalties != null && r.penalties > 0);

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>{title}</h2>
        {updated && <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>Opdateret {updated}</span>}
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
        {rows.map((s, idx) => (
          <li
            key={`${s.rank}-${s.playerId ?? s.playerName}`}
            style={{
              display: 'grid', gridTemplateColumns: '1.6rem minmax(0, 1fr) auto',
              alignItems: 'center', gap: '0.7rem', padding: '0.45rem 0',
              borderBottom: idx === rows.length - 1 ? 'none' : '1px solid var(--c-border)',
            }}
          >
            <span style={{ textAlign: 'center', fontWeight: 700, fontSize: s.rank <= 3 ? '1.05rem' : '0.9rem', color: s.rank <= 3 ? 'inherit' : 'var(--c-muted)' }}>
              {MEDAL[s.rank - 1] ?? s.rank}
            </span>

            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {(() => {
                  const flag = nationalityFlagUrl(s.nationality, 20);
                  return flag ? (
                    <img src={flag} alt={s.nationality} title={s.nationality} width={18} height={13}
                      loading="lazy" style={{ borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,0.08)', flexShrink: 0 }} />
                  ) : null;
                })()}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.playerName}</span>
              </span>
              {(() => {
                const pos = positionDa(s.position);
                const age = playerAge(s.dateOfBirth);
                const meta = [s.teamName, pos, age != null ? `${age} år` : null].filter(Boolean).join(' · ');
                return meta ? (
                  <span style={{ color: 'var(--c-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {meta}
                  </span>
                ) : null;
              })()}
            </span>

            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.3rem' }}>
                <strong style={{ fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums' }}>{s.goals}</strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--c-muted)' }}>mål</span>
              </span>
              {(showAssists || showPens) && (
                <span style={{ fontSize: '0.7rem', color: 'var(--c-muted)' }}>
                  {showAssists && s.assists != null ? `${s.assists} assist${s.assists === 1 ? '' : 's'}` : ''}
                  {showAssists && s.assists != null && showPens && s.penalties > 0 ? ' · ' : ''}
                  {showPens && s.penalties > 0 ? `${s.penalties} str.` : ''}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TopScorersCard({ limit = 10 }) {
  const { list, updatedAt, loading } = useTopScorers();
  // Vis intet hvis der ikke er data endnu (fx før turneringen).
  if (loading) return null;
  return <TopScorersList list={list} updatedAt={updatedAt} limit={limit} />;
}
