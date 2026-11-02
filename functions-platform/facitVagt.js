// ---------------------------------------------------------------------------
// functions-platform/facitVagt.js — STRANDEDE-ALARMEN for ALLE aktive kampspil.
//
// Før dækkede alarmen kun spillene i SYNCED_GAMES: den sad inde i sweep'ets
// løkke over de synkede spil. Et kampspil UDEN kilde (fx et håndboldspil, før
// provideren er i drift, eller et håndseedet spil) kunne derfor have en kamp,
// der aldrig fik facit, uden en lyd — og netop dér er der ingen synk, der kan
// redde den. Det er det spil, der har MEST brug for vagten.
//
// To veje deler ÉN kerne (meldStrandede), så teksten og lukningen ikke kan
// drive fra hinanden:
//   * synkede spil   — sweep'ets løkke i index.js, som før (samme kampliste,
//                      samme fradrag af netop rettede kampe).
//   * spil uden synk — facitVagtUdenSynk her, med sit eget Drift-kort
//                      `facitvagt-{gameId}`, så en kørsel, der fejler, ikke
//                      er tavs (postbudet gør røde og forsinkede kort til
//                      alarm-mails af sig selv).
//
// KAMPE UDEN KICKOFF (QC-fund). strandedMatches melder en kamp uden læseligt
// kickoff med det samme, uanset alder — den sikre retning, for en sådan kamp
// kommer aldrig i et vindue og ville ellers stå uafregnet for evigt. Det
// bevares, også for spil uden synk: en kamp uden kickoff kan heller ikke
// tippes (reglerne kræver det) og får ikke facit i hånden (manuelFacit.js
// afviser den). Alarmens tekst siger derfor "ret kickoff", ikke "sæt facit"
// (driftlog.strandetBesked). Planens regel er: opret aldrig en kamp uden
// kickoff — og bliver den brudt, er en rød alarm det rigtige svar.
// ---------------------------------------------------------------------------

const { strandedMatches, allMatches } = require('./superligaSync');
const {
  meldAlarm, loesDriftAlarmer, strandetBesked, statusSamler,
} = require('./driftlog');
const { forventerFacit, erKampspil, uenigTekst } = require('./facit');

/** «1 kamp» / «2 kampe» — Drift-kortenes tekster bøjes, så de ikke siger «1 kampe». */
function kampOrd(n) {
  return n === 1 ? 'kamp' : 'kampe';
}

/**
 * Meld hver strandet kamp i ét spil, og luk alarmer for kampe, der siden har
 * fået facit. Ren rørføring over strandedMatches — lister ind, liste ud.
 *
 * @param {{gameId:string, kampe:Array<{id:string,data:object}>, harSynk:boolean,
 *          nowMs?:number, meld?:Function, loes?:Function}} args
 * @returns {Promise<Array<{id:string,data:object}>>} de strandede kampe
 */
async function meldStrandede(db, FieldValue, {
  gameId, kampe, harSynk, nowMs = Date.now(), meld = meldAlarm, loes = loesDriftAlarmer,
}) {
  const strandede = strandedMatches(kampe, nowMs);
  for (const m of strandede) {
    await meld(db, FieldValue, {
      type: 'strandet', gameId, kampId: m.id,
      // Remediet står I alarmen — en alarm uden næste skridt er en blindgyde.
      besked: strandetBesked(m.id, { harSynk, kamp: m.data }),
    });
  }
  // Auto-luk: en strandet kamp, der siden fik facit, er løst — ellers hober
  // døde røde kort sig op, og ejeren lærer at ignorere fladen.
  await loes(db, FieldValue, { type: 'strandet', gameId, aktuelleKampIds: strandede.map((m) => m.id) });
  return strandede;
}

/**
 * Kampe med facit i hånden, som kilden er UENIG i → en advarsel på sweep'ets
 * Drift-kort, med holdnavne og begge stillinger.
 *
 * Før stod uenigheden kun i svaret fra "⬇️ Synk resultater nu" — og den
 * knap trykker ingen på, når alt ser grønt ud. Enten var tastningen forkert,
 * eller kilden er; begge dele skal et menneske se, og ingen af dem retter sig
 * selv (synken rører ikke en manuel kamp). Advarslen står, så længe
 * uenigheden står, og forsvinder af sig selv, når den er løst.
 *
 * @param {{advarsel:Function}} st  statusSamler for kørslen
 * @param {Array<object>} uenige    syncResultsCore().manuelleUenige
 * @returns {number} antal uenige
 */
function meldManuelleUenige(st, uenige) {
  const liste = Array.isArray(uenige) ? uenige : [];
  if (!liste.length) return 0;
  st.advarsel(
    `Kilden er uenig med facit i hånden om ${liste.length} ${kampOrd(liste.length)}: `
    + `${liste.map(uenigTekst).join('; ')}. Synken rører dem ikke. Var tastningen forkert, så ret den med `
    + '✍️ Sæt eller ret facit i hånden; har kilden ret, så tryk ↩️ Lad synken overtage igen samme sted '
    + '(Admin → 🗓️ Spil-tidsplan).',
    { manuelleUenige: liste.length },
  );
  return liste.length;
}

/**
 * Hvilke spil vogter facitVagtUdenSynk? Aktive kampspil, der IKKE står i
 * SYNCED_GAMES. Ren, så delingen kan testes: et spil må aldrig vogtes af
 * begge veje (dobbelt alarm) eller af ingen (tavst).
 *
 * `lukkes` er ALLE andre kampspil — afsluttede OG synkede. Et spil, der
 * flytter ind i SYNCED_GAMES (håndbold, når provideren lander), vogtes fra da
 * af sweep-løkken; uden lukningen ville dets gamle facit-vagt-kort stå med en
 * passeret frist for evigt, og postbudet ville melde "kørslen er forsinket"
 * om en kørsel, der med vilje er holdt op.
 *
 * @param {Array<object>} games  spil-dokumenter med id
 * @param {Iterable<string>} synkedeIds
 * @returns {{aktive:object[], lukkes:object[]}}
 */
function spilUdenSynk(games, synkedeIds) {
  const synkede = new Set(synkedeIds);
  const kampspil = (games || []).filter((g) => g && erKampspil(g));
  const vogtes = (g) => !synkede.has(g.id) && forventerFacit(g);
  return {
    aktive: kampspil.filter(vogtes),
    lukkes: kampspil.filter((g) => !vogtes(g)),
  };
}

/**
 * Strandede-vagten for kampspil uden resultat-synk. Én kørsel = ét kort pr.
 * spil (`facitvagt-{gameId}`).
 *
 * Et spil, der ikke længere vogtes HER (sat til afsluttet, eller flyttet ind
 * i SYNCED_GAMES), får sit kort lukket med naesteForventetFoer: null — ellers
 * stod det RØDT "HAR IKKE KØRT" for evigt (samme greb som påmindelses-
 * jobbet). Kun hvis kortet findes, og kun én gang: et spil, der aldrig har
 * været vogtet her (Superligaen, Premier League), får aldrig et kort.
 *
 * @param {{synkedeIds:Iterable<string>, nowMs?:number,
 *          naesteForventetFoerMs:Function|number|null,
 *          skriv:Function, meld?:Function, loes?:Function}} args
 *   skriv(st, opts) skriver kortet — index.js' skrivDriftStatus, der aldrig
 *   må vælte kørslen.
 * @returns {Promise<Array<{gameId:string, strandede:number, fejl:string|null}>>}
 */
async function facitVagtUdenSynk(db, FieldValue, {
  synkedeIds, nowMs = Date.now(), naesteForventetFoerMs, skriv, meld, loes,
}) {
  const snap = await db.collection('games').where('type', '==', 'football').get();
  const games = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const { aktive, lukkes } = spilUdenSynk(games, synkedeIds);
  const synkede = new Set(synkedeIds);

  for (const g of lukkes) {
    try {
      const cur = await db.collection('driftlog').doc(`facitvagt-${g.id}`).get();
      if (cur.exists && cur.data().naesteForventetFoer != null) {
        const st = statusSamler({ type: 'facitvagt', gameId: g.id, gameNavn: g.name });
        st.ok(synkede.has(g.id)
          ? 'Spillet har fået resultat-synk — kampene vogtes nu af Times-sweep\'et.'
          : 'Spillet er ikke åbent eller i gang længere — kampene vogtes ikke.');
        await skriv(st, { naesteForventetFoerMs: null });
      }
    } catch (err) {
      console.error(`facitVagt(${g.id}): kunne ikke lukke kortet (ignoreret):`, err?.message || err);
    }
  }

  const ud = [];
  for (const g of aktive) {
    const st = statusSamler({ type: 'facitvagt', gameId: g.id, gameNavn: g.name });
    let strandede = 0;
    let fejl = null;
    try {
      const kampe = await allMatches(db, { gameId: g.id });
      const liste = await meldStrandede(db, FieldValue, {
        gameId: g.id, kampe, harSynk: false, nowMs, meld, loes,
      });
      strandede = liste.length;
      if (strandede > 0) {
        console.error(`${g.id}: kampe UDEN facit længe efter kickoff — point er ikke afregnet:`,
          liste.map((m) => m.id).join(', '));
        st.fejl(`${strandede} ${kampOrd(strandede)} uden facit længe efter kickoff — point er ikke afregnet. Spillet har ingen synk: sæt facit i hånden.`,
          { strandede });
      } else {
        st.ok(`${kampe.length} ${kampOrd(kampe.length)} gennemgået — ingen mangler facit efter kickoff.`, { strandede: 0 });
      }
    } catch (err) {
      fejl = err?.message || String(err);
      console.error(`facitVagt(${g.id}) fejlede (ignoreret):`, fejl);
      st.fejl(`Strandede-tjekket fejlede: ${fejl}`);
    }
    await skriv(st, { naesteForventetFoerMs });
    ud.push({ gameId: g.id, strandede, fejl });
  }
  return ud;
}

module.exports = {
  kampOrd,
  meldStrandede, spilUdenSynk, facitVagtUdenSynk, meldManuelleUenige,
};
