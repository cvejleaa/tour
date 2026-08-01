/**
 * MatchElo — holdenes styrke-rating og seneste udvikling, vist på selve
 * kampkortet på tip-fladen.
 *
 * Elo BEREGNES kun på serveren. Her vises tal, der allerede ligger på spillet
 * (game.eloHistory) — ingen formel, så beregningen bliver ét sted.
 *
 * Formålet er beslutningsstøtte lige dér, hvor man vælger 1X2: hvem er
 * stærkest, og hvilken vej går det for dem lige nu.
 */
import { fmtDec } from '../../../lib/daNum';

/** Ét udviklingspunkt: op, ned eller uændret. */
function Delta({ d }) {
  if (!d) return <span className="elo__flat" title="Uændret">±0</span>;
  return d > 0
    ? <span className="elo__up" title={`Steg ${d}`}>▲{d}</span>
    : <span className="elo__down" title={`Faldt ${-d}`}>▼{-d}</span>;
}

/** Én side af kampen: rating + de seneste udviklingspunkter. */
function Side({ navn, elo, align }) {
  if (!elo) return <span />;
  const { current, form, trend } = elo;
  return (
    <span
      style={{
        display: 'inline-flex', flexDirection: 'column', gap: '0.15rem',
        alignItems: align === 'right' ? 'flex-end' : 'flex-start', minWidth: 0,
      }}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.85rem' }}>
        {current}
        {form.length > 0 && (
          <span style={{ fontWeight: 400, marginLeft: '0.35rem' }}>
            <Delta d={trend} />
          </span>
        )}
      </span>
      {form.length > 0 && (
        <span
          style={{ display: 'inline-flex', gap: '0.3rem', fontSize: '0.72rem' }}
          aria-label={`${navn}: udvikling over de seneste ${form.length} runder`}
        >
          {form.map((c) => <Delta key={c.round} d={c.delta} />)}
        </span>
      )}
    </span>
  );
}

/**
 * @param {object} o
 * @param {string} o.home
 * @param {string} o.away
 * @param {Record<string, object>} o.eloByTeam – fra eloFormByTeam()
 */
export default function MatchElo({ home, away, eloByTeam }) {
  const h = eloByTeam?.[home];
  const a = eloByTeam?.[away];
  if (!h && !a) return null;

  // Forskellen er dét, odds bygger på — den er mere sigende end de to tal hver
  // for sig, når man skal vælge.
  const diff = h && a ? h.current - a.current : null;
  const spilletRunder = Math.max(h?.form?.length || 0, a?.form?.length || 0);

  return (
    <div
      style={{
        marginTop: '0.5rem', paddingTop: '0.45rem',
        borderTop: '1px dashed var(--c-border, #e5e7eb)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <Side navn={home} elo={h} align="left" />
        <span
          style={{ fontSize: '0.68rem', color: 'var(--c-muted)', textAlign: 'center', whiteSpace: 'nowrap' }}
          title="Styrke-rating (elo-lite). Odds bygger på forskellen."
        >
          📈 Elo
          {diff != null && diff !== 0 && (
            <>
              <br />
              {diff > 0 ? '←' : '→'} {fmtDec(Math.abs(diff))}
            </>
          )}
        </span>
        <Side navn={away} elo={a} align="right" />
      </div>
      {spilletRunder === 0 && (
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: 'var(--c-muted)', textAlign: 'center' }}>
          Start-rating — udviklingen kommer, når der er spillet runder.
        </p>
      )}
    </div>
  );
}
