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

/**
 * ALARM-TYPERNE — titel og hast ét sted, så mailen (postbud.js) og kortet
 * (AlarmKort) siger det samme om den samme hændelse. Titlen skrives på
 * dokumentet som `titel` ved hver melding; gamle dokumenter uden feltet
 * falder tilbage på typen i fladen.
 *
 * hast styrer rækkefølgen og emnet i alarm-mailen (QC på planen):
 *   haster    – ejeren skal handle før næste kampstart
 *   idag      – kan vente til i dag (point afregnes ikke, ingen har fordel)
 *   udvikler  – intet ejeren kan gøre; sendes videre til udvikleren
 *   test      – test-alarmen; mailes med [TEST] i emnet og tæller ikke som fund
 * En ukendt type (nyt maskineri, der glemte at melde sig her) får titel = typen
 * og hast 'andet' — den FORSVINDER ikke, den står bare sidst.
 */
const ALARM_TYPER = {
  strandet: { titel: 'Kamp mangler facit', hast: 'idag' },
  genaabning: { titel: 'Afvist genåbning af en kamp', hast: 'idag' },
  kickoff48t: { titel: 'Kamp flyttet til under 48 timer', hast: 'haster' },
  mangler: { titel: 'Kamp mangler som dokument i spillet', hast: 'haster' },
  puljeLockGenaabning: { titel: 'Pulje-deadlinen sidder fast', hast: 'haster' },
  livetavs: { titel: 'Live-stillingen står stille', hast: 'haster' },
  detaljerLukket: { titel: 'Kilden har lukket os ude', hast: 'udvikler' },
  detaljerKobling: { titel: 'Live-kortlægningen er død', hast: 'udvikler' },
  detaljerAfvist: { titel: 'Kilden har skiftet form', hast: 'udvikler' },
  // De to kørsels-alarmer fra postbudet er skilt ad (QC på koden): en
  // FORSINKET kørsel er en død scheduler og må gerne nage (kvittering), en
  // kørsel, der FEJLEDE, er en selvlukkende tilstand ved siden af den
  // specifikke alarm (strandet, detaljer*, mangler), der oftest er årsagen —
  // og må hverken dubleres eller kunne genåbnes af en kvittering. Begge er
  // «i dag», ikke «haster» (Spilfører): en enkelt forsinkelse om natten, som
  // ejeren intet kan gøre ved, er den alarm, der lærer ham at ignorere ordet.
  koersel: { titel: 'En kørsel er forsinket', hast: 'idag' },
  koerselFejl: { titel: 'En kørsel fejlede', hast: 'idag' },
  postbud: { titel: 'Alarm-mailen kunne ikke sendes', hast: 'haster' },
  test: { titel: 'Test-alarm', hast: 'test' },
};
function alarmTitel(type) { return ALARM_TYPER[type]?.titel || String(type || 'Alarm'); }
function alarmHast(type) { return ALARM_TYPER[type]?.hast || 'andet'; }

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
    // advarsel/fejl tager OGSÅ tal: en linje om delvist nedbrud bærer
    // {sent, fejlede, …}, og netop dér er tallene mest værd. Uden dette
    // argument tabtes de tavst for alt andet end 'ok' (Security-fund).
    advarsel(besked, tal) {
      s.niveau = vaerste(s.niveau, 'advarsel');
      s.linjer.push(`⚠ ${besked}`);
      Object.assign(s.tal, tal || {});
    },
    fejl(besked, tal) {
      s.niveau = vaerste(s.niveau, 'fejl');
      s.linjer.push(`✖ ${besked}`);
      Object.assign(s.tal, tal || {});
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
async function meldAlarm(db, FieldValue, {
  type, gameId, kampId = null, besked, kraeverKvittering = false, nowMs = Date.now(),
  daempMs = 6 * 3600 * 1000, tvingMail = false,
}) {
  const id = [gameId, kampId, type].filter(Boolean).join('_');
  const ref = db.collection('driftAlarmer').doc(id);
  const cur = await ref.get();
  const d = cur.exists ? cur.data() : null;
  // Dæmpning: en ÅBEN alarm, der er set for nylig, genskrives ikke — ved et
  // langvarigt kilde-nedbrud ville 180 strandede kampe ellers koste ~4.300
  // operationer i døgnet (Security-målt). antal bliver "mindst", ikke
  // eksakt; genåbning (loestAt sat) dæmpes ALDRIG.
  if (d && d.loestAt == null && nowMs - (d.sidstSetAt || 0) < daempMs) return;
  const doc = {
    type,
    gameId,
    kampId,
    besked,
    titel: alarmTitel(type),
    kraeverKvittering,
    antal: (d?.antal || 0) + 1,
    foersteSetAt: d?.foersteSetAt ?? nowMs,
    sidstSetAt: nowMs,
    // Genåbning: alarmen er aktuel igen, uanset hvad der før var løst/set.
    loestAt: null,
    kvitteretAt: null,
  };
  // MAILETAT NULSTILLES VED HVER OVERGANG, DER KRÆVER OPMÆRKSOMHED IGEN: en ny
  // alarm, en genåbning efter løsning, ELLER en ny forekomst efter kvittering
  // (QC + Security på planen: alarmer med kvitteringskrav får aldrig loestAt,
  // så "kun ved genåbning" ville gøre dem tavse for evigt efter første
  // kvittering). En åben, ukvitteret gentagelse (ikke dæmpet — fx daempMs 0)
  // er allerede mailet: feltet UDELADES, så merge bevarer det. Skrives
  // eksplicit som null og ikke blot udeladt ved oprettelse: postbudet
  // filtrerer i kode, men `== null` i en query matcher aldrig et felt, der
  // mangler, og den fælde skal ingen kommende læser falde i.
  // tvingMail: test-alarmen skal ALTID give en ny mail — også når den forrige
  // hverken blev kvitteret eller løst (QC: knappen lovede ellers en mail, der
  // aldrig kom, hvis man glemte at kvittere sidst).
  if (tvingMail || !d || d.loestAt != null || d.kvitteretAt != null) doc.mailetAt = null;
  await ref.set(doc, { merge: true });
}

/**
 * Felterne, en kvittering skriver. Ren funktion, så reglen «en TEST-alarm
 * lukkes også (loestAt), ægte alarmer bliver stående» kan testes — index.js
 * kan ikke. En test-alarm er færdig, når den er set; så forsvinder den fra
 * fladen, og «Send en test-alarm» kan bruges igen.
 */
function kvitteringFor(type, uid, nowMs = Date.now()) {
  const felter = { kvitteretAt: nowMs, kvitteretAf: uid };
  if (type === 'test') felter.loestAt = nowMs;
  return felter;
}

/**
 * Luk alarmer af én type på tværs af spil — postbudets kørsels-alarmer
 * (`koersel`) bærer kortets id som kampId og kan have gameId null (globale
 * kørsler), så loesDriftAlarmers gameId-filter passer ikke. Samme regel: ses
 * problemet ikke længere (id'et er ikke i `aktuelleKampIds`), er det løst.
 */
async function loesAlarmerAfType(db, FieldValue, { type, aktuelleKampIds, nowMs = Date.now() }) {
  const snap = await db.collection('driftAlarmer')
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

/**
 * Hvornår skal næste skemalagte kørsel SENEST have skrevet status?
 * Finder første vægur-tidspunkt hh:{minut} i {tz}, hvor hh er i `timer`,
 * og lægger slækket oven i. Minut-for-minut-skanning med Intl: DST håndteres
 * af tidszonedatabasen, ikke af vores aritmetik — ved forårs-springet findes
 * kl. 02 ikke (og cron'en fyrer heller ikke), ved efterårs-tilbagefaldet
 * rammes den FØRSTE af de to 02:25-forekomster (deterministisk; cron'en
 * fyrer også kun én af dem). Bor her og ikke i index.js, fordi kadencen er
 * dét, "forsinket"-dommen hviler på — den skal kunne bevises med tests.
 * SKAL følges ad med cron-udtrykket på den kørsel, den beskriver.
 */
function naesteKoerselFoerMs(nowMs, { timer, minut = 25, slaekMin = 45, tz = 'Europe/Copenhagen' } = {}) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit',
  });
  for (let m = 1; m <= 36 * 60; m += 1) {
    const t = nowMs + m * 60000;
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    if (Number(p.minute) === minut && timer.includes(Number(p.hour) % 24)) {
      return t + slaekMin * 60000;
    }
  }
  // Kan ikke ske med en ikke-tom timer-liste — men et bundet fallback er
  // bedre end en evig løkke i en scheduled function.
  return nowMs + 36 * 3600 * 1000;
}

/**
 * Beskeden på en strandet-alarm — udskilt som ren funktion, så REMEDIET kan
 * testes på indhold (index.js kan ikke unit-testes). Teksten navngiver knappen
 * og fanen; omdøbes de, skal testen i driftlog.test.js rettes I SAMME PR —
 * det er tripwiren mod, at alarmen sender ejeren efter en flade, der ikke
 * findes. Og fordi sweep'et, der rejser alarmen, netop selv HAR skannet hele
 * sæsonen, vil knappen som regel svare "intet manglede" — derfor står
 * hånd-vejen også i teksten.
 * @param {string} kampId
 * @returns {string}
 */
function strandetBesked(kampId) {
  return `Kampen ${kampId} mangler facit længe efter kickoff — point er ikke afregnet. `
    + 'Kør ⬇️ Synk resultater nu (Admin → 🗓️ Spil-tidsplan); finder den intet, har kilden ikke facit endnu — sæt det i hånden (admin-guiden → Resultater).';
}

module.exports = {
  statusSamler, meldAlarm, loesDriftAlarmer, loesAlarmerAfType, kvitteringFor, vaerste, naesteKoerselFoerMs,
  strandetBesked, ALARM_TYPER, alarmTitel, alarmHast,
};
