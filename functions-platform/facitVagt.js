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
//
// RUNDE-PULJEN (puljeVagt). Alarmen `puljeFacit` regnes også i afregningen
// (settlePuljeBets), men den kører kun ved et resultat eller ved knappen. Det
// scenarie, alarmen er bygget til — semifinalerne bliver aldrig lagt ind, eller
// kun den ene — giver INGEN kamp og dermed intet resultat: afregningen ville
// aldrig se det (QC-fund). Derfor tjekkes hvert åbent eller igangværende spil
// med runde-pulje her, i hver times-sweep, med SAMME tilstand og SAMME
// melding som afregningen (gameScoring.rundePuljeTilstand/meldPuljeAlarm).
//
// NÆSTE FASES KAMPE (faseKampeVagt, D9.4). Ingen kilde lægger hovedrunden
// eller knockout-faserne ind af sig selv — et menneske gør (📥 under
// Spil-tidsplan). Glemmes en dag, er der ingen kamp og intet resultat, og
// intet andet maskineri ser det. Derfor tjekkes hvert spil, der forventer
// fasekampe (facit.forventerFaseKampe), i hver times-sweep — med eller uden
// synk, så vagten overlever, at spillet en dag får en kilde (D8). Den deler
// kamplisten med strandede-tjekket og har sit eget Drift-kort `fasekampe`.
// ---------------------------------------------------------------------------

const { strandedMatches, allMatches } = require('./superligaSync');
const {
  meldAlarm, loesDriftAlarmer, strandetBesked, statusSamler,
} = require('./driftlog');
const {
  forventerFacit, forventerFaseKampe, erKampspil, uenigTekst,
} = require('./facit');
const { faseVagtTilstand } = require('./faseKampe');
const { rundePuljeTilstand, meldPuljeAlarm } = require('./gameScoring');
const { puljeKonfig } = require('./superligaScoring');

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

/** Har spillet en runde-pulje («hvem når semifinalerne?»)? */
function harRundePulje(game) {
  return puljeKonfig(game)?.facitKilde === 'runde';
}

/**
 * UDEBLIVELSES-VAGTEN for en runde-pulje: kan puljen ikke afgøres, og er det
 * en FEJL (fasen skulle være begyndt, en dublet, en konfigurationsfejl), så
 * meld `puljeFacit`; kan den afgøres, så luk den. «Ikke lagt ind endnu» før
 * fasens startdag gør intet. null for et spil uden runde-pulje.
 *
 * @param {{game:object, kampe:Array<{id:string,data:object}>, nowMs?:number,
 *          meld?:Function, loes?:Function}} args  game med id
 * @returns {Promise<{kan:boolean, fejl:string[]}|null>}
 */
async function puljeVagt(db, FieldValue, {
  game, kampe, nowMs = Date.now(), meld, loes,
}) {
  const matches = (kampe || []).map((k) => ({ ...k.data, id: k.id }));
  const tilstand = rundePuljeTilstand(game, matches, nowMs);
  if (!tilstand) return null;
  if (tilstand.fejl.length) {
    console.error(`puljeVagt(${game.id}): puljen kan ikke afgøres — ${tilstand.fejl.join('; ')}`);
  }
  await meldPuljeAlarm(db, FieldValue, {
    gameId: game.id, spil: game, tilstand, nowMs, ...(meld ? { meld } : {}), ...(loes ? { loes } : {}),
  });
  return tilstand;
}

/** «1 dag» / «2 dage». */
function dagOrd(n) {
  return n === 1 ? 'dag' : 'dage';
}

/**
 * UDEBLIVELSES-VAGTEN for næste fases kampe — én kørsel = ét kort
 * (`fasekampe-{gameId}`) og én alarm `faseKampe` pr. dag, der mangler kampe
 * efter kl. 12 dagen før og stadig kan få dem (faseKampe.faseVagtTilstand).
 * Alarmer for dage, der ikke længere mangler (eller ikke længere KAN få
 * kampe — så står det som advarsel på kortet), lukkes.
 *
 * Kortet lukkes (naesteForventetFoer: null), når kalenderen er udtømt — ellers
 * stod det RØDT «HAR IKKE KØRT» efter finalen.
 *
 * @param {{game:object, kampe:Array<{id:string,data:object}>, nowMs?:number,
 *          naesteForventetFoerMs:Function|number|null, skriv:Function,
 *          meld?:Function, loes?:Function}} args  game med id
 * @returns {Promise<object>} tilstanden
 */
async function faseKampeVagt(db, FieldValue, {
  game, kampe, nowMs = Date.now(), naesteForventetFoerMs, skriv, meld = meldAlarm, loes = loesDriftAlarmer,
}) {
  const st = statusSamler({ type: 'fasekampe', gameId: game.id, gameNavn: game.name });
  let tilstand = null;
  try {
    const matches = (kampe || []).map((k) => ({ ...k.data, id: k.id }));
    tilstand = faseVagtTilstand(game, matches, nowMs);
    for (const a of tilstand.alarmer) {
      await meld(db, FieldValue, {
        type: 'faseKampe', gameId: game.id, kampId: a.kampId, besked: a.besked, nowMs,
      });
    }
    await loes(db, FieldValue, {
      type: 'faseKampe', gameId: game.id, aktuelleKampIds: tilstand.alarmer.map((a) => a.kampId), nowMs,
    });
    if (tilstand.alarmer.length) {
      console.error(`faseKampeVagt(${game.id}): ${tilstand.alarmer.map((a) => a.kampId).join(', ')} mangler kampe.`);
      st.fejl(`${tilstand.alarmer.length} ${dagOrd(tilstand.alarmer.length)} mangler kampe og skal lægges ind før første kamp: Admin → 🗓️ Spil-tidsplan → 📥 Læg næste fases kampe ind.`,
        { mangler: tilstand.alarmer.length });
    }
    for (const adv of tilstand.advarsler) st.advarsel(adv);
    for (const l of tilstand.linjer) st.ok(l);
  } catch (err) {
    console.error(`faseKampeVagt(${game.id}) fejlede (ignoreret):`, err?.message || err);
    st.fejl(`Fase-tjekket fejlede: ${err?.message || err}`);
  }
  await skriv(st, { naesteForventetFoerMs: tilstand?.udtoemt ? null : naesteForventetFoerMs });
  return tilstand;
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
 * RUNDE-PULJEN tjekkes for HVERT åbent eller igangværende kampspil med en
 * (puljeVagt) — også de synkede: sweep-løkken i index.js kender ikke
 * spil-dokumentet, og et håndboldspil, der får synk, må ikke miste vagten.
 * For et spil her genbruges kamplisten; et synket spil koster ét opslag.
 * Fejler pulje-tjekket, står det på spillets kort (eller i konsollen for et
 * synket spil) — strandede-tjekket kører uafhængigt af det.
 *
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

  // FASEKAMPE-KORTET LUKKES, når spillet ikke længere forventer fasekampe
  // (afsluttet, eller kalenderen er blevet ugyldig) — QC B5: ellers blev det
  // forsinket, og postbudet meldte en kørsel, der med vilje er holdt op. Kun
  // spil med et `faser`-felt kan have haft kortet; resten koster intet opslag.
  for (const g of games.filter((x) => erKampspil(x) && Array.isArray(x.faser) && !forventerFaseKampe(x))) {
    try {
      const cur = await db.collection('driftlog').doc(`fasekampe-${g.id}`).get();
      if (cur.exists && cur.data().naesteForventetFoer != null) {
        const st = statusSamler({ type: 'fasekampe', gameId: g.id, gameNavn: g.name });
        st.ok('Spillet forventer ikke flere kampe i nye faser (afsluttet, eller uden gyldig fasekalender) — vagten er slået fra.');
        await (loes || loesDriftAlarmer)(db, FieldValue, { type: 'faseKampe', gameId: g.id, aktuelleKampIds: [], nowMs });
        await skriv(st, { naesteForventetFoerMs: null });
      }
    } catch (err) {
      console.error(`faseKampeVagt(${g.id}): kunne ikke lukke kortet (ignoreret):`, err?.message || err);
    }
  }

  const ud = [];
  for (const g of aktive) {
    const st = statusSamler({ type: 'facitvagt', gameId: g.id, gameNavn: g.name });
    let strandede = 0;
    let fejl = null;
    let kampe = null;
    try {
      kampe = await allMatches(db, { gameId: g.id });
      const liste = await meldStrandede(db, FieldValue, {
        gameId: g.id, kampe, harSynk: false, nowMs, meld, loes,
      });
      strandede = liste.length;
      try {
        await puljeVagt(db, FieldValue, { game: g, kampe, nowMs, meld, loes });
      } catch (err) {
        console.error(`puljeVagt(${g.id}) fejlede (ignoreret):`, err?.message || err);
        st.fejl(`Pulje-tjekket fejlede: ${err?.message || err}`);
      }
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
    // Næste fases kampe — samme kampliste, eget kort, skrevet EFTER
    // facit-vagtens (faseKampeVagt fanger selv sine fejl og skriver dem på
    // sit eget kort). Kunne kampene ikke hentes, har vagten intet grundlag —
    // så står fejlen på facit-vagt-kortet ovenfor, og fase-kortet skrives ikke
    // (det bliver forsinket og meldes af postbudet, i stedet for at lyve grønt).
    if (kampe && forventerFaseKampe(g)) {
      await faseKampeVagt(db, FieldValue, {
        game: g, kampe, nowMs, naesteForventetFoerMs, skriv, ...(meld ? { meld } : {}), ...(loes ? { loes } : {}),
      });
    }
  }

  // De synkede spil med runde-pulje eller fasekalender (i dag ingen): samme
  // vagter, ét opslag af kampene pr. spil.
  for (const g of lukkes.filter((x) => synkede.has(x.id) && forventerFacit(x) && (harRundePulje(x) || forventerFaseKampe(x)))) {
    let kampe;
    try {
      kampe = await allMatches(db, { gameId: g.id });
    } catch (err) {
      console.error(`facitVagt(${g.id}): kampene kunne ikke hentes til pulje-/fase-tjekket (ignoreret):`, err?.message || err);
      continue;
    }
    if (harRundePulje(g)) {
      try {
        await puljeVagt(db, FieldValue, { game: g, kampe, nowMs, meld, loes });
      } catch (err) {
        console.error(`puljeVagt(${g.id}) fejlede (ignoreret):`, err?.message || err);
      }
    }
    if (forventerFaseKampe(g)) {
      await faseKampeVagt(db, FieldValue, {
        game: g, kampe, nowMs, naesteForventetFoerMs, skriv, ...(meld ? { meld } : {}), ...(loes ? { loes } : {}),
      });
    }
  }
  return ud;
}

module.exports = {
  kampOrd,
  meldStrandede, spilUdenSynk, facitVagtUdenSynk, meldManuelleUenige, puljeVagt, faseKampeVagt,
};
