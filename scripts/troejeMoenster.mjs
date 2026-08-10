// ---------------------------------------------------------------------------
// scripts/troejeMoenster.mjs — AFGØR, OM EN TRØJE SKAL BÆRE SIT MØNSTER.
//
// Beslutningen lå inline i `superliga-ude-tredje.mjs`, inde i en top-level
// `if (process.argv.includes('--moenster'))` med netværkskald. Den kunne derfor
// ikke importeres, og den var HELT udækket: kontrast-tærsklen kunne sættes fra
// 2 til 1 — så OB's tern på 1,12:1 ville stå som "BESTÅR" — med alle 2022 tests
// grønne. Samme situation som `holdfarver-wikipedia.mjs` havde, før dens
// tærskel blev trukket ud og testet.
//
// Den bor derfor her, uden afhængigheder, og scriptet importerer den.
// ---------------------------------------------------------------------------

/**
 * Mindsteandel af trøjens flade, før farve nr. 2 overhovedet tæller som et
 * mønster. Under den er der tale om en pinstribe eller et tonet tryk, som ved
 * 22 px bliver til et farvegennemsnit — præcis dét, badgen skal undgå.
 */
export const GULV_PCT = 12;

/**
 * Mindstekontrast for en ENKELTFIGUR. To flader kan sagtens dække hver sin
 * fjerdedel af trøjen og alligevel være umulige at skelne: OB's tredjetrøje er
 * ternet i to lyserøde med 1,12:1, og brættet ville blive lyserødt på lyserødt.
 *
 * 2:1 er valgt, fordi det ligger mellem de to yderpunkter, vi FAKTISK har målt,
 * og ikke tæt på nogen af dem: den laveste, der skal bestå, er Randers'
 * skråbånd på 5,49:1, og den højeste, der skal falde, er OB's 1,12:1. Enhver
 * tærskel mellem 1,2 og 5,4 ville give samme svar på de syv målte trøjer — 2:1
 * er det runde tal i midten af det spænd. Kommer der en trøje imellem, skal
 * tallet begrundes om, ikke bare flyttes.
 */
export const KONTRAST_ENKELTFIGUR = 2;

/**
 * Består mønsteret husets tofarvet-test?
 *
 * TO SLAGS, og det er hele pointen. Kravet "nr. 2 skal fylde mindst halvdelen
 * af nr. 1" giver kun mening for STRIBER, hvor to farver skiftevis dækker
 * trøjen. Én figur — et brystbånd, et skråbånd, et skakbræt — fylder i sagens
 * natur 15-30 % og kunne aldrig bestå. Uden den skelnen stod Brøndbys bånd og
 * Randers' skråbånd ensfarvede, selv om begge er umulige at overse på trøjen.
 *
 * @param {'striber'|'enkeltfigur'} slags
 * @param {number} pct2      – farve nr. 2's andel af fladen, i procent
 * @param {number} kontrast  – WCAG-kontrast mellem de to farver
 * @param {number} andel2    – nr. 2's andel som brøk af nr. 1 (kun for striber)
 * @returns {{bestaar: boolean, grund: string}}
 */
export function bestaarTofarvet({ slags, pct2, kontrast, andel2 }) {
  if (!(pct2 > GULV_PCT)) {
    return { bestaar: false, grund: `fylder ${pct2.toFixed(1)} % — under ${GULV_PCT} %-gulvet` };
  }
  if (slags === 'enkeltfigur') {
    return kontrast >= KONTRAST_ENKELTFIGUR
      ? { bestaar: true, grund: `enkeltfigur på ${pct2.toFixed(1)} % med ${kontrast.toFixed(2)}:1` }
      : { bestaar: false, grund: `kun ${kontrast.toFixed(2)}:1 i kontrast — kan ikke ses ved 22 px` };
  }
  return andel2 >= 0.5
    ? { bestaar: true, grund: `striber, nr. 2 er ${(andel2 * 100).toFixed(0)} % af nr. 1` }
    : { bestaar: false, grund: `nr. 2 er kun ${(andel2 * 100).toFixed(0)} % af nr. 1 — striber skal være mindst 50 %` };
}
