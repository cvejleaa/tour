// ---------------------------------------------------------------------------
// scripts/maal-livescore-detaljer.mjs — HVAD BÆRER DETALJE-ENDPOINTERNE?
//
// Søsterscript til maal-livescore.mjs. Dét svarede på, om vores kampe kan
// KOBLES til livescores. Dette svarer på, om de felter, trin 2 er begrundet
// med, faktisk findes — og hvor tit de siger noget værd at vise.
//
// DET FANDT EN FEJL I PLANEN, FØR DEN BLEV SKREVET. Planens første udgave
// udledte mål af en whitelist over `IT`-koder (36 = mål, 63 = oplæg,
// 43 = gult), fordi det var dét, én prøvekamp viste. Målt over alle færdige
// kampe rammer den whitelist kun 14 af 20 og 28 af 34: mål bæres OGSÅ af
// 37, 38 og 39, mens 62 er et ANNULLERET mål, der ville være talt med.
//
//   IT 36  mål (i en container med oplægget som IT 63)
//   IT 37  mål, fladt — set med IR:"VAR"
//   IT 38  mål, fladt — set med IR:"VAR"
//   IT 39  mål, fladt — uden Aid/Fn/Ln (kun ID + Pn)
//   IT 43  gult kort      IT 45  kort uden Sc      IT 62  ANNULLERET mål
//
// Scriptet udskriver derfor BÅDE hele IT-fordelingen og AFVISNINGSRATEN: hvor
// stor en andel af kampene ville synken lade stå tomme? Kernen skriver intet
// for en kamp, hvis målkæde ikke går op, så det tal er ikke en detalje — det
// ER dækningsgraden på kampkortet. (Quality Controls krav: en whitelist, hvis
// dækning ingen har målt, gør fladen til et lotteri.)
//
// En whitelist over koder er altså den forkerte vagt: den fejler i BEGGE
// retninger, og den fejler TAVST, fordi en manglende kode bare giver et mål
// færre. Derfor udleder koden i stedet målene af `Sc` — se `maalAf` nedenfor.
//
// BRUG: node scripts/maal-livescore-detaljer.mjs
// ---------------------------------------------------------------------------

const API = 'https://prod-cdn-public-api.lsmedia1.com/v1/api/app';

// Referer kræves. Samme påmindelse som i søsterscriptet: det er et
// browser-endpoint, ikke et API med en aftale bag.
const OPT = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    Referer: 'https://www.livescore.com/',
  },
  signal: AbortSignal.timeout(30000),
};

const SPIL = [
  { navn: 'Premier League', land: 'england', liga: 'premier-league' },
  { navn: 'Superligaen', land: 'denmark', liga: 'superliga' },
];

/**
 * Heltal eller null. Kilden sender tal som STRENGE ("3", "0"), og netop derfor
 * må Number ikke bruges: Number('') og Number(null) er begge 0, altså et
 * gyldigt måltal for "ved ikke". Båndet lukker begge ender.
 */
const heltal = (v) => {
  const s = String(v ?? '').trim();
  return /^\d{1,3}$/.test(s) ? Number(s) : null;
};

/**
 * Tilskuertal. EGEN parser, og det er ikke pedanteri: kilden er inkonsekvent
 * med sig selv — `Tr1`/`Trh1` er STRENGE ("3"), mens `Vsp` er et rigtigt
 * `number` (60098). Første udgave af dette script genbrugte `heltal` og
 * rapporterede 0 af 54 kampe med tilskuertal, fordi båndet dér er tre cifre.
 * Tallet var forkert i den SIKRE retning, men det var stadig forkert, og det
 * er præcis den slags, et harness er til for at fange før koden.
 */
const tilskuertal = (v) => {
  const n = typeof v === 'number' ? v : (/^\d{1,7}$/.test(String(v ?? '').trim()) ? Number(v) : NaN);
  return Number.isInteger(n) && n > 0 && n < 1000000 ? n : null;
};

const udfald = (h, a) => (h > a ? '1' : h < a ? 'X' : '2');

/**
 * Målene i en kamp, udledt af STILLINGEN og ikke af hændelseskoden.
 *
 * Hver hændelse bærer `Sc` = stillingen EFTER den, og `Nm` = 1 (hjemme) eller
 * 2 (ude). For et mål er `Sc[Nm-1]` altså holdets nye måltal — 1 for det
 * første, 2 for det andet. Et ANNULLERET mål (IT 62) bærer den UÆNDREDE
 * stilling, og falder derfor ud af sig selv: dets `Sc[Nm-1]` er holdets
 * hidtidige tal, som allerede er brugt, eller 0.
 *
 * Reglen er selvvaliderende på en måde, en kode-whitelist ikke er: de fundne
 * numre pr. hold skal danne den ubrudte kæde 1..Tr_hold. Gør de ikke det, har
 * vi enten mistet et mål eller talt et med, og så skrives der ingenting.
 *
 * Målt: kæden er komplet i 20/20 PL-kampe og 34/34 SL-kampe, og alle 155 mål
 * har et scorernavn.
 */
function maalAf(inc) {
  const flad = [];
  // REKURSIVT. Mål+oplæg ligger i en nestet liste inde i et container-objekt;
  // kort ligger fladt. En flad løkke taber mål.
  const gaa = (x) => {
    if (Array.isArray(x)) return x.forEach(gaa);
    if (x && typeof x === 'object') {
      flad.push(x);
      if (Array.isArray(x.Incs)) gaa(x.Incs);
    }
    return undefined;
  };
  gaa(Object.values(inc?.Incs || {}));

  const set = new Map(); // "hold:nr" → målet
  for (const x of flad) {
    if (!Array.isArray(x.Sc) || (x.Nm !== 1 && x.Nm !== 2)) continue;
    const nr = heltal(x.Sc[x.Nm - 1]);
    const min = heltal(x.Min);
    if (nr == null || nr < 1 || min == null) continue;
    const scorer = Array.isArray(x.Incs) ? x.Incs.find((y) => y.IT === 36) : null;
    const oplaeg = Array.isArray(x.Incs) ? x.Incs.find((y) => y.IT === 63) : null;
    const kand = {
      hold: x.Nm, nr, min, scorer: scorer?.Pn ?? x.Pn ?? null, oplaeg: oplaeg?.Pn ?? null,
    };
    // Containeren OG dens indre IT=36 bærer samme Sc. Behold den, der har et
    // navn — ellers den første.
    const gl = set.get(`${x.Nm}:${nr}`);
    if (!gl || (gl.scorer == null && kand.scorer != null)) set.set(`${x.Nm}:${nr}`, kand);
  }
  return [...set.values()].sort((a, b) => a.min - b.min || a.hold - b.hold);
}

/** Er kæden 1..n ubrudt for ét hold? */
const kaedeOk = (maal, facit) => facit != null
  && maal.length === facit
  && new Set(maal.map((m) => m.nr)).size === facit
  && maal.every((m) => m.nr >= 1 && m.nr <= facit);

async function hent(sti) {
  const res = await fetch(`${API}/${sti}`, OPT);
  return res.ok ? res.json() : null;
}

async function maalSpil(s) {
  const d = await hent(`stage/soccer/${s.land}/${s.liga}/0`);
  const kampe = (d?.Stages || []).flatMap((st) => st.Events || []);
  const ft = kampe.filter((e) => e.Eps === 'FT');

  const t = {
    iStage: kampe.length,
    ft: ft.length,
    itKoder: new Map(),
    n: 0,
    halvleg: 0,
    tilskuere: 0,
    kaede: 0,
    udenNavn: 0,
    maal: 0,
    sentMaal: 0,
    sentVendte: 0,
    halvlegSkift: 0,
  };

  for (const e of ft) {
    const [inc, info] = await Promise.all([
      hent(`incidents/soccer/${e.Eid}`).catch(() => null),
      hent(`info/soccer/${e.Eid}`).catch(() => null),
    ]);
    t.n += 1;
    const t1 = heltal(inc?.Tr1); const t2 = heltal(inc?.Tr2);
    const h1 = heltal(inc?.Trh1); const h2 = heltal(inc?.Trh2);
    if (h1 != null && h2 != null && t1 != null && t2 != null && h1 <= t1 && h2 <= t2) {
      t.halvleg += 1;
      if (udfald(h1, h2) !== udfald(t1, t2)) t.halvlegSkift += 1;
    }
    if (tilskuertal(info?.Vsp) != null) t.tilskuere += 1;

    // IT-FORDELINGEN, som Quality Control krævede skrevet ned: uden den er
    // "whitelisten dækker ikke" en påstand om nogle prøvekampe. Tallene her
    // er samtidig vagten mod, at kilden stille tilføjer en ny kode.
    for (const h of (function flad(x, ud = []) {
      if (Array.isArray(x)) { x.forEach((y) => flad(y, ud)); return ud; }
      if (x && typeof x === 'object') {
        if (x.IT != null) ud.push(x);
        if (Array.isArray(x.Incs)) flad(x.Incs, ud);
      }
      return ud;
    }(Object.values(inc?.Incs || {})))) {
      t.itKoder.set(h.IT, (t.itKoder.get(h.IT) || 0) + 1);
    }

    const m = maalAf(inc);
    t.maal += m.length;
    t.udenNavn += m.filter((x) => x.scorer == null).length;
    if (kaedeOk(m.filter((x) => x.hold === 1), t1)
      && kaedeOk(m.filter((x) => x.hold === 2), t2)) t.kaede += 1;

    // Sent mål: efter 85'. "Vendte" = udfaldet før målet var et andet end efter.
    let h = 0; let a = 0; let sent = false; let vendte = false;
    for (const g of m) {
      const fh = h; const fa = a;
      if (g.hold === 1) h += 1; else a += 1;
      if (g.min >= SENT_MINUT) {
        sent = true;
        if (udfald(fh, fa) !== udfald(h, a)) vendte = true;
      }
    }
    if (sent) t.sentMaal += 1;
    if (vendte) t.sentVendte += 1;
  }
  return t;
}

/**
 * Hvornår er et mål "sent"? 85' er valgt, fordi det er den sidste
 * spilleperiode plus tillægstid — ikke fordi tallet lyder rundt. Målingen
 * nedenfor er dét, der afgør, om markeringen er en BEGIVENHED eller
 * INVENTAR, med samme målestok som xG-tærsklen i xgRunde.js.
 */
const SENT_MINUT = 85;

const pct = (x, n) => (n ? `${Math.round((x / n) * 100)} %` : '–');

async function main() {
  console.log(`Målt: ${new Date().toISOString()}`);
  let n = 0; let vendte = 0; let skift = 0;
  for (const s of SPIL) {
    const t = await maalSpil(s);
    console.log(`\n=== ${s.navn} ===`);
    console.log(`kampe i stage-listen: ${t.iStage} · færdigspillede (FT): ${t.ft}`);
    console.log(`  halvlegsstilling brugbar   ${t.halvleg}/${t.n}  (${pct(t.halvleg, t.n)})`);
    console.log(`  tilskuertal til stede      ${t.tilskuere}/${t.n}  (${pct(t.tilskuere, t.n)})`);
    console.log(`  målkæden komplet           ${t.kaede}/${t.n}  (${pct(t.kaede, t.n)})`);
    // AFVISNINGSRATEN er det tal, der afgør, om fladen bliver tom. Kernen
    // skriver INTET for en kamp, hvor kæden ikke går op — så en høj rate her
    // betyder ikke "vi mister et ikon", men "kortet står tomt".
    const afvist = t.n - t.kaede;
    console.log(`  → ville blive AFVIST        ${afvist}/${t.n}  (${pct(afvist, t.n)})`);
    console.log(`  IT-koder i kilden: ${[...t.itKoder.entries()]
      .sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}×${v}`).join('  ')}`);
    console.log(`  mål i alt ${t.maal}, heraf uden scorernavn ${t.udenNavn}`);
    console.log(`  mål efter ${SENT_MINUT}'            ${t.sentMaal}/${t.n}  (${pct(t.sentMaal, t.n)})`);
    console.log(`  …som VENDTE udfaldet       ${t.sentVendte}/${t.n}  (${pct(t.sentVendte, t.n)})`);
    console.log(`  udfald ved pausen ≠ slut   ${t.halvlegSkift}/${t.n}  (${pct(t.halvlegSkift, t.n)})`);
    if (t.tilskuere < t.n) {
      console.log('  ⚠ tilskuertallet MANGLER i nogle kampe — feltet skal udelades,');
      console.log('    aldrig skrives som 0. Number(null) er 0, og 0 tilskuere er en løgn.');
    }
    n += t.n; vendte += t.sentVendte; skift += t.halvlegSkift;
  }
  console.log(`\n=== samlet, ${n} færdige kampe ===`);
  console.log(`Sent mål der vendte udfaldet: ${vendte} (${pct(vendte, n)}) ≈ ${(vendte / n * 6).toFixed(1)} pr. runde à 6 kampe.`);
  console.log(`Udfaldet ved pausen ≠ ved slutfløjt: ${skift} (${pct(skift, n)}) ≈ ${(skift / n * 6).toFixed(1)} pr. runde.`);
  console.log('\nMålestokken er xgRunde.js: ~1,3 pr. runde blev dømt INVENTAR,');
  console.log('~0,5 pr. runde en BEGIVENHED. Læs de to tal ovenfor mod dét.');
}

main().catch((err) => { console.error(err); process.exit(1); });
