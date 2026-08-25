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
import GameTabLink from '../GameTabLink';
import { fmtDec } from '../../../lib/daNum';
import { ensomRet } from './holdStatistik';

/**
 * Under så få tips er "kun én ramte" ikke en historie, men en mønt.
 * Ved to tips er den ensomme ret et 50/50-udfald; ved tre begynder den at
 * betyde noget. Tallet står her, fordi det er en DOM, ikke en detalje.
 */
export const ENSOM_MINIMUM = 3;

/**
 * Den ensomme ret som én sætning — eller null, hvis der ikke er nogen.
 *
 * Det eneste i dette panel, der ikke kan slås op andre steder, er hvad
 * VENNERNE gjorde. Sætningen løfter den ud af tabellen, så man ser den uden
 * at tælle navne.
 *
 * REGLEN, DEN SKAL HOLDE (h2h.js, Pokaler.test.jsx): et navn må kun stå her,
 * fordi personen havde RET. Ingen procenter om navngivne andre, og grundlaget
 * skrives som brøk. Ens eget tip tæller MED — "kun du så det komme" er hele
 * pointen for den, der havde den.
 *
 * @param {Array<object>} bets   ALLE ligaens tips, også ens eget
 * @param {string} result        kampens facit
 * @param {string} myUid
 * @returns {string|null}
 */
export function ensomRetLinje(bets, result, myUid) {
  const { antal, ialt, ensom, ingen, ramte } = ensomRet(bets, result);
  if (ialt < ENSOM_MINIMUM) return null;
  if (ensom) {
    const hvem = ramte[0]?.uid === myUid ? 'du' : (ramte[0]?.name || 'én');
    return `Kun ${hvem} så det komme — ${antal} af ${ialt} ramte.`;
  }
  if (ingen) return `Ingen i ligaen så den her — 0 af ${ialt} ramte.`;
  return null;
}

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
        <GameTabLink fane="ligaer">Bliv med i en liga</GameTabLink> for at se, hvad de andre tippede.
      </p>
    );
  }

  const others = bets.filter((b) => b.uid !== myUid);
  // Bemærk: linjen regnes af ALLE tips, ikke af `others` — se ensomRetLinje.
  const ensomLinje = ensomRetLinje(bets, match?.result, myUid);
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
          {/* Bevidst forsigtig formulering: en tom liste kan også betyde, at
              tippene er ældre end liga-feltet og endnu ikke bagfyldt. At sige
              "ingen tippede" ville pege det forkerte sted hen. */}
          {!loading && !error && others.length === 0 && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--c-muted)' }}>
              Ingen tips at vise fra dine ligaer på denne kamp.
            </p>
          )}
          {/* Øverst, over tabellen: den ene sætning, man kan læse højt.
              (Den kræver stadig en udfoldning — panelet henter først dér, og
              en hentning pr. låst kamp på siden ville koste en forespørgsel
              hver. At gøre den synlig uden udfoldning er en egen opgave.) */}
          {!loading && !error && ensomLinje && (
            <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>{ensomLinje}</p>
          )}
          {!loading && !error && byOutcome.map((g) => (
            <PickGroup key={g.outcome} outcome={g.outcome} rows={g.rows} result={match?.result} />
          ))}
        </div>
      )}
    </div>
  );
}
