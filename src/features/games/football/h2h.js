/**
 * h2h.js — det indbyrdes opgør mellem to spillere.
 *
 * REN BEREGNING, ingen Firebase og ingen React: hele reglen for "hvem fik ret,
 * da I var uenige" kan bevises uden at rendere noget.
 *
 * HVORFOR KUN UENIGHEDERNE ER INDHOLD: de kampe, hvor I tippede ens, siger
 * intet om jer to — I stod side om side og vandt eller tabte sammen. Kun dér,
 * hvor I valgte forskelligt, er der et opgør. Enigheden bliver derfor ét tal,
 * ikke en liste (Spilførers indvending mod at fylde fladen med den kedelige
 * halvdel af sandheden).
 *
 * BEGGE SIDER SKAL KOMME FRA SAMME KILDE — `players/{uid}/detalje/opdeling`.
 * Blandede man sit EGET levende tipssæt ind for den ene part, ville den side
 * også rumme kampe, der endnu ikke er afgjort, og uenigheds-tællingen ville
 * være skæv i ens egen favør. Serverens rækker indeholder pr. konstruktion kun
 * kampe, der er afgjort OG begyndt (pointOpdeling filtrerer på begge dele), så
 * to sådanne dokumenter er symmetriske og direkte sammenlignelige.
 *
 * MÅL VALG, IKKE EVNE: her opgøres ikke træfprocent. To spillere i en
 * vennekreds ligger typisk få procentpoint fra hinanden over en sæson, og det
 * tal ville mest af alt vise, at efteråret var tilfældigt. Et indbyrdes opgør
 * i de kampe, hvor man faktisk valgte forskelligt, er derimod en historie.
 */

/** Har spilleren et brugbart 1X2-valg på kampen? */
function pickAf(raekker, matchId) {
  const p = raekker?.[matchId]?.pick;
  return p === '1' || p === 'X' || p === '2' ? p : null;
}

/**
 * Byg det indbyrdes opgør.
 *
 * @param {object} o
 * @param {Array<{round:number, matches:Array}>} o.rounds  runder FRA ligaens
 *   startrunde (kalderen har allerede kørt fraStartRunde — gaten hører til ét
 *   sted, og det er ikke her).
 * @param {object} o.mine    detalje/opdeling for MIG (matchId → række)
 * @param {object} o.deres   detalje/opdeling for MODPARTEN
 * @returns {{enige:number, uenige:Array, mig:number, dem:number, ingen:number,
 *            kunMig:number, kunDem:number, afgjorteSammen:number}}
 */
export function bygIndbyrdes({ rounds, mine, deres }) {
  const uenige = [];
  let enige = 0;
  let mig = 0;
  let dem = 0;
  let ingen = 0;
  let kunMig = 0;
  let kunDem = 0;

  for (const { round, matches } of rounds || []) {
    for (const m of matches || []) {
      const result = m.result ?? null;
      // Uden facit er der intet opgør. Rækkerne indeholder kun afgjorte kampe,
      // men `matches` er hele programmet — derfor vagten her.
      if (result == null || result === '') continue;

      const a = pickAf(mine, m.id);
      const b = pickAf(deres, m.id);
      // Tippede kun den ene, er det ikke en uenighed — ingen valgte imod nogen.
      // Det tælles for sig, så tallene summer op og ikke tavst forsvinder.
      if (!a && !b) continue;
      if (a && !b) { kunMig += 1; continue; }
      if (!a && b) { kunDem += 1; continue; }

      if (a === b) { enige += 1; continue; }

      const minRet = a === result;
      const deresRet = b === result;
      if (minRet) mig += 1;
      else if (deresRet) dem += 1;
      else ingen += 1;

      uenige.push({
        id: m.id,
        round,
        home: m.home,
        away: m.away,
        kickoff: m.kickoff,
        result,
        minPick: a,
        deresPick: b,
        minRet,
        deresRet,
        // Point pr. kamp tages fra serverens rækker — fladen regner ikke selv
        // scoring. Er feltet der ikke, er 0 det ærlige svar.
        minPoint: Number(mine?.[m.id]?.points) || 0,
        deresPoint: Number(deres?.[m.id]?.points) || 0,
      });
    }
  }

  // Nyeste først: det, der lige er sket, er dét, man taler om.
  uenige.sort((x, y) => (y.round - x.round) || ((y.kickoff ?? 0) - (x.kickoff ?? 0)));

  return {
    enige,
    uenige,
    mig,
    dem,
    ingen,
    kunMig,
    kunDem,
    // Kampe, hvor BEGGE tippede — grundlaget, procenter skulle regnes af, hvis
    // nogen senere vil. enige + uenige.length, udregnet ét sted.
    afgjorteSammen: enige + uenige.length,
  };
}

/**
 * Én linje, der kan læses højt. Bevidst uden procenter: et opgør er 5-3, ikke
 * 62,5 %.
 * @returns {string}
 */
export function indbyrdesLinje({ mig, dem, uenige }, dueNavn) {
  const n = uenige?.length ?? 0;
  if (!n) return `I har endnu ikke været uenige om en afgjort kamp.`;
  const kampe = n === 1 ? 'én kamp' : `${n} kampe`;
  if (mig > dem) return `I har været uenige om ${kampe}. Du fører ${mig}-${dem}.`;
  if (dem > mig) return `I har været uenige om ${kampe}. ${dueNavn} fører ${dem}-${mig}.`;
  return `I har været uenige om ${kampe}. Det står ${mig}-${dem}.`;
}
