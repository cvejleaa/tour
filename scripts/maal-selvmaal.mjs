// ---------------------------------------------------------------------------
// scripts/maal-selvmaal.mjs — ER IT=39 ET SELVMÅL?
//
// Spørgsmålet kom af fladen: et selvmål stod som "1–0 8′ Victor Lindelof
// (Brighton)", og Lindelöf spiller for Aston Villa. Kortet skriver det hold,
// der FIK målet, og det er rigtigt — men det læses, som om manden spiller
// der. Kilden ved godt, at det var et selvmål; den fortæller det med en anden
// hændelseskode, som vi ikke brugte.
//
// SCRIPTET FINDES, FORDI ÉN KAMP IKKE BEVISER NOGET. Samme fejl blev gjort i
// planen for trin 2: en IT-whitelist blev udledt af én prøvekamp og ramte
// målt kun 14 af 20. Derfor efterprøves påstanden her på HVER eneste kamp,
// og med et objektivt kriterium frem for en fornemmelse:
//
//   Står målscoreren i det MODSATTE holds startopstilling?
//
// Er svaret ja, kan målet kun være et selvmål — spilleren scorede i en kamp,
// hvor hans eget hold var det, der lukkede målet ind.
//
// MÅLT 1/9-2026 over alle 54 færdigspillede kampe i de to spil:
//
//   IT   i sit EGET hold   i det MODSATTE   kunne ikke opløses
//   36        116                 0                19
//   37          4                 0                 3
//   38          1                 0                 1
//   39          0                 5                 2
//
// Asymmetrien er total: intet almindeligt mål (36/37/38) har nogensinde sin
// scorer hos modstanderen, og hvert eneste opløselige IT=39 har det. "Kunne
// ikke opløses" er indskiftere — `Subs` er ikke holdopdelt på samme måde som
// `Lu`, og et forsøg på at læse den gav to spillere i BEGGE opstillinger,
// altså støj. Startopstillingen alene er det rene signal.
//
// VAGTEN ER DEN SIKRE VEJ: kun 39 mærkes som selvmål. En ukendt kode bliver
// et almindeligt mål, aldrig et selvmål — det modsatte ville hænge en
// forkert etiket på en rigtig scorer.
//
// BRUG: node scripts/maal-selvmaal.mjs
// ---------------------------------------------------------------------------

const API = 'https://prod-cdn-public-api.lsmedia1.com/v1/api/app';
const OPT = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    Referer: 'https://www.livescore.com/',
  },
  signal: AbortSignal.timeout(30000),
};

/** De koder, der bærer et mål. Se scripts/maal-livescore-detaljer.mjs. */
const MAAL_KODER = [36, 37, 38, 39];

const SPIL = [
  { navn: 'Premier League', land: 'england', liga: 'premier-league' },
  { navn: 'Superligaen', land: 'denmark', liga: 'superliga' },
];

async function hent(sti) {
  const res = await fetch(`${API}/${sti}`, OPT);
  return res.ok ? res.json() : null;
}

/** Alle hændelser, fladt — mål ligger nestet i en container, kort ligger fladt. */
function fladeHaendelser(inc) {
  const ud = [];
  const gaa = (x) => {
    if (Array.isArray(x)) return x.forEach(gaa);
    if (x && typeof x === 'object') {
      ud.push(x);
      if (Array.isArray(x.Incs)) gaa(x.Incs);
    }
    return undefined;
  };
  gaa(Object.values(inc?.Incs || {}));
  return ud;
}

async function main() {
  console.log(`Målt: ${new Date().toISOString()}\n`);
  const tael = new Map();
  const selvmaal = [];

  for (const s of SPIL) {
    const d = await hent(`stage/soccer/${s.land}/${s.liga}/0`);
    const ft = (d?.Stages || []).flatMap((st) => st.Events || []).filter((e) => e.Eps === 'FT');
    for (const e of ft) {
      const [inc, lu] = await Promise.all([
        hent(`incidents/soccer/${e.Eid}`).catch(() => null),
        hent(`lineups/soccer/${e.Eid}`).catch(() => null),
      ]);
      if (!inc || !Array.isArray(lu?.Lu)) continue;
      // KUN startopstillingen. `Subs` er ikke holdopdelt på samme måde, og at
      // tage den med gav to spillere i BEGGE hold — altså støj, ikke dækning.
      const side = [JSON.stringify(lu.Lu[0] || {}), JSON.stringify(lu.Lu[1] || {})];

      for (const x of fladeHaendelser(inc)) {
        if (!MAAL_KODER.includes(x.IT)) continue;
        if (!Array.isArray(x.Sc) || (x.Nm !== 1 && x.Nm !== 2)) continue;
        const aid = String(x.Aid || '');
        if (!aid) continue;
        // `x.Nm` er det hold, der FIK målet (målt: se filens hoved).
        const iEget = side[x.Nm - 1].includes(`"${aid}"`);
        const iModsat = side[2 - x.Nm].includes(`"${aid}"`);
        const noegle = `${x.IT}|${iEget ? 'eget' : '–'}|${iModsat ? 'modsat' : '–'}`;
        tael.set(noegle, (tael.get(noegle) || 0) + 1);
        if (iModsat) {
          selvmaal.push(`${s.navn}: ${e.T1?.[0]?.Nm}–${e.T2?.[0]?.Nm} · ${x.Min}′ ${x.Pn} (IT=${x.IT})`);
        }
      }
    }
  }

  console.log('IT  scorer i det hold der FIK målet · i det MODSATTE   antal');
  for (const [k, v] of [...tael].sort()) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  console.log('\nMål, hvor scoreren står hos MODSTANDEREN (= selvmål):');
  for (const l of selvmaal) console.log(`  ${l}`);

  const forkert = [...tael].filter(([k]) => k.includes('modsat') && !k.startsWith('39'));
  console.log(forkert.length
    ? `\n⚠ ${forkert.length} kode(r) ud over 39 har en scorer hos modstanderen — reglen holder IKKE længere.`
    : '\n✓ KUN IT=39 har sin scorer hos modstanderen. Reglen holder.');
}

main().catch((err) => { console.error(err); process.exit(1); });
