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
import ScrollRaekke from '../components/ScrollRaekke';
import GameStandings from '../features/games/GameStandings';
import GameLeagues from '../features/games/GameLeagues';
import GameProfile from '../features/games/GameProfile';
import FootballTip from '../features/games/football/FootballTip';
import MyTips from '../features/games/football/MyTips';
import PuljeTip from '../features/games/football/PuljeTip';
import EloTable from '../features/games/football/EloTable';
import HoldSide from '../features/games/football/HoldSide';
import FootballTable from '../features/games/football/FootballTable';
import FootballHelp from '../features/games/football/FootballHelp';
import { GAME_TYPE } from '../lib/constants';
import { withTab } from '../features/games/GameTabLink';

// Faner i spillet. football: true = kun for fodbold-spil. Rækkefølgen er
// visnings-rækkefølgen; navnene er valgt så de ikke kolliderer med top-nav
// ("Mit hold" vs. global Profil, "Guide" vs. platform-Hjælp).
// Eksporteret, så testene kan gate-teste de RIGTIGE fane-definitioner — en
// lokal kopi i testen ville forblive grøn, når en `kraever` fjernes her.
export const GAME_TABS = [
  { key: 'tip', label: 'Tip' },
  { key: 'mine', label: '📋 Mine tips', football: true },
  { key: 'stilling', label: '🏆 Stilling' },
  // KRÆVER `game.pulje`. Puljen er et tip om, hvem der ender i
  // mesterskabsspillet — og det findes kun i Superligaen. Uden gaten fik en
  // Premier League-spiller en fane med tolv DANSKE hold og en Gem-knap, der
  // altid fejler: firestore.rules kræver en puljeLockAt, som aldrig er sat på
  // et spil uden pulje. En fane, der inviterer til noget umuligt.
  { key: 'pulje', label: '🎖️ Pulje', football: true, kraever: 'pulje' },
  // KRÆVER `game.standings`. Kun Superligaen har en synk, der skriver
  // stillingen; i et spil uden (Premier League, indtil dens synk findes)
  // ville fanen love en tabel og vise en tom side. Gaten er DATA, ikke en
  // provider-liste: den dag en synk skriver standings, dukker fanen op af
  // sig selv — der er ingen klient-tilstand at huske at flippe.
  { key: 'tabel', label: '⚽ Tabel', football: true, kraever: 'standings' },
  { key: 'elo', label: '📈 Elo', football: true },
  { key: 'ligaer', label: '👥 Ligaer' },
  { key: 'profil', label: '🙂 Mit hold' },
  { key: 'hjaelp', label: '❓ Guide', football: true },
];

/** Skal fanen vises for dette spil? */
export function faneVises(t, game) {
  if (t.football && game?.type !== GAME_TYPE.FOOTBALL) return false;
  // `kraever` peger på et felt, spillet skal HAVE. Tilstedeværelsen er
  // signalet — ikke en boolean, man kan glemme at sætte til false.
  if (t.kraever && !game?.[t.kraever]) return false;
  return true;
}

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
  // Holdsiden bor bag ?hold= på Elo-fanen. Kortkoden, ikke navnet: navnet kan
  // indeholde mellemrum ("Brighton and Hove Albion") og er ingen URL-nøgle.
  const holdKode = searchParams.get('hold');
  // Flet ind i de eksisterende parametre — objekt-formen ville erstatte HELE
  // query-strengen og dermed tørre ?runde= af, hver gang man skiftede fane.
  // withTab fletter ind i de eksisterende parametre. Objekt-formen ville
  // erstatte HELE query-strengen og dermed tørre ?runde= af ved hvert klik.
  const setTab = (key) => {
    // `withTab` bevarer med vilje de øvrige parametre (?runde= må ikke tørres
    // af ved et fane-klik). `hold` er den ene undtagelse: den hører til ÉN
    // visning på ÉN fane, og bliver den hængende, viser Elo-fanen et hold,
    // brugeren troede han havde forladt.
    const next = withTab(searchParams, key);
    next.delete('hold');
    setSearchParams(next);
  };

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
          {/* Faner — wrap på desktop, scroll på mobil MED synligt hint
              (ScrollRaekke). aktivNoegle: et dybt link (?fane=elo) skal lande
              med den aktive fane i syne, ikke ude bag kanten. */}
          <ScrollRaekke className="tabs" role="tablist" aktivNoegle={tab}>
            {GAME_TABS
              .filter((t) => faneVises(t, game))
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
          </ScrollRaekke>

          {tab === 'stilling' ? (
            <GameStandings gameId={gameId} game={game} matches={matches} />
          ) : tab === 'ligaer' ? (
            <GameLeagues gameId={gameId} game={game} />
          ) : tab === 'profil' ? (
            <GameProfile game={game} me={me} />
          ) : tab === 'hjaelp' && game.type === GAME_TYPE.FOOTBALL ? (
            <FootballHelp game={game} />
          ) : tab === 'mine' && game.type === GAME_TYPE.FOOTBALL ? (
            <MyTips game={game} matches={matches} me={me} />
          ) : tab === 'pulje' && game.pulje && game.type === GAME_TYPE.FOOTBALL ? (
            <PuljeTip game={game} matches={matches} />
          ) : tab === 'elo' && game.type === GAME_TYPE.FOOTBALL ? (
            /* `?hold=XXX` viser ét holds tal i stedet for hele tabellen.
               Ikke en egen rute: /spil/:gameId er et blad, så en rute skulle
               selv genskabe GameLayout, fanerækken og isMember-gaten. */
            holdKode ? (
              <HoldSide
                game={game}
                matches={matches}
                short={holdKode}
                onLuk={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('hold');
                  setSearchParams(next, { replace: true });
                }}
              />
            ) : (
              <EloTable game={game} />
            )
          ) : tab === 'tabel' && game.type === GAME_TYPE.FOOTBALL ? (
            <FootballTable game={game} />
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
