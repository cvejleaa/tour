/**
 * TodoCard — samlet "Mine opgaver"-kort på forsiden. Viser i ét card alt det,
 * brugeren mangler at svare på inden deadline: kampe, globale bonus og
 * liga-bonus pr. liga. Alt rødt = "mangler"; grøn = alt besvaret.
 */
import { Link } from 'react-router-dom';
import { useTasks } from '../../context/TasksContext';

function TaskRow({ to, label, count }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between"
      style={{
        textDecoration: 'none', color: 'var(--c-text)', padding: '0.6rem 0.75rem',
        borderRadius: 10, background: 'var(--c-surface-2, rgba(0,0,0,0.03))', gap: '0.75rem',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
        <span className="badge badge--red" style={{ minWidth: 26, justifyContent: 'center', fontWeight: 800 }}>
          {count}
        </span>
        <span style={{ fontWeight: 600 }}>{label}</span>
      </span>
      <span aria-hidden style={{ color: 'var(--c-muted)', fontWeight: 700 }}>›</span>
    </Link>
  );
}

export default function TodoCard() {
  const { matchCount, bonusCount, leagueBonus, total } = useTasks();

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="flex items-center justify-between mb-2" style={{ gap: '0.5rem' }}>
        <h2 className="card__title" style={{ margin: 0 }}>📋 Mine opgaver</h2>
        {total > 0
          ? <span className="badge badge--red" style={{ fontWeight: 800 }}>{total} mangler</span>
          : <span className="badge badge--green" style={{ fontWeight: 800 }}>Alt besvaret ✓</span>}
      </div>

      {total === 0 ? (
        <p style={{ margin: 0, color: 'var(--c-muted)', fontSize: '0.9rem' }}>
          Godt gået – du har svaret på alt, der er åbent lige nu. 🎉
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {matchCount > 0 && (
            <TaskRow to="/kampe?filter=utippede" count={matchCount}
              label={matchCount === 1 ? 'kamp mangler tip' : 'kampe mangler tip'} />
          )}
          {bonusCount > 0 && (
            <TaskRow to="/bonus" count={bonusCount}
              label={bonusCount === 1 ? 'bonusspørgsmål åbent' : 'bonusspørgsmål åbne'} />
          )}
          {leagueBonus.byLeague.map((row) => (
            <TaskRow key={row.leagueId} to="/ligaer" count={row.count}
              label={`${row.name}: liga-spørgsmål mangler`} />
          ))}
        </div>
      )}
    </div>
  );
}
