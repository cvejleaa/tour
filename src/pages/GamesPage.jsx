/**
 * GamesPage – spil-vælger for den samlede platform.
 *
 * To sektioner:
 *  - "Mine spil": spil brugeren deltager i (kort linker til selve spillet).
 *  - "Åbne spil — deltag": spil brugeren kan tilmelde sig (Deltag-knap).
 *
 * Data hentes live via useGames(); uid kommer fra useAuth().
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGames, splitGames } from '../features/games/useGames';
import { joinGame, leaveGame } from '../features/games/gameActions';
import { GAME_STATUS } from '../lib/constants';

// Dansk etiket for et spils status.
const STATUS_LABEL = {
  [GAME_STATUS.OPEN]: 'Åben',
  [GAME_STATUS.LIVE]: 'I gang',
  [GAME_STATUS.FINISHED]: 'Afsluttet',
};

function statusBadgeClass(status) {
  if (status === GAME_STATUS.LIVE) return 'badge badge--green';
  if (status === GAME_STATUS.FINISHED) return 'badge badge--muted';
  return 'badge badge--blue';
}

// ── Kort til et EKSTERNT spil (kører i sin egen app, fx tour.vejleaa.dk) ───────
// Linker ud i stedet for ind i platformen — bruges indtil spillet er migreret.
function ExternalGameCard({ game }) {
  return (
    <div className="card card--link">
      <a
        href={game.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        aria-label={`Åbn ${game.name} i sin egen app (nyt faneblad)`}
      >
        <div className="flex items-center justify-between">
          <h3 className="card__title" style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            {game.logo
              ? <img src={game.logo} alt="" width={22} height={22} style={{ borderRadius: 6, flexShrink: 0 }} />
              : game.emoji && <span aria-hidden="true">{game.emoji}</span>}
            {game.name}
          </h3>
          <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            {game.season && <span className="badge badge--muted">{game.season}</span>}
            <span className={statusBadgeClass(game.status)}>{STATUS_LABEL[game.status] ?? game.status}</span>
          </span>
        </div>
        <div style={{ marginTop: '0.4rem', color: 'var(--c-pitch)', fontSize: '0.9rem', fontWeight: 600 }}>
          Åbn spillet ↗
        </div>
      </a>
    </div>
  );
}

// ── Spil-kort til "Mine spil" ─────────────────────────────────────────────────
function MyGameCard({ game, onLeave, leaving }) {
  if (game.externalUrl) return <ExternalGameCard game={game} />;
  // Forlad tillades kun før spillet går i gang (åbent = ingen point endnu).
  const canLeave = game.status === GAME_STATUS.OPEN;
  return (
    <div className="card card--link">
      <Link
        to={`/spil/${game.id}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        aria-label={`Åbn spil: ${game.name}`}
      >
        <div className="flex items-center justify-between">
          <h3 className="card__title" style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            {game.logo
              ? <img src={game.logo} alt="" width={22} height={22} style={{ borderRadius: 6, flexShrink: 0 }} />
              : game.emoji && <span aria-hidden="true">{game.emoji}</span>}
            {game.name}
          </h3>
          <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            {game.season && <span className="badge badge--muted">{game.season}</span>}
            <span className={statusBadgeClass(game.status)}>{STATUS_LABEL[game.status] ?? game.status}</span>
          </span>
        </div>
      </Link>
      {canLeave && (
        <div style={{ marginTop: '0.5rem' }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => onLeave(game)}
            disabled={leaving}
            aria-label={`Forlad ${game.name}`}
          >
            {leaving ? 'Forlader…' : 'Forlad'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Spil-kort til "Åbne spil" ─────────────────────────────────────────────────
function OpenGameCard({ game, onJoin, joining }) {
  if (game.externalUrl) return <ExternalGameCard game={game} />;
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="card__title" style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          {game.emoji && <span aria-hidden="true">{game.emoji}</span>}
          {game.name}
        </h3>
        <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          {game.season && <span className="badge badge--muted">{game.season}</span>}
          <span className={statusBadgeClass(game.status)}>{STATUS_LABEL[game.status] ?? game.status}</span>
        </span>
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <button
          className="btn btn--sm"
          onClick={() => onJoin(game)}
          disabled={joining}
          aria-label={`Deltag i ${game.name}`}
        >
          {joining ? 'Tilmelder…' : 'Deltag'}
        </button>
      </div>
    </div>
  );
}

// ── Hoved-komponent ───────────────────────────────────────────────────────────
export default function GamesPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const navigate = useNavigate();
  const { games, myGameIds, loading } = useGames();
  const { mine, open, external } = splitGames(games, myGameIds);

  const [busyId, setBusyId] = useState(null); // id på spil der behandles
  const [error, setError] = useState('');

  async function handleJoin(game) {
    setBusyId(game.id);
    setError('');
    const res = await joinGame(uid, game.id);
    setBusyId(null);
    // Efter tilmelding: hop direkte ind i spillet (til Tip), så man ikke skal
    // finde kortet igen. Fejl vises på oversigten.
    if (res.ok) navigate(`/spil/${game.id}`);
    else setError(res.error);
  }

  async function handleLeave(game) {
    if (!window.confirm(`Forlad "${game.name}"?`)) return;
    setBusyId(game.id);
    setError('');
    const res = await leaveGame(uid, game.id);
    if (!res.ok) setError(res.error);
    setBusyId(null);
  }

  return (
    <div>
      <div className="hero">
        <h1 className="hero__title">🏆 Vejleaa Tip</h1>
        <p className="hero__subtitle">
          Vælg et spil og tip mod vennerne. Én konto — flere spil, hver med sin egen stilling og ligaer.
        </p>
      </div>

      {error && (
        <p className="badge badge--red mb-2" role="alert" style={{ display: 'block' }}>{error}</p>
      )}

      {loading ? (
        <div className="spinner" role="status" aria-label="Indlæser" />
      ) : (
        <>
          {/* Mine spil */}
          <section className="mb-2">
            <h2 className="card__title mb-2">Mine spil</h2>
            {mine.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">🎮</div>
                <div className="empty-state__title">Du deltager ikke i nogen spil endnu.</div>
              </div>
            ) : (
              <div className="grid-2">
                {mine.map((g) => (
                  <MyGameCard
                    key={g.id}
                    game={g}
                    onLeave={handleLeave}
                    leaving={busyId === g.id}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Spil i deres egen app (link ud) */}
          {external.length > 0 && (
            <section className="mb-2">
              <h2 className="card__title mb-2">Andre spil</h2>
              <div className="grid-2">
                {external.map((g) => (
                  <ExternalGameCard key={g.id} game={g} />
                ))}
              </div>
            </section>
          )}

          {/* Åbne spil — deltag */}
          <section>
            <h2 className="card__title mb-2">Åbne spil — deltag</h2>
            {open.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">✅</div>
                <div className="empty-state__title">Ingen åbne spil at deltage i lige nu.</div>
              </div>
            ) : (
              <div className="grid-2">
                {open.map((g) => (
                  <OpenGameCard
                    key={g.id}
                    game={g}
                    onJoin={handleJoin}
                    joining={busyId === g.id}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
