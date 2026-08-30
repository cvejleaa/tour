/**
 * Rundens vildeste — den kamp, hvor resultatet og målchancerne var mest uenige.
 *
 * OM EN KAMP, ALDRIG OM EN PERSON. Spilførers diagnose af de to første
 * xG-flader var, at de er korrekte og kedelige, fordi de handler om AGF, og
 * ingen i vennekredsen er AGF. Alt i dette spil, der har skabt snak, handler
 * om et menneske eller en beslutning. Men et hold må gerne hånes, en ven må
 * ikke — så dristigheden hører hjemme på holdniveau, hvor den ikke koster
 * nogen ære.
 *
 * INGEN DOM, HELLER IKKE HER. Kortet siger, hvad der skete: resultatet og
 * chancerne, side om side. Læseren siger selv "de blev røvet". Sagde APPEN
 * det, holdt det op med at være drilleri og blev en klage med app-dækning —
 * og så ville det næste skridt være et alibi, spillerne kunne pege på, når
 * point manglede. Point følger facit, aldrig xG.
 *
 * PLACERING ER EN REGEL, IKKE EN SMAGSSAG: kortet må ALDRIG stå i samme kort
 * eller række som rundepoint, stillingen eller Chancen. Facit-blokken bærer
 * "Du er nr. X · N point", så dette er et selvstændigt kort ved siden af.
 * Alibiet er ufarligt, så længe det ikke kan pege på en placering.
 */

/**
 * Hvor stort skal gabet være, før en kamp er "vild"?
 *
 * MÅLT, IKKE VALGT. scripts/maal-xg.mjs' gab-fordeling over 39 afgjorte kampe
 * med xG i de to spil (målt 30. august 2026):
 *
 *   tærskel 0,5 →  8 kampe (21 %) ≈ 1,3 pr. runde — inventar, ikke begivenhed
 *   tærskel 1,0 →  3 kampe  (8 %) ≈ 0,5 pr. runde — cirka hver anden runde
 *   tærskel 1,5 →  1 kamp   (3 %) ≈ 0,2 pr. runde — to gange på en sæson
 *
 * 1,0 rammer, hvor et kort er sjældent nok til at blive bemærket og hyppigt
 * nok til ikke at blive glemt. Bemærk også, at det STØRSTE gab i data er
 * 2,03 — Spilførers eksempel (0,4 mod 2,8, altså 2,4) findes ikke i vores
 * kampe, så en tærskel valgt efter det ville næsten aldrig fyre.
 */
export const VILDESTE_GAB = 1.0;

const tal = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Rundens mest uenige kamp — eller null, hvis ingen når over gabet.
 *
 * Kun AFGJORTE kampe: en uafgjort har ingen vinder, og "taberens chancer minus
 * vinderens" er da meningsløs. Det er samme skel, målingen bruger.
 *
 * @param {Array<object>} matches  spillets kampe
 * @param {number} runde
 * @returns {{matchId:string, home:string, away:string, homeGoals:number,
 *            awayGoals:number, xgHome:number, xgAway:number, gab:number}|null}
 */
export function rundensVildeste(matches, runde) {
  if (!Array.isArray(matches) || !Number.isFinite(Number(runde))) return null;
  let bedst = null;
  for (const m of matches) {
    if (Number(m?.round) !== Number(runde)) continue;
    const hg = tal(m?.homeGoals);
    const ag = tal(m?.awayGoals);
    const xh = tal(m?.xgHome);
    const xa = tal(m?.xgAway);
    if (hg === null || ag === null || xh === null || xa === null) continue;
    if (hg === ag) continue;
    const hjemmeVandt = hg > ag;
    const gab = Math.round(((hjemmeVandt ? xa : xh) - (hjemmeVandt ? xh : xa)) * 100) / 100;
    if (gab < VILDESTE_GAB) continue;
    if (!bedst || gab > bedst.gab) {
      bedst = {
        matchId: m.id, home: m.home, away: m.away, homeGoals: hg, awayGoals: ag, xgHome: xh, xgAway: xa, gab,
      };
    }
  }
  return bedst;
}
