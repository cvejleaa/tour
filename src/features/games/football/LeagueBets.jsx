/**
 * LeagueBets — hvad tippede mine liga-kammerater på DENNE kamp?
 *
 * Vises kun under kampe, der er gået i gang. Før kickoff ville det være at
 * kigge i kortene, og security-reglen afviser det alligevel.
 *
 * Foldet sammen som standard: de fleste kampe kigger man ikke efter, og hver
 * udfoldning koster en forespørgsel plus et navneopslag.
 */
import { useState } from 'react';
import { useMatchLeagueBets } from './useMatchLeagueBets';
import { fmtDec } from '../../../lib/daNum';

const OUTCOME_LABEL = { 1: '1', X: 'X', 2: '2' };

/** Ét udfald med antal og hvem — grupperingen gør fordelingen læsbar. */
function PickGroup({ outcome, rows, result }) {
  const hit = result ? outcome === result : null;
  const cls = hit === true ? 'badge badge--green' : hit === false ? 'badge badge--muted' : 'badge';
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
      <span className={cls} style={{ minWidth: '2.2rem', textAlign: 'center' }}>
        {OUTCOME_LABEL[outcome]}
      </span>
      <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>{rows.length} ·</span>
      <span style={{ fontSize: '0.9rem' }}>
        {rows.map((r, i) => (
          <span key={r.id}>
            {i > 0 && ', '}
            {r.name}
            {Number(r.chanceStake) > 0 && (
              <span title={`Chancen: ${fmtDec(r.chanceStake)} point på spil`}> ⚡</span>
            )}
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * @param {object} o
 * @param {string} o.gameId
 * @param {object} o.match      – kampen (skal være gået i gang)
 * @param {string} o.myUid
 * @param {string[]} o.leagueIds – mine ligaer i spillet
 */
export default function LeagueBets({ gameId, match, myUid, leagueIds }) {
  const [open, setOpen] = useState(false);
  const { bets, loading, error } = useMatchLeagueBets(gameId, match?.id, leagueIds, open);

  // Er man ikke i nogen liga, er der ingen at sammenligne med — og reglen ville
  // afvise forespørgslen. Sig hvorfor i stedet for at vise en tom liste.
  if (!leagueIds?.length) {
    return (
      <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
        Bliv med i en liga for at se, hvad de andre tippede.
      </p>
    );
  }

  const others = bets.filter((b) => b.uid !== myUid);
  const byOutcome = ['1', 'X', '2']
    .map((o) => ({ outcome: o, rows: others.filter((b) => b.pick === o) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div style={{ marginTop: '0.6rem', borderTop: '1px solid var(--c-line, #e5e7eb)', paddingTop: '0.5rem' }}>
      <button
        className="btn btn--ghost btn--sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? '▾ Skjul ligaens tips' : '▸ Se ligaens tips'}
      </button>

      {open && (
        <div style={{ marginTop: '0.5rem' }}>
          {loading && <div className="spinner" role="status" aria-label="Indlæser" />}
          {error && <p className="badge badge--red" role="alert">{error}</p>}
          {!loading && !error && others.length === 0 && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--c-muted)' }}>
              Ingen andre i dine ligaer nåede at tippe denne kamp.
            </p>
          )}
          {!loading && !error && byOutcome.map((g) => (
            <PickGroup key={g.outcome} outcome={g.outcome} rows={g.rows} result={match?.result} />
          ))}
        </div>
      )}
    </div>
  );
}
