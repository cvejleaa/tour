/**
 * GameLayout — fælles ramme for en spil-side under /spil/:gameId.
 * Viser tilbage-link, spillets navn/emoji, status og spillerens saldo (point),
 * og renderer det spiltype-specifikke indhold nedenunder.
 */
import { Link } from 'react-router-dom';
import { GAME_STATUS } from '../../lib/constants';

const STATUS_LABEL = {
  [GAME_STATUS.OPEN]: 'Åben',
  [GAME_STATUS.LIVE]: 'I gang',
  [GAME_STATUS.FINISHED]: 'Afsluttet',
};

/** Spillerens saldo (bank) ud fra players-dokumentet. */
export function playerBank(me) {
  return Number(me?.totalPoints ?? me?.points ?? 0) || 0;
}

/** Vis point pænt: heltal uden decimaler, ellers 1 decimal (point følger odds). */
export function formatPoints(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export default function GameLayout({ game, me, children }) {
  const bank = playerBank(me);
  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <Link to="/spil" style={{ color: 'var(--c-pitch)' }}>← Alle spil</Link>
      </p>

      <div className="flex items-center justify-between mb-2" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
          {game?.emoji && <span aria-hidden="true">{game.emoji}</span>}
          {game?.name}
        </h1>
        {me && (
          <span className="badge" title="Din saldo i dette spil">
            💰 {formatPoints(bank)} point
          </span>
        )}
      </div>
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        {game?.season ? `Sæson ${game.season} · ` : ''}
        {STATUS_LABEL[game?.status] ?? game?.status}
      </p>

      {children}
    </div>
  );
}
