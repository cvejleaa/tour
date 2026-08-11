/**
 * GameLayout — fælles ramme for en spil-side under /spil/:gameId.
 * Viser tilbage-link, spillets navn/emoji, status og spillerens saldo (point),
 * og renderer det spiltype-specifikke indhold nedenunder.
 */
import { Link } from 'react-router-dom';
import { GAME_STATUS_LABEL as STATUS_LABEL } from '../../lib/constants';
import { fmtPoints } from '../../lib/daNum';
import { useSpilTema } from './useSpilTema';

/** Spillerens saldo (bank) ud fra players-dokumentet. */
export function playerBank(me) {
  return Number(me?.totalPoints ?? me?.points ?? 0) || 0;
}

/** Vis point pænt (dansk komma). Genudstilles fra daNum, så eksisterende
 *  importsteder (GameStandings/GameLeagues) er uændrede. */
export const formatPoints = fmtPoints;

export default function GameLayout({ game, me, children }) {
  const bank = playerBank(me);
  // Yndlingsholdets klubfarve som accent for ALT inde i spillet. Variablerne
  // nedarves, så hver eneste var(--c-pitch) herunder følger med — uden at et
  // eneste af de ~60 brugssteder skal kende til holdtemaer.
  const tema = useSpilTema(game, me);
  return (
    <div style={tema?.stil} data-klubtema={tema?.navn ?? undefined}>
      <p style={{ marginTop: 0 }}>
        <Link to="/spil" style={{ color: 'var(--c-pitch)' }}>← Alle spil</Link>
      </p>

      <div className="flex items-center justify-between mb-2" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
          {game?.logo ? (
            <img src={game.logo} alt="" width={36} height={36} style={{ borderRadius: 9, flexShrink: 0 }} />
          ) : (
            game?.emoji && <span aria-hidden="true">{game.emoji}</span>
          )}
          {game?.name}
        </h1>
        {me && (
          // SALDOEN KAN IKKE BLIVE LIGA-LOKAL. Der er ét bet pr. kamp, delt af
          // alle ens ligaer, så der findes kun én pengekasse — og Chancens
          // maks-indsats (15 % af saldoen) klippes på serveren mod netop den.
          // En liga med egen startrunde viser andre totaler; titlen her skal
          // sige, hvad tallet ER, så de to ikke ligner en modsigelse.
          <span className="badge" title="Spillets samlede saldo — den, Chancen må satse af. Ligaer med egen startrunde viser deres egne tal.">
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
