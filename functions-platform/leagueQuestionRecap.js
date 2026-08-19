/**
 * leagueQuestionRecap — Runde-Botten afslører et LIGA-SPØRGSMÅL på ligaens
 * væg, når facit sættes (opgave #39).
 *
 * ÉT opslag pr. spørgsmål, ved FACIT — ikke ved deadline. Fladen viser
 * allerede alle svar i samme sekund, deadline passerer, og spørgsmålsrækken
 * står i samme kort som væggen — et deadline-opslag uden point ville gentage
 * naboen og mangle sin pointe (QC- og spilfører-fund på planen). Derfor er
 * der heller ingen skemalagt fejning: den aktive vej er triggeren på facit,
 * og den bevidste start er liga-ejerens knap (callable med tvingNy).
 *
 * Kun ÉN markør: q.botFacitAt, sat EFTER en vellykket post — et AI-udfald må
 * aldrig brænde afsløringen. Markøren er serverens felt (firestore.rules
 * afviser den på både create og update), ellers kunne liga-ejeren aflyse
 * afsløringen af sit eget spørgsmål ved selv at sætte den.
 */

const { rensTekst } = require('./rensTekst');
const { lqSettled, lqPoints, scoreLeagueQuestion } = require('./leagueQuestionScoring');
const { generateRecapText } = require('./gameRecap');

const LQ_RECAP_SYSTEM = `Du er "Runde-Botten" i et privat tippespil for en vennekreds.
Du afslører facit på ET af LIGAENS EGNE spørgsmål (liga-ejerens spørgsmål — ikke spillets pulje eller kampene). Du får fakta som JSON.

Form:
- Dansk, kort: 40-110 ord, ét afsnit eller to korte. Ingen overskrifter, ingen punktopstilling.
- Sig tydeligt hvad spørgsmålet var, hvad facit blev, og hvem der ramte.
- Brug KUN tallene i fakta ("point" pr. svar er færdigregnet) — du må ALDRIG selv regne, lægge sammen eller udlede placeringer.
- Nævn gerne et par af de forkerte svar med et glimt i øjet — kærligt drilleri, aldrig hån.
- Er "sov" ikke tom: én kort, godmodig bemærkning om at de ikke fik svaret — aldrig mere end én sætning, aldrig hånlig.
- Er "vindere" tom: konstatér varmt, at ingen ramte — uden at udpege nogen som dum.
- "et tidligere medlem" er en spiller, der har forladt ligaen — omtal dem præcis sådan, uden navn og uden drama.
- Find ALDRIG på svar, navne eller detaljer, der ikke står i fakta. Pointene tæller kun i ligaens interne stilling — nævn det ikke, medmindre det står i fakta.`;

/**
 * Skal DENNE skrivning udløse en afsløring? REN beslutning (mutationstestbar):
 * kun overgangen ikke-afgjort → afgjort tæller. Dermed er både bottens egen
 * markør-skrivning (facit uændret), en facit-RETTELSE (afgjort → afgjort) og
 * en sletning ufarlige — ingen løkker, ingen dobbeltopslag.
 */
function skalAfsloere(before, after) {
  if (!after) return false; // slettet
  return !lqSettled(before) && lqSettled(after);
}

/**
 * Byg AI-fakta for afsløringen. REN funktion.
 *
 * - svar er HELE svarsættet for spørgsmålet — også fra spillere, der siden har
 *   forladt ligaen. 'number'-scoringen er sæt-afhængig ("nærmest vinder"), og
 *   fladen scorer over alle læsbare svar; serveren skal nå samme vinder
 *   (QC-fund). Tidligere medlemmer navngives "et tidligere medlem" — navne
 *   kommer altid fra brugerkartoteket, aldrig fra svar-dokumentet.
 * - ALT brugerskrevet renses med rensTekst (navne, svar, label, facit).
 * - Under 2 svar fra NUVÆRENDE medlemmer → null (spilfører-vagt: et opslag om
 *   et spørgsmål, én person svarede på, er ikke en afsløring, det er spam).
 *
 * @param {{ligaNavn:string, spoergsmaal:object, svar:Array<{uid:string,answer:*}>,
 *          memberUids:Array<string>, brugere:Map<string,object>}} args
 */
function byggSpoergsmaalRecapFakta({ ligaNavn, spoergsmaal, svar, memberUids, brugere }) {
  if (!lqSettled(spoergsmaal)) return null;
  const medlemmer = new Set((memberUids || []).filter((u) => typeof u === 'string'));
  const alleSvar = (svar || []).filter((a) => a && typeof a.uid === 'string');
  if (alleSvar.filter((a) => medlemmer.has(a.uid)).length < 2) return null;

  const point = scoreLeagueQuestion(spoergsmaal, alleSvar);
  const navn = (uid) => (medlemmer.has(uid)
    ? rensTekst((brugere.get(uid) || {}).displayName)
    : 'et tidligere medlem');

  const svarListe = alleSvar.map((a) => ({
    navn: navn(a.uid),
    svar: rensTekst(a.answer, { max: 60, fallback: '(tomt svar)' }),
    point: point[a.uid] || 0,
  }));
  const harSvaret = new Set(alleSvar.map((a) => a.uid));

  return {
    liga: rensTekst(ligaNavn, { max: 60, fallback: 'ligaen' }),
    spoergsmaal: rensTekst(spoergsmaal.label, { max: 120, fallback: '(uden tekst)' }),
    facit: rensTekst(spoergsmaal.facit, { max: 60, fallback: '(ukendt)' }),
    point: lqPoints(spoergsmaal),
    svar: svarListe,
    vindere: svarListe.filter((s) => s.point > 0).map((s) => s.navn),
    ingenRamte: svarListe.every((s) => s.point === 0),
    sov: [...medlemmer].filter((u) => !harSvaret.has(u)).map((u) => navn(u)).sort(),
  };
}

/**
 * Generér og post afsløringen for ÉT spørgsmål. Idempotent via q.botFacitAt.
 * @param {object} db Admin-Firestore
 * @param {object} FieldValue
 * @param {object} anthropic klar klient (nøglen er tjekket af kalderen)
 * @param {{gameId:string, leagueId:string, questionId:string}} ids
 * @param {{dryRun?:boolean, tvingNy?:boolean}} [opts] tvingNy: post selv om
 *   markøren er sat (recovery — et forkert opslag kan kun slettes, aldrig
 *   erstattes, så genudsendelse skal være mulig med vilje).
 */
async function runLeagueQuestionRecap(db, FieldValue, anthropic, { gameId, leagueId, questionId }, { dryRun = true, tvingNy = false } = {}) {
  const gameRef = db.collection('games').doc(gameId);
  const leagueRef = gameRef.collection('leagues').doc(leagueId);
  const qRef = leagueRef.collection('questions').doc(questionId);
  const [gameSnap, leagueSnap, qSnap] = await Promise.all([gameRef.get(), leagueRef.get(), qRef.get()]);
  if (!gameSnap.exists) return { posted: 0, reason: 'no-game' };
  if (gameSnap.data().aiRecaps === false) return { posted: 0, reason: 'disabled' };
  if (!leagueSnap.exists) return { posted: 0, reason: 'no-league' };
  if (!qSnap.exists) return { posted: 0, reason: 'no-question' };
  const q = qSnap.data();
  if (!lqSettled(q)) return { posted: 0, reason: 'not-settled' };
  if (q.botFacitAt && !tvingNy) return { posted: 0, reason: 'already' };

  // HELE svarsættet for spørgsmålet — se byggSpoergsmaalRecapFakta.
  const svarSnap = await leagueRef.collection('questionAnswers')
    .where('questionId', '==', questionId).get();
  const svar = svarSnap.docs.map((d) => {
    const a = d.data();
    return { uid: a.uid, answer: a.answer };
  });

  const memberUids = (leagueSnap.data().memberUids || []).filter((u) => typeof u === 'string');
  const userDocs = memberUids.length
    ? await db.getAll(...memberUids.map((uid) => db.collection('users').doc(uid)))
    : [];
  const brugere = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));

  const fakta = byggSpoergsmaalRecapFakta({
    ligaNavn: leagueSnap.data().name || leagueId,
    spoergsmaal: q, svar, memberUids, brugere,
  });
  if (!fakta) return { posted: 0, reason: 'too-few-answers' };

  const text = await generateRecapText(anthropic, fakta, LQ_RECAP_SYSTEM);
  if (!text) return { posted: 0, reason: 'no-text' };
  if (dryRun) return { posted: 0, dryRun: true, text };

  await leagueRef.collection('messages').add({
    uid: 'runde-bot',
    displayName: 'Runde-Botten',
    avatarEmoji: '🤖',
    system: true,
    // Spørgsmåls-id PÅ beskeden — samme lektie som `round` på runde-opslaget:
    // uden feltet kan et opslag aldrig findes igen, hvis det skal tages ned.
    questionId,
    text,
    createdAt: FieldValue.serverTimestamp(),
  });
  // Markøren EFTER posten — fejler AI-kaldet eller skrivningen, står
  // spørgsmålet stadig som u-afsløret og kan forsøges igen.
  await qRef.update({ botFacitAt: FieldValue.serverTimestamp() });
  return { posted: 1 };
}

module.exports = {
  LQ_RECAP_SYSTEM, skalAfsloere, byggSpoergsmaalRecapFakta, runLeagueQuestionRecap,
};
