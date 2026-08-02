/**
 * GameTabLink — internt link til en anden fane i SAMME spil.
 *
 * Fanen ligger i URL'en (?fane=…), og runden gør nu også (?runde=…). Derfor
 * kan et fane-skift være et rigtigt <Link> i stedet for en knap: tilbage-
 * knappen virker, linket kan deles, og man kan åbne i nyt faneblad.
 *
 * Uden dette ville henvisninger som "se under 👥 Ligaer" blive stående som
 * ren tekst, brugeren selv skal følge.
 */
import { Link, useParams } from 'react-router-dom';

/** Standardfanen har ingen parameter — så URL'en forbliver ren. */
export const DEFAULT_TAB = 'tip';

/**
 * Byg stien til en fane (og evt. runde) i et spil.
 * @param {string} gameId
 * @param {string} [fane]  – udelad eller 'tip' for standardfanen
 * @param {number} [runde] – kun meningsfuld på tip-fanen
 * @returns {string}
 */
export function gameTabPath(gameId, fane, runde) {
  const base = `/spil/${gameId}`;
  const params = new URLSearchParams();
  if (fane && fane !== DEFAULT_TAB) params.set('fane', fane);
  // Runder er 1-indekserede. Læseren i FootballTip ignorerer 0 og negative
  // tal, så byggeren må ikke producere dem — ellers siger de to halvdele
  // ikke det samme.
  if (Number(runde) > 0) params.set('runde', String(runde));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * @param {object} o
 * @param {string} [o.fane]
 * @param {number} [o.runde]
 * @param {string} [o.className]
 * @param {React.ReactNode} o.children
 */
export default function GameTabLink({ fane, runde, className, children, ...rest }) {
  const { gameId } = useParams();
  // Uden spil-id (fx i en isoleret visning) er der intet at linke til —
  // vis teksten frem for et dødt link.
  if (!gameId) return <span className={className}>{children}</span>;
  return (
    <Link to={gameTabPath(gameId, fane, runde)} className={className} {...rest}>
      {children}
    </Link>
  );
}
