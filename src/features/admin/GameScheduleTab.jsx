/**
 * GameScheduleTab (kun samlet platform) — lad admin/ejer styre HVORNÅR hvert spil
 * går i gang (startAt) og HVORNÅR bonus-/pulje-tippet lukker (puljeLockAt).
 * Bevidst adskilt fra kamp-programmet: bonus-deadline behøver ikke ligge før
 * runde 1 — så der er tid til at få spillere med.
 *
 * Skriver til games/{gameId} (kun admin må skrive — se security rules). Tom
 * dato rydder feltet (ingen deadline / ingen fast start).
 */
import { useEffect, useState } from 'react';
import { useGames } from '../games/useGames';
import { setGameSchedule } from '../games/gameActions';
import { formatKickoff } from '../../lib/daDate';

/** ms → værdi til <input type="datetime-local"> i LOKAL tid ('YYYY-MM-DDTHH:mm'). */
function toLocalInput(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Firestore-Timestamp/ms/ISO → ms. */
function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function GameRow({ game }) {
  const [startAt, setStartAt] = useState('');
  const [puljeLockAt, setPuljeLockAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // 'saved' | 'error' | string

  // Synk felterne når spillet (gen)indlæses.
  useEffect(() => {
    setStartAt(toLocalInput(toMs(game.startAt)));
    setPuljeLockAt(toLocalInput(toMs(game.puljeLockAt)));
  }, [game.startAt, game.puljeLockAt]);

  const isFootball = game.type === 'football';

  async function save() {
    setBusy(true); setStatus(null);
    // Tomt felt → null (ryd). datetime-local læses som lokal tid.
    const res = await setGameSchedule(game.id, {
      startAt: startAt ? new Date(startAt).getTime() : null,
      ...(isFootball ? { puljeLockAt: puljeLockAt ? new Date(puljeLockAt).getTime() : null } : {}),
    });
    setStatus(res.ok ? 'saved' : (res.error || 'error'));
    setBusy(false);
  }

  return (
    <div className="card mb-2">
      <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1rem' }}>
          {game.emoji && <span aria-hidden="true" style={{ marginRight: '0.35rem' }}>{game.emoji}</span>}
          {game.name}
        </strong>
        <span className="badge badge--muted">{game.id}</span>
      </div>

      <div className="grid-2" style={{ gap: '0.75rem', marginTop: '0.75rem' }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--c-muted)', marginBottom: '0.25rem' }}>
            🚦 Spil-start
          </span>
          <input
            type="datetime-local" value={startAt}
            onChange={(e) => { setStartAt(e.target.value); setStatus(null); }}
            style={{ width: '100%' }}
          />
        </label>

        {isFootball && (
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--c-muted)', marginBottom: '0.25rem' }}>
              🎖️ Bonus-/pulje-deadline
            </span>
            <input
              type="datetime-local" value={puljeLockAt}
              onChange={(e) => { setPuljeLockAt(e.target.value); setStatus(null); }}
              style={{ width: '100%' }}
            />
          </label>
        )}
      </div>

      <div className="flex items-center" style={{ gap: '0.6rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn--sm" onClick={save} disabled={busy}>
          {busy ? 'Gemmer…' : 'Gem'}
        </button>
        {status === 'saved' && <span className="badge badge--green">Gemt ✓</span>}
        {status && status !== 'saved' && <span className="badge badge--red">{status === 'error' ? 'Kunne ikke gemme.' : status}</span>}
        <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Tomt felt = ingen {isFootball ? 'deadline/start' : 'fast start'}.
          {isFootball && puljeLockAt && ` Deadline: ${formatKickoff(new Date(puljeLockAt).getTime())}.`}
        </span>
      </div>
    </div>
  );
}

export default function GameScheduleTab() {
  const { games, loading } = useGames();

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;
  if (!games?.length) return <p style={{ color: 'var(--c-muted)' }}>Ingen spil fundet.</p>;

  return (
    <div>
      <p style={{ marginTop: 0, color: 'var(--c-muted)' }}>
        Styr hvornår hvert spil går i gang, og hvornår bonus-/pulje-tippet lukker. Bonus-deadline er
        uafhængig af kamp-programmet — så du kan holde bonus-tippet åbent efter runde 1, indtil flere
        spillere er kommet med.
      </p>
      {games.map((g) => <GameRow key={g.id} game={g} />)}
    </div>
  );
}
