/**
 * EloDelta — ét udviklingspunkt i Elo: op, ned eller uændret.
 *
 * Delt mellem Elo-fanen og kampkortet, så ▲/▼ betyder det SAMME to steder:
 * ændringen siden forrige runde. Lå den i to kopier, ville de drive fra
 * hinanden — og et symbol, der betyder to ting, er værre end intet symbol.
 */
export default function EloDelta({ d, title }) {
  if (!d) return <span className="elo__flat" title={title || 'Uændret'}>±0</span>;
  return d > 0
    ? <span className="elo__up" title={title || `Steg ${d}`}>▲{d}</span>
    : <span className="elo__down" title={title || `Faldt ${-d}`}>▼{-d}</span>;
}
