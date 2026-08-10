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
 * INGEN MÅLT TRØJE FALDER PÅ DEN, OG DEN ER KUN BUNDET I DEN ENE ENDE.
 *
 * Her stod, at 2:1 lå midt mellem to målte yderpunkter — den laveste, der skal
 * bestå (Randers' kvarterer, 5,49:1), og den laveste målte overhovedet (OB's
 * tern, 1,12:1) — og at spillerummet derfor var en faktor 4,9. Det holder
 * ikke længere: OB's tern er et skakbræt, altså repeterende, og falder på
 * halvdel-testen (28,2 % mod 71,8 %). Kontrasten dømmer den ikke, så den
 * binder heller ikke tærsklen nedadtil.
 *
 * Tilbage står ÉN ægte binding: enhver værdi under 5,49 giver samme svar på
 * alle syv mønstermålinger. 2:1 er altså et valg om FREMTIDEN — en vagt mod en
 * enkeltfigur i to næsten ens farver, som endnu ikke er målt. Det skal stå
 * her, så ingen læser tallet som efterprøvet i begge retninger. Skal det
 * bindes nedadtil, kræver det en trøje, der falder på det.
 */
export const KONTRAST_ENKELTFIGUR = 2;

/**
 * Nr. 2 skal fylde mindst halvdelen af nr. 1, før en REPETERENDE trøje tæller
 * som tofarvet. Den stod som et bart `0.5` i tre eksemplarer — se `erTofarvet`.
 */
export const HALVDEL = 0.5;

/**
 * DEN UDELTE TEST — de to ældre scripts' udgave, nu med de samme tal.
 *
 * `superliga-troejefarver.mjs` (som afgjorde alle tolv HJEMMEtrøjer) og
 * `troejefarver()` i `holdfarver-wikipedia.mjs` havde hver sin inline kopi:
 *
 *     const store = fl.filter((f) => f.andel >= 0.12);
 *     const to = store.length >= 2 && store[1].andel >= store[0].andel * 0.5;
 *
 * Tre eksemplarer af samme beslutning, hvoraf kun det ene var testet. Det er
 * konkret, ikke teoretisk: kørte man hjemme-scriptet på Randers' skråbånd,
 * ville det stadig sige "ensfarvet", fordi det ikke kender `slags`. Trøjen
 * bærer kun sit bånd, fordi den blev målt af det ANDET script.
 *
 * Sammenligningen er `>=` og ikke `>` som i `bestaarTofarvet`. Det er de to
 * scripts' hidtidige adfærd, bevaret med vilje: ingen målt flade ligger på
 * præcis 12,0 %, men en tærskel må ikke flytte sig, fordi den skiftede fil.
 */
export function erTofarvet(flader) {
  const store = flader.filter((f) => f.andel * 100 >= GULV_PCT);
  return store.length >= 2 && store[1].andel >= store[0].andel * HALVDEL;
}

/**
 * Består mønsteret husets tofarvet-test?
 *
 * TO SLAGS, og det er hele pointen. Kravet "nr. 2 skal fylde mindst halvdelen
 * af nr. 1" giver kun mening for STRIBER, hvor to farver skiftevis dækker
 * trøjen. Én figur — et brystbånd, et skråbånd, en deling i kvarterer — fylder
 * i sagens natur 15-50 % og kunne aldrig bestå. Uden den skelnen stod Brøndbys
 * bånd og Randers' skråbånd ensfarvede, selv om begge er umulige at overse.
 *
 * (Her stod "et skakbræt" i opremsningen af ÉN FIGUR — syv linjer over, at
 * reglen nedenfor lister skakbræt under REPETERENDE. To nabosætninger, modsat
 * svar; præcis den fælde, CLAUDE.md navngiver. Et skakbræt er repeterende.)
 *
 * HVORNÅR ER NOGET HVAD? Reglen skal stå skrevet, ellers sættes `slags` i
 * hånden pr. trøje, og så er den knap, der i virkeligheden afgør udfaldet.
 *
 *   REPETERENDE (`striber`)   figuren gentages ud over kroppen — striber,
 *                             bøjler, gitter, skakbræt. To farver dækker
 *                             skiftevis, så halvdel-testen er den rigtige.
 *   ÉN FIGUR (`enkeltfigur`)  én form på en ensfarvet bund — et brystbånd, et
 *                             skråbånd, en deling i kvarterer. Den fylder i
 *                             sagens natur 15-50 % og ville aldrig bestå
 *                             halvdel-testen, så den dømmes på synlighed.
 *
 * Badgens egne former falder rent i de to: `striber`, `boejler` og `firkanter`
 * gentager sig; `baand`, `skraabaand`, `ternet`, `halveret` og `vandret-delt`
 * sidder én gang.
 *
 * HVOR GÅR SNITTET MELLEM `ternet` OG `firkanter`? Begge er felter i et gitter,
 * så "gentager figuren sig" er ikke nok af en regel — og der findes ingen målt
 * trøje imellem dem, der kunne afgøre det. Snittet er derfor sat eksplicit:
 * **2×2 er én figur, 2×3 og opefter er repeterende.** Begrundelsen er, hvad
 * øjet ser ved 22 px: i et 2×2 møder de to farver hinanden ét sted, og man
 * læser en DELING af trøjen. Fra tre felter i en retning læser man et MØNSTER,
 * og så er det de to farvers indbyrdes mængde, der afgør om det kan ses.
 *
 * Det er ikke akademisk. Randers' kvarterer består begge veje (47,1 % er 89 %
 * af nr. 1), så valget er usynligt i dag — men en fremtidig 30/70-kvarteret
 * trøje ville vippe på det, og så skal grænsen have stået der i forvejen.
 *
 * @param {'striber'|'enkeltfigur'} slags – PÅKRÆVET. Se `assertSlags`.
 * @param {number} pct2      – farve nr. 2's andel af fladen, i procent
 * @param {number} kontrast  – WCAG-kontrast mellem de to farver
 * @param {number} andel2    – nr. 2's andel som brøk af nr. 1 (kun for striber)
 * @returns {{bestaar: boolean, grund: string}}
 */
/**
 * `slags` SKAL stå. Den var før valgfri, og alt der ikke var `'enkeltfigur'`
 * blev stiltiende til striber — så en tastefejl (`enkelfigur`) eller et glemt
 * felt gav tavst det modsatte svar af det tilsigtede. Det er den vigtigste
 * knap i hele beslutningen, og den må ikke kunne sættes ved et uheld.
 */
export function assertSlags(slags) {
  if (slags !== 'striber' && slags !== 'enkeltfigur') {
    throw new Error(`slags skal være 'striber' eller 'enkeltfigur', ikke ${JSON.stringify(slags)}`);
  }
  return slags;
}

export function bestaarTofarvet({ slags, pct2, kontrast, andel2 }) {
  assertSlags(slags);
  if (!(pct2 > GULV_PCT)) {
    return { bestaar: false, grund: `fylder ${pct2.toFixed(1)} % — under ${GULV_PCT} %-gulvet` };
  }
  if (slags === 'enkeltfigur') {
    return kontrast >= KONTRAST_ENKELTFIGUR
      ? { bestaar: true, grund: `enkeltfigur på ${pct2.toFixed(1)} % med ${kontrast.toFixed(2)}:1` }
      : { bestaar: false, grund: `kun ${kontrast.toFixed(2)}:1 i kontrast — kan ikke ses ved 22 px` };
  }
  return andel2 >= HALVDEL
    ? { bestaar: true, grund: `striber, nr. 2 er ${(andel2 * 100).toFixed(0)} % af nr. 1` }
    : { bestaar: false, grund: `nr. 2 er kun ${(andel2 * 100).toFixed(0)} % af nr. 1 — striber skal være mindst 50 %` };
}
