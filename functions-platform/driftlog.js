// ---------------------------------------------------------------------------
// functions-platform/driftlog.js — synk-maskineriets status, skrevet hvor
// EJEREN kan se den (Admin → Driftstatus) i stedet for kun i Cloud-loggen.
//
// Ejeren kan ikke finde functions-loggen og skal ikke lære det. Reglen "en
// funktion, der kun kan fejle tavst, er ikke færdig" ender her: hver skemalagt
// kørsel efterlader ÉT status-dokument (seneste billede), og hændelser, der
// kræver en menneskelig handling, bliver stående som ALARMER, til de er
// kvitteret eller har løst sig selv.
//
// To samlinger (top-level — gameId/type er FELTER, ikke kun dokument-id):
//   driftlog/{type}-{gameId}   seneste status pr. kørsel-type. Merge-
//     overskrives; bunden lagring. Serveren skriver selv naesteForventetFoer
//     — klienten må ALDRIG gætte kadencen (en hardkodet tærskel drev fra
//     cron'en uden en rød test og lyste rødt 10 timer hver nat).
//   driftAlarmer/{deterministisk-id}   én alarm pr. HÆNDELSE (samme strandede
//     kamp set 12 gange = ét dokument med antal/sidstSetAt, ikke 12). Lukkes
//     af loesDriftAlarmer (auto — fx strandet kamp, der fik facit) eller af
//     ejerens kvittering (callable — genåbning/<48t løser aldrig sig selv).
//
// Læses kun af owner/globalAdmin (rules, emailLog-mønstret); klienten skriver
// ALDRIG — kvittering går gennem en callable. Skrivningen her er altid i
// try/catch hos kalderen med console.error som bagstopper: konsollen er
// stadig sandheden for historik, fladen viser kun NU-billedet.
//
// Modulet er bevidst frit for firebase-imports (db/FieldValue injiceres), så
// Tour-appens functions/ kan adoptere det senere uden omskrivning.
// ---------------------------------------------------------------------------

/** Værste af to niveauer — 'ok' < 'advarsel' < 'fejl'. */
const RANG = { ok: 0, advarsel: 1, fejl: 2 };
function vaerste(a, b) {
  return (RANG[b] ?? 0) > (RANG[a] ?? 0) ? b : a;
}

/**
 * Saml én kørsels status i hukommelsen og skriv den ÉN gang til sidst.
 * Sweep'et har tre uafhængige try/catch-led — skrev hvert led sit eget
 * niveau, ville det sidste (grønne) overskrive det første (røde), og kortet
 * stod grønt på en fejlet kørsel. Derfor: statusSamler, ikke tre skrivninger.
 *
 * @param {{type:string, gameId:string|null, gameNavn?:string|null}} hoved
 */
function statusSamler({ type, gameId = null, gameNavn = null }) {
  const s = {
    type,
    gameId,
    gameNavn: gameNavn || gameId,
    niveau: 'ok',
    linjer: [],
    tal: {},
  };
  return {
    ok(besked, tal) {
      if (besked) s.linjer.push(besked);
      Object.assign(s.tal, tal || {});
    },
    advarsel(besked) {
      s.niveau = vaerste(s.niveau, 'advarsel');
      s.linjer.push(`⚠ ${besked}`);
    },
    fejl(besked) {
      s.niveau = vaerste(s.niveau, 'fejl');
      s.linjer.push(`✖ ${besked}`);
    },
    /**
     * Skriv status-dokumentet. `kilde: 'manuel'` (callables) rører IKKE
     * koertAt/naesteForventetFoer — et manuelt klik må aldrig skjule, at
     * SKEMAET er holdt op med at køre. Dry runs skal slet ikke kalde skriv().
     * @param {{kilde?:'skema'|'manuel', naesteForventetFoerMs?:number|null, nowMs?:number}} o
     */
    async skriv(db, FieldValue, { kilde = 'skema', naesteForventetFoerMs = null, nowMs = Date.now() } = {}) {
      const id = s.gameId ? `${s.type}-${s.gameId}` : s.type;
      const doc = {
        type: s.type,
        gameId: s.gameId,
        gameNavn: s.gameNavn,
        niveau: s.niveau,
        besked: s.linjer.join('\n') || 'Ingen bemærkninger.',
        tal: s.tal,
        senesteKilde: kilde,
        opdateretAt: FieldValue.serverTimestamp(),
      };
      if (kilde === 'skema') {
        doc.koertAt = nowMs;
        doc.naesteForventetFoer = naesteForventetFoerMs;
      }
      await db.collection('driftlog').doc(id).set(doc, { merge: true });
    },
  };
}

/**
 * Meld en alarm — en hændelse, der skal SES af et menneske. Deterministisk id:
 * samme hændelse meldt igen forhøjer antal og sidstSetAt i STEDET for at
 * oprette et nyt dokument (en strandet kamp ses af hvert sweep, 12 gange i
 * døgnet). En tidligere løst/kvitteret alarm, der opstår IGEN, genåbnes.
 *
 * @param {{type:string, gameId:string, kampId?:string|null, besked:string,
 *          kraeverKvittering?:boolean, nowMs?:number}} a
 */
async function meldAlarm(db, FieldValue, { type, gameId, kampId = null, besked, kraeverKvittering = false, nowMs = Date.now() }) {
  const id = [gameId, kampId, type].filter(Boolean).join('_');
  const ref = db.collection('driftAlarmer').doc(id);
  const cur = await ref.get();
  const d = cur.exists ? cur.data() : null;
  await ref.set({
    type,
    gameId,
    kampId,
    besked,
    kraeverKvittering,
    antal: (d?.antal || 0) + 1,
    foersteSetAt: d?.foersteSetAt ?? nowMs,
    sidstSetAt: nowMs,
    // Genåbning: alarmen er aktuel igen, uanset hvad der før var løst/set.
    loestAt: null,
    kvitteretAt: null,
  }, { merge: true });
}

/**
 * Luk alarmer, der har løst sig selv: alle ÅBNE alarmer af `type` for spillet,
 * hvis nøgle IKKE længere er blandt `aktuelleKampIds`. Kaldes af den kørsel,
 * der ejer alarm-typen (fx sweep'et for strandede kampe): ser den problemet
 * ikke længere, er det løst — ellers hober døde røde kort sig op, og ejeren
 * lærer at ignorere fladen.
 */
async function loesDriftAlarmer(db, FieldValue, { type, gameId, aktuelleKampIds, nowMs = Date.now() }) {
  const snap = await db.collection('driftAlarmer')
    .where('gameId', '==', gameId)
    .where('type', '==', type)
    .where('loestAt', '==', null)
    .get();
  const stadig = new Set(aktuelleKampIds || []);
  const batch = db.batch();
  let lukket = 0;
  for (const d of snap.docs) {
    if (stadig.has(d.data().kampId)) continue;
    batch.set(d.ref, { loestAt: nowMs }, { merge: true });
    lukket += 1;
  }
  if (lukket) await batch.commit();
  return { lukket };
}

module.exports = { statusSamler, meldAlarm, loesDriftAlarmer, vaerste };
