// src/lib/startGate.js — HVOR ET SPIL BEGYNDER.
//
// SPEJLET FIL: functions-platform/startGate.js skal følges ad (CLAUDE.md), og
// pariteten er testdækket i startGate.test.js.
//
// GATEN VAR EN DATO, OG DET ER FORKERT AF ÉN GRUND: en runde er ikke et
// tidsrum. Superligaens runde 3 spilles 7.-10. august — bortset fra AGF-FCM og
// FCK-FCN, som ligger 2.-3. september, altså efter hele runde 4, 5 og 6. En
// dato-gate midt i det spænd tager de to kampe med og lader resten af runden
// ligge. Tre ting følger af det, og de er alle målt:
//
//   1. De to kampe giver point i et spil, der ellers starter senere.
//   2. Combi-kuponen bygges af det, der er tilbage. `roundComboBonus` er
//      uafhængig af kuponens størrelse, så der udbetales en helt normal
//      to-kamps-combi på en halv runde.
//   3. `combiSettled === combiCount` gør runden "afgjort", `snapshotRoundRanks`
//      fyrer, og Runde-Botten poster et opslag om "runde 3" i september på
//      grundlag af to kampe.
//
// Ingen af delene er ment. `iVindue`/`rundensUge` i pointOpdeling.js er skrevet
// om udsatte kampe INDEN FOR en hel runde og forudsætter, at runden er hel.
//
// En rundegate fjerner alle tre ved konstruktion: hele runder holdes eller
// fjernes, aldrig halve. Beslutningen ligger her, ét sted, fordi den før lå ni
// steder — fire i gameScoring, to i reminders, én i gameRecap, én i
// footballRounds og én i admin-fladen.
//
// DET ER IKKE EN HASTESAG. Superligaen står i dag med startAt 15:59 UTC den
// 1. august, og første kamp i runde 2 er 16:00 UTC — ét minut efter. Ingen
// runde er skåret over lige nu. Det er muligheden, der lukkes, ikke en brand.

import { kickoffMs } from './pointOpdeling.js';

/**
 * Ligger kampen FØR spillets start?
 *
 * EN KAMP UDEN RUNDENUMMER GATES ALDRIG. Det er et valg, ikke en forglemmelse:
 * `null < 3` er `true` i JavaScript og `undefined < 3` er `false`, så en naiv
 * sammenligning ville give to forskellige svar på det samme spørgsmål. Og
 * `buildRoundContext` tager netop kampe uden runde med i `byMatch`, for at de
 * ikke stille skal miste deres point. Gaten følger den beslutning.
 *
 * @param {{round?: number|null}} match
 * @param {number|null} startRunde
 */
export function foerStart(match, startRunde) {
  if (!Number.isFinite(startRunde)) return false;
  const r = match?.round;
  if (!Number.isFinite(r)) return false;
  return r < startRunde;
}

/**
 * Match-id'er for kampe før startrunden. De tæller ikke med i pointgivningen.
 * @returns {Set<string>}
 */
export function gatedeKampe(matches, startRunde) {
  const ud = new Set();
  if (!Number.isFinite(startRunde)) return ud;
  for (const m of matches || []) if (foerStart(m, startRunde)) ud.add(m.id);
  return ud;
}

/** Kampene fra startrunden og frem — det, spilleren ser og tipper. */
export function fraStartRunde(matches, startRunde) {
  if (!Number.isFinite(startRunde)) return matches || [];
  return (matches || []).filter((m) => !foerStart(m, startRunde));
}

/**
 * Hvilken runde svarer et starttidspunkt til?
 *
 * Den FØRSTE runde, hvis TIDLIGSTE kickoff ligger på eller efter tidspunktet.
 * Reglen er valgt, fordi den er den eneste, der ikke kan efterlade en halv
 * runde: enten er hele runden med, eller også er den ikke.
 *
 * Bruges to steder, og det er med vilje det samme regnestykke: til at migrere
 * et gammelt `startAt` til et `startRound`, og som fallback for et spil, der
 * endnu ikke er migreret. Var de to forskellige, ville migreringen kunne flytte
 * gaten uden at nogen havde bedt om det.
 *
 * @returns {number|null} rundenummer, eller null hvis intet tidspunkt/ingen runder
 */
export function rundeForTidspunkt(matches, startMs) {
  if (startMs == null) return null;
  const tidligste = new Map();
  for (const m of matches || []) {
    if (!Number.isFinite(m?.round)) continue;
    const k = kickoffMs(m);
    if (k == null) continue;
    const nu = tidligste.get(m.round);
    if (nu == null || k < nu) tidligste.set(m.round, k);
  }
  const runder = [...tidligste.entries()].sort((a, b) => a[0] - b[0]);
  for (const [runde, k] of runder) if (k >= startMs) return runde;
  // Alle runder ligger før tidspunktet: spillet er gatet helt. Sidste runde + 1
  // frem for null — null ville betyde "ingen gate" og lukke alt OP i stedet.
  return runder.length ? runder[runder.length - 1][0] + 1 : null;
}

/**
 * Spillets startrunde. `startRound` vinder; ellers udledes den af det gamle
 * `startAt`, så et spil, der endnu ikke er migreret, gater præcis som før.
 *
 * ÉN VAGT, IKKE TO. Fallbacken er ikke en anden regel, men den samme regel
 * anvendt på en anden kilde — og den forsvinder, når `startAt` er ude af
 * datamodellen. Ligger begge felter, er `startRound` autoritativt.
 */
export function startRundeFor(game, matches) {
  if (Number.isFinite(game?.startRound)) return game.startRound;
  const startMs = kickoffMs({ kickoff: game?.startAt });
  return rundeForTidspunkt(matches, startMs);
}
