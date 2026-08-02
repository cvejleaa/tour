/**
 * MatchElo — holdenes styrke-rating og seneste udvikling, vist på selve
 * kampkortet på tip-fladen.
 *
 * Elo BEREGNES kun på serveren. Her vises tal, der allerede ligger på spillet
 * (game.eloHistory) — ingen formel, så beregningen bliver ét sted.
 *
 * BEVIDST udeladt: forskellen mellem de to hold. Odds bygger ikke på den alene
 * — serveren lægger 60 point hjemmebanefordel oveni (superligaScoring.HFA), så
 * på enhver kamp med under 60 points forskel ville et "hvem er stærkest" her
 * modsige 1X2-knapperne lige nedenunder. Knapperne viser point pr. udfald og
 * er det autoritative svar på, hvem der er favorit.
 *
 * Ligeledes udeladt: en samlet trend over de viste runder. ▲/▼ betyder
 * "siden forrige runde" på Elo-fanen, og det skal betyde det samme her.
 */
import EloDelta from './EloDelta';

/** Én side af kampen: rating + de seneste udviklingspunkter. */
function Side({ navn, elo, align }) {
  if (!elo) return <span />;
  const { current, form } = elo;
  return (
    <span
      style={{
        display: 'inline-flex', flexDirection: 'column', gap: '0.15rem',
        alignItems: align === 'right' ? 'flex-end' : 'flex-start', minWidth: 0,
      }}
    >
      <span
        style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.85rem' }}
        title={`${navn}: rating ${current}`}
      >
        {current}
      </span>
      {form.length > 0 && (
        <span
          style={{ display: 'inline-flex', gap: '0.15rem', fontSize: '0.7rem', flexWrap: 'wrap' }}
          aria-label={`${navn}: udvikling over de seneste ${form.length} runder`}
        >
          {form.map((c) => (
            <EloDelta key={c.round} d={c.delta} title={`Runde ${c.round}`} />
          ))}
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
        <span style={{ fontSize: '0.68rem', color: 'var(--c-muted)', textAlign: 'center', whiteSpace: 'nowrap' }}>
          📈 Elo
          {spilletRunder > 0 && (
            <>
              <br />
              <span style={{ fontSize: '0.62rem' }}>seneste {spilletRunder}</span>
            </>
          )}
        </span>
        <Side navn={away} elo={a} align="right" />
      </div>
      <p style={{ margin: '0.3rem 0 0', fontSize: '0.68rem', color: 'var(--c-muted)', textAlign: 'center' }}>
        {spilletRunder === 0
          ? 'Start-rating — udviklingen kommer, når der er spillet runder.'
          : 'Styrke efter seneste spillede runde — ikke et bud på denne kamp.'}
      </p>
    </div>
  );
}
