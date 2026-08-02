/**
 * GamePage – spil-side for den samlede platform (/spil/:gameId).
 *
 * Henter spillet via useGame og dispatcher på spiltype: fodbold-spil (VM,
 * Superliga) viser tip-fladen (1X2 + Chancen). Andre typer får indtil videre
 * en "under opbygning"-besked. Er man ikke tilmeldt, vises en deltag-knap.
 */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useGame } from '../features/games/useGame';
import { useAuth } from '../context/AuthContext';
import { joinGame } from '../features/games/gameActions';
import GameLayout from '../features/games/GameLayout';
import GameStandings from '../features/games/GameStandings';
import GameLeagues from '../features/games/GameLeagues';
import GameProfile from '../features/games/GameProfile';
import FootballTip from '../features/games/football/FootballTip';
import MyTips from '../features/games/football/MyTips';
import PuljeTip from '../features/games/football/PuljeTip';
import EloTable from '../features/games/football/EloTable';
import SuperligaTable from '../features/games/football/SuperligaTable';
import FootballHelp from '../features/games/football/FootballHelp';
import { GAME_TYPE } from '../lib/constants';
import { withTab } from '../features/games/GameTabLink';

// Faner i spillet. football: true = kun for fodbold-spil. Rækkefølgen er
// visnings-rækkefølgen; navnene er valgt så de ikke kolliderer med top-nav
// ("Mit hold" vs. global Profil, "Guide" vs. platform-Hjælp).
const GAME_TABS = [
  { key: 'tip', label: 'Tip' },
  { key: 'mine', label: '📋 Mine tips', football: true },
  { key: 'stilling', label: '🏆 Stilling' },
  { key: 'pulje', label: '🎖️ Pulje', football: true },
  { key: 'tabel', label: '⚽ Tabel', football: true },
  { key: 'elo', label: '📈 Elo', football: true },
  { key: 'ligaer', label: '👥 Ligaer' },
  { key: 'profil', label: '🙂 Mit hold' },
  { key: 'hjaelp', label: '❓ Guide', football: true },
];

export default function GamePage() {
  const { gameId } = useParams();
  const { user } = useAuth();
  const { game, me, isMember, matches, loading } = useGame(gameId);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  // Fanen lever i URL'en (?fane=…), så browserens tilbage-knap, refresh og
  // deling virker. Standard = tip (ingen parameter).
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('fane') || 'tip';
  // Flet ind i de eksisterende parametre — objekt-formen ville erstatte HELE
  // query-strengen og dermed tørre ?runde= af, hver gang man skiftede fane.
  // withTab fletter ind i de eksisterende parametre. Objekt-formen ville
  // erstatte HELE query-strengen og dermed tørre ?runde= af ved hvert klik.
  const setTab = (key) => setSearchParams(withTab(searchParams, key));

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
          {/* Faner — vandret-scrollende underline-system (samme som andre steder).
              Sekundære faner scroller væk på mobil i stedet for at wrappe. */}
          <div className="tabs" role="tablist">
            {GAME_TABS
              .filter((t) => !t.football || game.type === GAME_TYPE.FOOTBALL)
              .map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  className={tab === t.key ? 'tab tab--active' : 'tab'}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
          </div>

          {tab === 'stilling' ? (
            <GameStandings gameId={gameId} />
          ) : tab === 'ligaer' ? (
            <GameLeagues gameId={gameId} />
          ) : tab === 'profil' ? (
            <GameProfile game={game} me={me} />
          ) : tab === 'hjaelp' && game.type === GAME_TYPE.FOOTBALL ? (
            <FootballHelp />
          ) : tab === 'mine' && game.type === GAME_TYPE.FOOTBALL ? (
            <MyTips game={game} matches={matches} />
          ) : tab === 'pulje' && game.type === GAME_TYPE.FOOTBALL ? (
            <PuljeTip game={game} matches={matches} />
          ) : tab === 'elo' && game.type === GAME_TYPE.FOOTBALL ? (
            <EloTable game={game} />
          ) : tab === 'tabel' && game.type === GAME_TYPE.FOOTBALL ? (
            <SuperligaTable game={game} />
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
