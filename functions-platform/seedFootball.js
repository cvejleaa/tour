// ---------------------------------------------------------------------------
// functions-platform/seedFootball.js — SPEJL af kickoff-beslutningerne i
// src/lib/seedFootball.js (kickoffMs + kickoffPlan), så den daglige
// kickoff-synk (syncKickoffsCore) træffer PRÆCIS samme beslutninger som den
// manuelle seed-vej (--kickoffs-only). Paritetstesten i seedFootball.test.js
// holder de to i trit — ret ALDRIG kun den ene.
//
// Beslutningerne er ikke pynt (begrundelserne står ordret i kilden):
//   - kickoff ER tip-deadlinen: tidszone-løse strenge og ulæselige datoer
//     afvises højlydt.
//   - en kamp med resultat røres aldrig.
//   - en tid, der står, kan aldrig RYDDES af en rutinekørsel.
//   - "findes ikke" tælles for sig — det er en alarm, ikke en fodnote.
// ---------------------------------------------------------------------------

/** Kickoff som millisekunder — eller null. Spejler src/lib/seedFootball.kickoffMs. */
function kickoffMs(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date || typeof v === 'number') {
    const t = new Date(v).getTime();
    if (Number.isNaN(t)) throw new Error(`kickoff kunne ikke læses som en dato: ${String(v)}`);
    return t;
  }
  const s = String(v).trim();
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    throw new Error(`kickoff mangler tidszone: "${s}" — ellers afhænger deadlinen af, hvor scriptet køres`);
  }
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) throw new Error(`kickoff kunne ikke læses som en dato: "${s}"`);
  return t;
}

/**
 * Hvilke kampe skal have ny kickoff? Spejler src/lib/seedFootball.kickoffPlan,
 * med ÉN afvigelse: fixtures her har ALLEREDE deres dokument-id (kernen har
 * kørt providerens resolveDocs), så docId-opslaget er udeladt.
 * @param {Array<{id:string, kickoff:*}>} fixtures
 * @param {Map<string, {result?:*, kickoffMs?:number|null}>} nuvaerende
 */
function kickoffPlan(fixtures, nuvaerende) {
  const aendringer = [];
  // De to grunde til at springe over tælles HVER FOR SIG. "Findes ikke" aftenen
  // før en runde betyder, at kampen aldrig blev seedet — det er en alarm, og
  // den må ikke gemme sig i samme tal som de færdigspillede.
  const mangler = [];
  let spillet = 0;
  for (const fx of fixtures || []) {
    const nu = nuvaerende?.get?.(fx.id);
    if (!nu) { mangler.push(fx.id); continue; }
    if (nu.result) { spillet += 1; continue; }
    const tilMs = kickoffMs(fx.kickoff);
    const fraMs = nu.kickoffMs ?? null;
    if (tilMs === fraMs) continue;
    // At RYDDE en tid, der står, er ikke en tidsrettelse — det er tre ting på
    // én gang, og ingen af dem er synlige: firestore.rules sammenligner
    // request.time mod null og afviser hvert tip, `isLocked` returnerer false
    // så knapperne står åbne alligevel, og påmindelsen springer kampen over.
    // En udsat kamp uden ny dato skal håndteres bevidst, ikke som en
    // bivirkning af en rutinekørsel.
    if (tilMs == null && fraMs != null) {
      throw new Error(`${fx.id}: kampprogrammet har ingen tid, men kampen har en. Ryd den bevidst — ikke via en rutinekørsel.`);
    }
    aendringer.push({ id: fx.id, fraMs, tilMs });
  }
  return { aendringer, mangler, spillet, sprunget: mangler.length + spillet };
}

/**
 * Tidszone-løs pulselive-tid ("2026-08-21 20:00:00" i Europe/London) → UTC ms.
 *
 * London skifter mellem BST (+01) og GMT (+00) MIDT i sæsonen (sidste søndag
 * i oktober/marts) — en fast offset ville flytte hver vinterkamps deadline en
 * time. Ingen tz-bibliotek i functions: offsetten findes med Intl ved at
 * formatere et UTC-gæt i London og korrigere med differensen. Andet gennemløb
 * fanger selve skiftedøgnet, hvor første gæt kan lande på den forkerte side.
 */
function londonTilUtcMs(s) {
  const m = String(s ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`ulæselig London-tid: "${s}"`);
  const [, aar, md, dag, time, min, sek] = m.map(Number);
  const somUtc = Date.UTC(aar, md - 1, dag, time, min, sek || 0);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const iLondon = (ms) => {
    const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour) % 24, Number(p.minute), Number(p.second));
  };
  let gaet = somUtc - (iLondon(somUtc) - somUtc);
  gaet = somUtc - (iLondon(gaet) - gaet);
  return gaet;
}

module.exports = { kickoffMs, kickoffPlan, londonTilUtcMs };
