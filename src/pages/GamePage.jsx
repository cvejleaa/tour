/**
 * GamePage – spil-side for den samlede platform (/spil/:gameId).
 *
 * Henter spillet via useGame og dispatcher på spiltype: fodbold-spil (VM,
 * Superliga) viser tip-fladen (1X2 + Chancen). Andre typer får indtil videre
 * en "under opbygning"-besked. Er man ikke tilmeldt, vises en deltag-knap.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { useGame } from '../features/games/useGame';
import { useAuth } from '../context/AuthContext';
import { joinGame } from '../features/games/gameActions';
import GameLayout from '../features/games/GameLayout';
import GameStandings from '../features/games/GameStandings';
import FootballTip from '../features/games/football/FootballTip';
import { GAME_TYPE } from '../lib/constants';

export default function GamePage() {
  const { gameId } = useParams();
  const { user } = useAuth();
  const { game, me, isMember, matches, loading } = useGame(gameId);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('tip');

  if (loading || game === undefined) {
    return <div className="spinner" role="status" aria-label="Indlæser" />;
  }

  if (game === null) {
    return (
      <div>
        <p style={{ marginTop: 0 }}>
          <Link to="/spil" style={{ color: 'var(--c-pitch)' }}>← Alle spil</Link>
        </p>
        <div className="empty-state">
          <div className="empty-state__icon">🔍</div>
          <div className="empty-state__title">Spillet blev ikke fundet.</div>
        </div>
      </div>
    );
  }

  async function onJoin() {
    setError('');
    setJoining(true);
    const res = await joinGame(user?.uid, gameId);
    if (!res.ok) setError(res.error);
    setJoining(false);
  }

  return (
    <GameLayout game={game} me={me}>
      {!isMember ? (
        <div className="card">
          <h3 className="card__title">Deltag i {game.name}</h3>
          <p style={{ color: 'var(--c-muted)' }}>
            Tilmeld dig for at tippe. Du kan altid forlade spillet igen, så længe du ikke har point.
          </p>
          {error && <p className="badge badge--red mb-2">{error}</p>}
          <button className="btn btn--sm" disabled={joining} onClick={onJoin}>
            {joining ? 'Tilmelder…' : 'Deltag'}
          </button>
        </div>
      ) : (
        <>
          {/* Faner: tip / stilling */}
          <div className="flex items-center mb-2" role="tablist" style={{ gap: '0.4rem' }}>
            <button
              role="tab"
              aria-selected={tab === 'tip'}
              className={tab === 'tip' ? 'btn btn--sm' : 'btn btn--ghost btn--sm'}
              onClick={() => setTab('tip')}
            >Tip</button>
            <button
              role="tab"
              aria-selected={tab === 'stilling'}
              className={tab === 'stilling' ? 'btn btn--sm' : 'btn btn--ghost btn--sm'}
              onClick={() => setTab('stilling')}
            >🏆 Stilling</button>
          </div>

          {tab === 'stilling' ? (
            <GameStandings gameId={gameId} />
          ) : game.type === GAME_TYPE.FOOTBALL ? (
            <FootballTip game={game} me={me} matches={matches} />
          ) : (
            <div className="card">
              <h3 className="card__title">🚧 Spillets sider er på vej</h3>
              <p style={{ marginBottom: 0 }}>
                Du er tilmeldt <strong>{game.name}</strong>. Denne spiltype
                ({game.type || 'ukendt'}) får sin egen tip-flade i et senere trin.
                Stillingen virker allerede — se fanen ovenfor.
              </p>
            </div>
          )}
        </>
      )}
    </GameLayout>
  );
}
