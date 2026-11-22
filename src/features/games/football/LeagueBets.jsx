/**
 * LeagueBets — hvem i mine ligaer tippede hvad på DENNE kamp?
 *
 * Vises kun under kampe, der er gået i gang. Før kickoff ville det være at
 * kigge i kortene, og security-reglen afviser det alligevel.
 *
 * Altid fremme efter kickoff (ejerens beslutning): ingen fold-knap. Under hver
 * 1/X/2-knap står en kolonne med antal og navne — ens eget tip som «Dig»
 * øverst i sin kolonne. Efter kampen står navnene i den RIGTIGE kolonne i fed
 * grøn med ✓ ved antallet; de forkerte kolonner dæmpes, men forbliver
 * læselige («Joe tippede 2 igen» er halvdelen af sjovet).
 *
 * Prisen: hvert låst kort henter én gang ved mount (se useMatchLeagueBets —
 * navnene går gennem en fælles cache).
 */
import { useEffect, useRef, useState } from 'react';
import { useMatchLeagueBets } from './useMatchLeagueBets';
import GameTabLink from '../GameTabLink';
import { fmtDec } from '../../../lib/daNum';
import { OUTCOMES } from '../../../lib/superligaScoring';
import { ensomRet } from './holdStatistik';

/**
 * Under så få tips er "kun én ramte" ikke en historie, men en mønt.
 * Ved to tips er den ensomme ret et 50/50-udfald; ved tre begynder den at
 * betyde noget. Tallet står her, fordi det er en DOM, ikke en detalje.
 */
export const ENSOM_MINIMUM = 3;

/**
 * Så mange navne vises i en kolonne, før resten foldes bag «+N flere».
 * Én skjult er værre end ingen — «+1 flere» fylder alligevel en linje — så
 * ved MAKS_VIST + 1 navne vises alle.
 */
export const MAKS_VIST = 5;

/**
 * Den ensomme ret som én sætning — eller null, hvis der ikke er nogen.
 *
 * Det eneste i dette panel, der ikke kan slås op andre steder, er hvad
 * VENNERNE gjorde. Sætningen løfter den ud af gitteret, så man ser den uden
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

/**
 * Én samlet liste: de andres tips plus mit eget som «Dig» — uden dubletter.
 *
 * Mit tip tages fra kortets EGET bet (betsByMatch), ikke fra forespørgslen:
 * det er kun med i forespørgslen, hvis `leagueIds` er spejlet ud på tippet,
 * og det sker asynkront. Ellers kunne «Dig» mangle lige under min valgte knap.
 * Mangler kortets bet, bruges forespørgslens række som reserve.
 *
 * Kolonnerne OG ensomRetLinje regnes af denne ene liste, så «1 af 11» altid er
 * summen af kolonnernes tal.
 *
 * @returns {{ andre: Array<object>, alle: Array<object> }}
 */
export function samletListe(bets, myBet, myUid) {
  const liste = Array.isArray(bets) ? bets : [];
  const andre = liste.filter((b) => b.uid !== myUid);
  const eget = myBet?.pick ? myBet : liste.find((b) => b.uid === myUid);
  const mig = eget
    ? [{ ...eget, id: eget.id || 'mig', uid: myUid, name: 'Dig', erMig: true }]
    : [];
  return { andre, alle: [...mig, ...andre] };
}

/** «Dig» øverst, derefter navnene i dansk alfabetisk orden. */
function migFoerst(a, b) {
  if (a.erMig !== b.erMig) return a.erMig ? -1 : 1;
  return String(a.name).localeCompare(String(b.name), 'da');
}

/**
 * Bind en emoji til ordet foran med et hårdt mellemrum, så «⚽» ikke kan stå
 * alene på sin egen linje i en smal kolonne. Et hårdt mellemrum frem for
 * nowrap: et langt navn kan stadig knækkes inde i ordet (overflow-wrap).
 */
export function bindEmoji(navn) {
  return String(navn ?? '').replace(/\s+(?=\p{Extended_Pictographic})/gu, '\u00A0');
}

/** Hvilke navne vises, og hvor mange gemmes bag «+N flere»? */
export function synligeNavne(rows, foldet) {
  if (!foldet || rows.length <= MAKS_VIST + 1) return { vis: rows, rest: 0 };
  return { vis: rows.slice(0, MAKS_VIST), rest: rows.length - MAKS_VIST };
}

/** Én kolonne under en 1/X/2-knap: antal og navne, ét pr. linje. */
function HvemKolonne({ udfald, rows, facit }) {
  const [udfoldet, setUdfoldet] = useState(false);
  const ramt = facit ? udfald === facit : null;
  // De rigtige navne er belønningen — de foldes aldrig, når facit er sat.
  const { vis, rest } = synligeNavne(rows, ramt !== true && !udfoldet);
  const kls = `hvem${ramt === true ? ' hvem--ramt' : ''}${ramt === false ? ' hvem--forbi' : ''}`;
  return (
    <div className={kls} role="group" aria-label={`Tippede ${udfald}`} data-udfald={udfald}>
      <span className="hvem__antal">
        {ramt === true && <span aria-hidden="true">✓ </span>}
        {rows.length} tippede
        {ramt === true && <span className="sr-only"> – rigtigt udfald</span>}
      </span>
      {rows.length === 0 ? (
        // «–», ikke «Ingen»: en tom kolonne kan også være tips, der ikke er
        // bagfyldt med liga-feltet endnu. Kun efter facit, i den rigtige
        // kolonne, siges det højt — dét er øjeblikket, der kan prales med.
        <span className="hvem__tom">{ramt === true ? 'Ingen så den komme' : '–'}</span>
      ) : (
        <ul>
          {vis.map((r) => (
            <li key={r.id} className={r.erMig ? 'hvem__dig' : undefined}>
              {bindEmoji(r.name)}
              {Number(r.chanceStake) > 0 && (
                <span title={`Chancen: ${fmtDec(r.chanceStake)} point på spil`}>{'\u00A0'}⚡</span>
              )}
            </li>
          ))}
          {rest > 0 && (
            <li>
              <button type="button" className="hvem__flere" onClick={() => setUdfoldet(true)}>
                +{rest} flere
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * @param {object} o
 * @param {string} o.gameId
 * @param {object} o.match      – kampen (skal være gået i gang)
 * @param {string} o.myUid
 * @param {object} [o.myBet]    – kortets eget tip (betsByMatch[match.id])
 * @param {string[]} o.leagueIds – mine ligaer i spillet
 * @param {() => void} [o.onHentet] – kaldes, når hentningen er færdig (kortet
 *   er vokset) — FootballTip bruger det til at rulle ?kamp=-kortet ind igen
 */
export default function LeagueBets({ gameId, match, myUid, myBet, leagueIds, onHentet }) {
  const harLiga = Boolean(leagueIds?.length);
  const { bets, loading, error } = useMatchLeagueBets(gameId, match?.id, leagueIds, harLiga);

  // Når hentningen går fra "i gang" til "færdig", er kortet vokset.
  const varIGang = useRef(false);
  useEffect(() => {
    if (loading) { varIGang.current = true; return; }
    if (varIGang.current) {
      varIGang.current = false;
      onHentet?.();
    }
  }, [loading, onHentet]);

  // Er man ikke i nogen liga, er der ingen at sammenligne med — og reglen ville
  // afvise forespørgslen. Sig hvorfor i stedet for at vise en tom liste.
  if (!harLiga) {
    return (
      <p className="hvem-blok" style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
        <GameTabLink fane="ligaer">Bliv med i en liga</GameTabLink> for at se, hvad de andre tippede.
      </p>
    );
  }

  const { andre, alle } = samletListe(bets, myBet, myUid);
  const facit = OUTCOMES.includes(match?.result) ? match.result : null;
  // Samme liste som kolonnerne — se samletListe.
  const ensomLinje = ensomRetLinje(alle, facit, myUid);
  const kolonner = OUTCOMES.map((o) => ({
    udfald: o,
    rows: alle.filter((b) => b.pick === o).sort(migFoerst),
  }));
  const klar = !loading && !error;

  return (
    <div className="hvem-blok">
      {loading && <div className="spinner" role="status" aria-label="Indlæser" />}
      {error && <p className="badge badge--red" role="alert">{error}</p>}
      {/* Bevidst forsigtig formulering: en tom liste kan også betyde, at
          tippene er ældre end liga-feltet og endnu ikke bagfyldt. At sige
          "ingen tippede" ville pege det forkerte sted hen. Har kun jeg
          tippet, er der intet at sammenligne med — og så intet gitter. */}
      {klar && andre.length === 0 && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--c-muted)' }}>
          Ingen tips at vise fra dine ligaer på denne kamp.
        </p>
      )}
      {klar && andre.length > 0 && (
        <>
          {/* Over gitteret: den ene sætning, man kan læse højt. */}
          {ensomLinje && <p className="hvem-linje">{ensomLinje}</p>}
          <div className="hvem-grid" role="group" aria-label="Hvem i dine ligaer tippede hvad">
            {kolonner.map((k) => (
              <HvemKolonne key={k.udfald} udfald={k.udfald} rows={k.rows} facit={facit} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
