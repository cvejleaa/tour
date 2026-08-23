// ---------------------------------------------------------------------------
// scripts/lib/doubleChance.mjs — findes ÉN gang, bruges af to scripts.
//
// audit-double-chance.mjs (læs-only) og fix-double-chance.mjs (retter) skal
// være enige om, hvad en dobbelt-chance ER, og om hvilken af dem der er den
// FØRSTE. Var reglen skrevet to steder, kunne auditen rapportere én kamp og
// rettelsen nulstille en anden — og ingen af dem ville være røde.
//
// Rundenummeret læses fra kampens EGET dokument (match.round), aldrig af en
// dato: en udsat kamp beholder sin runde.
// ---------------------------------------------------------------------------

/** Kickoff i ms — Timestamp, tal eller streng. */
export function kickoffMs(m) {
  const k = m && m.kickoff;
  if (k == null) return null;
  if (typeof k === 'number') return Number.isFinite(k) ? k : null;
  if (typeof k === 'string') { const n = Date.parse(k); return Number.isNaN(n) ? null : n; }
  if (typeof k.toMillis === 'function') return k.toMillis();
  if (k.seconds != null) return k.seconds * 1000;
  return null;
}

/** Dansk dato-tid, så output kan sammenholdes med kampprogrammet. */
export const dk = (ms) => new Date(ms).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' });

/** Menneskelæselig varighed. */
export function minutter(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 90) return `${m} min`;
  const t = Math.floor(m / 60);
  return t < 48 ? `${t} t ${m % 60} min` : `${Math.floor(t / 24)} d ${t % 24} t`;
}

/**
 * HVORNÅR BLEV CHANCEN LAGT? Ét sted, fordi rækkefølgen afgør, hvilken chance
 * der beholdes ved en rettelse.
 *
 * `chanceSatAt` er sandheden — det felt skrives af serverens chanceVagt, netop
 * fordi `updatedAt` er det SENESTE skriv og rykker med, hvis spilleren bagefter
 * retter sit 1X2-valg. Feltet findes først på tips lagt EFTER trin 2 er rullet
 * ud, så for historikken falder vi tilbage på `updatedAt`.
 *
 * Tilbagefaldet er ikke et gæt i blinde: reglerne afviser enhver skrivning på
 * et tip efter dets EGEN kamps kickoff, så `updatedAt < eget kickoff` er
 * garanteret. Er chance nr. 2 skrevet efter chance nr. 1's kamp gik i gang, er
 * rækkefølgen bevist — den første kunne ikke fjernes.
 *
 * @returns {{ms:number|null, kilde:'chanceSatAt'|'updatedAt'|'ukendt'}}
 */
export function lagtTidspunkt(bet) {
  const satAt = Number(bet?.chanceSatAt);
  if (Number.isFinite(satAt)) return { ms: satAt, kilde: 'chanceSatAt' };
  const upd = bet?.updatedAt?.toMillis?.();
  if (Number.isFinite(upd)) return { ms: upd, kilde: 'updatedAt' };
  return { ms: null, kilde: 'ukendt' };
}

/**
 * Find alle runder, hvor samme spiller har brugt Chancen mere end én gang.
 *
 * @param {object} o
 * @param {Array<{id:string,data:object}>} o.bets
 * @param {Array<{id:string,data:object}>} o.matches
 * @param {Map<string,string>} o.navne  uid → viste navn
 * @returns {Array<{uid:string, navn:string, runde:any, chancer:Array<object>}>}
 *   `chancer` er sorteret ÆLDST FØRST — den første i listen er den, en
 *   rettelse beholder.
 */
export function findDobbelteChancer({ bets, matches, navne }) {
  const kampAf = new Map(matches.map((m) => [m.id, m.data]));
  const brugt = new Map(); // uid|runde → chancer

  for (const b of bets) {
    const d = b.data;
    const stake = Number(d.chanceStake) || 0;
    if (stake <= 0) continue;
    const kamp = kampAf.get(d.matchId);
    // Kamp uden dokument har ingen runde at gruppere på — fanges af andre tjek.
    // BEGGE halvdele bærer: uden round-tjekket ville to tips på kampe UDEN
    // round-felt blive grupperet sammen som "runde undefined" og meldt som en
    // falsk dobbelt-chance.
    if (!kamp || kamp.round == null) continue;
    const noegle = `${d.uid}|${kamp.round}`;
    if (!brugt.has(noegle)) brugt.set(noegle, []);
    const lagt = lagtTidspunkt(d);
    brugt.get(noegle).push({
      betId: b.id,
      uid: d.uid,
      matchId: d.matchId,
      kampNavn: `${kamp.home ?? '?'}–${kamp.away ?? '?'}`,
      kickoffMs: kickoffMs(kamp),
      lagtMs: lagt.ms,
      lagtKilde: lagt.kilde,
      stake,
      points: Number(d.points) || 0,
      result: kamp.result ?? null,
      odds: kamp.odds ?? null,
    });
  }

  const ud = [];
  for (const [noegle, liste] of brugt) {
    if (liste.length < 2) continue;
    const [uid, runde] = noegle.split('|');
    ud.push({
      uid,
      navn: navne.get(uid) || uid,
      runde,
      // ÆLDST FØRST. Et manglende tidsstempel sorteres SIDST (Infinity), så en
      // chance, vi ikke kan datere, aldrig bliver "den første, vi beholder".
      chancer: [...liste].sort((a, b) => (a.lagtMs ?? Infinity) - (b.lagtMs ?? Infinity)),
    });
  }
  // Fast rækkefølge, så to kørsler kan sammenlignes linje for linje.
  return ud.sort((a, b) => (a.navn < b.navn ? -1 : a.navn > b.navn ? 1 : Number(a.runde) - Number(b.runde)));
}

/**
 * Den afgørende linje: blev en senere chance lagt, EFTER en tidligere chances
 * kamp var låst? Så var mekanismen i spil — den første kunne ikke fjernes.
 * @returns {{nr:number, efter:object, forsinkelseMs:number}|null}
 */
export function beviserMekanismen(chancer) {
  for (let i = 1; i < chancer.length; i += 1) {
    const nu = chancer[i];
    if (nu.lagtMs == null) continue;
    const foer = chancer.find((c) => c.kickoffMs != null && c.kickoffMs < nu.lagtMs);
    if (foer) return { nr: i + 1, efter: foer, forsinkelseMs: nu.lagtMs - foer.kickoffMs };
  }
  return null;
}

/**
 * Byg den FULDE rettelsesplan — ren funktion, så tørkørslens tal kan bevises
 * uden Firestore.
 *
 * HVORFOR DEN FINDES: totalen blev oprindeligt regnet inde i udskrivnings-
 * løkken ud fra spillerens oprindelige total, én gang pr. runde. Havde samme
 * spiller dobbelt-chance i TO runder i samme spil, viste begge TOTAL-linjer
 * derfor et tal, der ikke var slutstillingen — de akkumulerede ikke. Ejeren
 * ville have truffet sin ja/nej-beslutning på et tal, `--apply` aldrig ville
 * lande på. Selve skrivningen var korrekt (rescoreAllBets regner forfra), og
 * netop derfor kunne kløften ikke opdages ved at se på resultatet bagefter.
 *
 * `scoreBet` INJICERES i stedet for at blive importeret: modulet her er ESM i
 * scripts/, pointreglen er CommonJS i functions-platform/. Injektionen holder
 * modulet frit for den afhængighed OG lader testen regne med den ægte
 * funktion — der er ingen kopi af pointreglen nogen steder i scripts/.
 *
 * @param {object} o
 * @param {Array} o.fund              fra findDobbelteChancer
 * @param {Map<string,string>} o.pickAf   betId → 1X2-valg
 * @param {Map<string,number>} o.totalFoer uid → totalPoints før rettelsen
 * @param {Set<string>} [o.gatede]    matchId'er, hvis point IKKE genscores
 * @param {Function} o.scoreBet       (bet, result, odds) → point
 * @returns {{rettelser:Array, totaler:Map<string,{foer:number,efter:number,delta:number}>, advarsler:string[]}}
 */
export function byggRettelsesplan({ fund, pickAf, totalFoer, gatede = new Set(), scoreBet }) {
  const r1 = (n) => Math.round(n * 10) / 10;
  const totaler = new Map();
  const advarsler = [];
  const rettelser = [];

  for (const f of fund) {
    const [beholdes, ...senere] = f.chancer;
    const fjernes = senere.map((c) => {
      const pick = pickAf.get(c.betId);
      // Uden 1X2-valget kan point ikke regnes. Sig det højt frem for at
      // udskrive et tal, ingen kan stole på.
      if (!pick) {
        advarsler.push(`${f.navn}: tippet ${c.betId} mangler 1X2-valg — point kan ikke beregnes.`);
        return { ...c, nyPoint: null, delta: 0 };
      }
      // rescoreAllBets springer GATEDE kampe over (gameScoring.js:649), så
      // chanceStake ville blive nulstillet UDEN at pointet fulgte med.
      if (gatede.has(c.matchId)) {
        advarsler.push(`${f.navn}: ${c.kampNavn} er gated — rescoreAllBets rører den ikke, og pointet ville blive stående.`);
      }
      const nyPoint = r1(scoreBet({ pick, chanceStake: 0 }, c.result, c.odds));
      return { ...c, nyPoint, delta: r1(nyPoint - c.points) };
    });

    const deltaSum = r1(fjernes.reduce((s, c) => s + c.delta, 0));
    // AKKUMULÉR pr. spiller på tværs af runder: anden runde skal regne videre
    // fra første runde, ikke fra den oprindelige total.
    const foer = totaler.has(f.uid) ? totaler.get(f.uid).efter : (Number(totalFoer.get(f.uid)) || 0);
    const efter = r1(foer + deltaSum);
    totaler.set(f.uid, {
      foer: totaler.has(f.uid) ? totaler.get(f.uid).foer : foer,
      efter,
      delta: r1(efter - (totaler.has(f.uid) ? totaler.get(f.uid).foer : foer)),
    });
    rettelser.push({ ...f, beholdes, fjernes, deltaSum, totalEfterRunden: efter });
  }
  return { rettelser, totaler, advarsler };
}

/**
 * Hent spillernavne. Navnet bor på `users/{uid}.displayName` — IKKE på
 * spillets players-dokument. Auditen læste oprindeligt det forkerte sted og
 * udskrev derfor rå uid'er, hvor ejeren skulle kunne læse et navn.
 * Kilden er den samme som Runde-Bottens (gameRecap.js).
 */
export async function hentNavne(db, uids) {
  const unikke = [...new Set(uids.filter(Boolean))];
  if (!unikke.length) return new Map();
  const docs = await db.getAll(...unikke.map((u) => db.collection('users').doc(u)));
  return new Map(docs.filter((d) => d.exists).map((d) => [d.id, d.data().displayName || d.id]));
}
