'use strict';
// functions-platform/puljeFacit.js — HVORNÅR PULJEN ER AFGJORT (CommonJS).
//
// SPEJL af src/lib/puljeFacit.js. De to filer skal følges ad (CLAUDE.md), og
// pariteten er testdækket i puljeFacit.test.js. Serveren bruger den i
// settlePuljeBets; klienten i PuljeTip og under Spil-tidsplan.
//
// ÉT PRÆDIKAT, TO ENDER. Serveren afregner puljen (settlePuljeBets), og fladen
// viser facit-kortet (PuljeTip). Spørger de hver sit, kan fladen vise et facit,
// serveren aldrig har afregnet — eller serveren afregne, mens fladen stadig
// siger "intet er afgjort". Derfor bor spørgsmålet "må puljen afgøres nu?"
// HER, og begge ender kalder `puljeKanAfregnes`.
//
// TO SLAGS PULJE.
//   En LIGA-pulje (Superligaen, Premier League) afgøres af slutstillingen, og
//   den kendes først, når hver eneste kamp har mål: `alleKampeSpillet`.
//
//   En RUNDE-pulje (`facitKilde: 'runde'`, fx "semifinalisterne") afgøres af,
//   HVILKE hold der står i en bestemt fases kampe. Her er "alle kampe har mål"
//   det FORKERTE kriterium, og det fejler begge veje: efter kvartfinalerne
//   har alle OPRETTEDE kampe mål, før semifinalerne er lagt ind (for tidligt,
//   og facit ville blive en tabel over hele turneringen) — og når
//   semifinalerne er oprettet, mangler de mål til efter finalen (for sent).
//   Kriteriet er i stedet, at facit-fasen findes i kalenderen (`game.faser`)
//   med `antalKampe`, og at netop så mange kampe ligger i fasens runder med
//   begge hold kendt. En halvt lagt fase giver intet facit.

const { harFaseKalender, faseFor, fmtFaseStart } = require('./faser');
const { puljeKonfig } = require('./superligaScoring');

/** Har HVER kamp mål? Liga-puljens kriterium (og kun dens). */
function alleKampeSpillet(matches) {
  const goalOf = (g) => (g == null || g === '' ? NaN : Number(g));
  return (matches || []).length > 0 && matches.every(
    (m) => Number.isFinite(goalOf(m.homeGoals)) && Number.isFinite(goalOf(m.awayGoals)),
  );
}

/**
 * Fasen, en runde-pulje afgøres af, slået op på NAVN i kalenderen.
 * Præcis én fase med navnet — to med samme navn er en tastefejl, og så hellere
 * intet facit end et gæt. null uden gyldig kalender.
 * @returns {object|null} samme form som faseFor (dag = 1)
 */
function facitFase(game, navn) {
  if (!harFaseKalender(game) || typeof navn !== 'string' || !navn.trim()) return null;
  const hits = game.faser.filter((f) => f.navn === navn.trim());
  if (hits.length !== 1) return null;
  return faseFor(game, hits[0].fra);
}

/** Holdnavnet, trimmet — eller '' for alt, der ikke er et navn. */
function holdNavn(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Holdene i fasens kampe, eller null, når fasen ikke er HELT lagt ind:
 * kalenderen kender ikke fasen, fasen har intet `antalKampe`, der ligger et
 * andet antal kampe i dens runder, et hold mangler, eller et hold står to
 * gange. Rækkefølgen er kampenes.
 * @returns {string[]|null}
 */
function faseHold(game, matches, navn) {
  const fase = facitFase(game, navn);
  if (!fase || !fase.antalKampe) return null;
  const kampe = (matches || []).filter((m) => {
    const r = Number(m?.round);
    return Number.isInteger(r) && r >= fase.fra && r <= fase.til;
  });
  if (kampe.length !== fase.antalKampe) return null;
  const hold = [];
  for (const m of kampe) {
    const hjemme = holdNavn(m.home);
    const ude = holdNavn(m.away);
    if (!hjemme || !ude) return null;
    hold.push(hjemme, ude);
  }
  if (new Set(hold).size !== hold.length) return null;
  return hold;
}

/**
 * Facit for en runde-pulje: holdene i facit-fasen. null for alle andre
 * puljer (de har deres egen facit-kilde) og for en fase, der ikke er klar.
 * @param {object|null} konfig  puljeKonfig(game)
 */
function rundeFacit(konfig, game, matches) {
  if (konfig?.facitKilde !== 'runde') return null;
  return faseHold(game, matches, konfig.facitFase);
}

/**
 * DET ÉNE PRÆDIKAT: må puljen afgøres nu? Serveren afregner kun, når det er
 * sandt, og fladen viser kun facit, når det er sandt.
 * Uden konfiguration (spillet har ingen pulje) gælder liga-kriteriet — så
 * svarer serveren præcis som før for et spil uden pulje.
 */
function puljeKanAfregnes(konfig, game, matches) {
  if (konfig?.facitKilde === 'runde') return rundeFacit(konfig, game, matches) != null;
  return alleKampeSpillet(matches);
}

/**
 * Hvad er der galt med en runde-pulje? Tom liste = intet (også for alle andre
 * puljer og for et spil uden pulje). En fejl her betyder, at puljen ALDRIG
 * kan afgøres — og det ville ingen opdage før semifinalerne. Derfor tjekkes
 * den før seed (scripts/games.test.mjs) og vises under Spil-tidsplan.
 * @returns {string[]}
 */
function puljeKonfigFejl(game) {
  const p = game?.pulje;
  if (!p || p.facitKilde !== 'runde') return [];
  const fejl = [];
  const navn = typeof p.facitFase === 'string' ? p.facitFase.trim() : '';
  if (!navn) return ['facitFase mangler — puljen ved ikke, hvilken fase der afgør den'];
  if (!harFaseKalender(game)) return [`spillet har ingen gyldig fasekalender, så fasen «${navn}» kan ikke slås op`];
  const antal = game.faser.filter((f) => f.navn === navn).length;
  if (antal === 0) return [`fasen «${navn}» findes ikke i kalenderen`];
  if (antal > 1) return [`fasen «${navn}» står ${antal} gange i kalenderen`];
  const fase = facitFase(game, navn);
  if (!fase.antalKampe) {
    fejl.push(`fasen «${navn}» har intet antalKampe, så det kan ikke afgøres, hvornår den er lagt ind`);
  } else if (puljeKonfig(game).poolSize !== 2 * fase.antalKampe) {
    // poolSize gennem normalizeren: et manglende felt er 6 dér, og det er
    // det tal, fladen beder spilleren om.
    fejl.push(`puljen beder om ${puljeKonfig(game).poolSize} hold, men «${navn}» har ${2 * fase.antalKampe} (${fase.antalKampe} kampe)`);
  }
  // Rå værdi, ikke normalizerens: den sætter nedSize til 0 for en runde-pulje,
  // og så ville en bund, nogen HAVDE skrevet ind, forsvinde uden et ord.
  if (Number(p.nedSize) > 0) fejl.push('en runde-pulje har intet bundspørgsmål (nedSize skal være 0)');
  return fejl;
}

const ANTAL_ORD = ['nul', 'ét', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti'];

/** "fire" for 4 — tallet med bogstaver op til ti, ellers cifre. */
function antalOrd(n) {
  return Number.isInteger(n) && n >= 0 && n < ANTAL_ORD.length ? ANTAL_ORD[n] : String(n);
}

/**
 * Teksterne for en RUNDE-pulje ("hvem når semifinalerne?"), afledt af
 * KALENDEREN — fasens bestemte form og dens startdato står ét sted
 * (game.faser), og en kopi i puljens labels ville drive fra den.
 * null for alle andre puljer: så bruger fladen sine liga-tekster uændret.
 *
 *   spoergsmaal  "Hvilke fire hold når semifinalerne?"
 *   afgoeres     "Puljen afgøres, når semifinalerne er lagt ind — de spilles fredag 29. januar."
 *
 * Er fasen ikke i kalenderen (en konfigurationsfejl, som Spil-tidsplan
 * melder), lover teksten ingen dato.
 */
function rundePuljeTekster(game, konfig) {
  if (konfig?.facitKilde !== 'runde') return null;
  const fase = facitFase(game, konfig.facitFase);
  const ord = konfig.labels.top;
  const dato = fase ? fmtFaseStart(fase.start) : '';
  return {
    spoergsmaal: `Hvilke ${antalOrd(konfig.poolSize)} hold når ${ord}?`,
    afgoeres: dato
      ? `Puljen afgøres, når ${ord} er lagt ind — de spilles ${fase.dage > 1 ? 'fra ' : ''}${dato}.`
      : `Puljen afgøres, når ${ord} er lagt ind.`,
  };
}

module.exports = {
  alleKampeSpillet, facitFase, faseHold, rundeFacit, puljeKanAfregnes, puljeKonfigFejl, rundePuljeTekster,
};
