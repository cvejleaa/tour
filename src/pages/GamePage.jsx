/**
 * GamePage – midlertidig spil-side for den samlede platform.
 *
 * Fase B flytter de rigtige spil-sider (kampe/etaper/tips/stilling) ind under
 * /spil/:gameId afhængigt af spillets type. Indtil da viser denne side blot
 * spillets metadata + en venlig "under opbygning"-besked, så et spil-kort ikke
 * er et dødt link.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { COL, GAME_STATUS } from '../lib/constants';

const STATUS_LABEL = {
  [GAME_STATUS.OPEN]: 'Åben',
  [GAME_STATUS.LIVE]: 'I gang',
  [GAME_STATUS.FINISHED]: 'Afsluttet',
};

export default function GamePage() {
  const { gameId } = useParams();
  const [game, setGame] = useState(undefined); // undefined = indlæser, null = findes ikke

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, COL.GAMES, gameId),
      (snap) => setGame(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setGame(null),
    );
    return unsub;
  }, [gameId]);

  if (game === undefined) {
    return <div className="spinner" role="status" aria-label="Indlæser" />;
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <Link to="/spil" style={{ color: 'var(--c-pitch)' }}>← Alle spil</Link>
      </p>

      {game === null ? (
        <div className="empty-state">
          <div className="empty-state__icon">🔍</div>
          <div className="empty-state__title">Spillet blev ikke fundet.</div>
        </div>
      ) : (
        <>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 800, display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
            {game.emoji && <span aria-hidden="true">{game.emoji}</span>}
            {game.name}
          </h1>
          <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
            {game.season ? `Sæson ${game.season} · ` : ''}{STATUS_LABEL[game.status] ?? game.status}
          </p>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 className="card__title">🚧 Spillets sider er på vej</h3>
            <p style={{ marginBottom: 0 }}>
              Du er tilmeldt <strong>{game.name}</strong>. Selve spil-siderne
              (kampe/etaper, tips og stilling) bygges her i næste trin. Indtil da
              kan du følge med i spiloversigten.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
