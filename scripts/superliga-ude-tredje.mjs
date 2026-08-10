// ---------------------------------------------------------------------------
// scripts/superliga-ude-tredje.mjs — UDE- OG TREDJETRØJER FRA KLUBBERNES EGNE
// BUTIKKER OG LANCERINGSSIDER.
//
// `superliga-troejefarver.mjs` henter HJEMMEtrøjer fra bold.dk. Den kilde har
// ingen ude- og tredjetrøjer, så de tal i `superligaTeams2026.js` var skrevet
// på fornemmelse — det stod også i filen. Det her script lukker elleve af dem.
//
// Scriptet FEJLER (exit 1), hvis et tal i datafilen ikke længere stemmer med
// målingen. Det er meningen: skifter en klub trøje, skal kørslen sige fra.
//
// HVORFOR IKKE BARE AFLÆSE EN FARVE I ET BILLEDE. Tre grunde, alle mødt undervejs:
//
//   1. FORKERT UDSNIT. Første måling af Sønderjyskes udetrøje ramte klubmærket,
//      spillerens arm, de sorte shorts og ærmekanten — fire ud af fem felter var
//      forurenet, og gennemsnittet så alligevel "plausibelt bordeaux" ud. Ved
//      FCN landede et felt på den hvide baggrund, fordi trøjen er smallere dér.
//      Derfor `--kasser`: den tegner felterne ind i billedet, så man kan SE hvad
//      der er målt, før man tror på tallet.
//
//   2. LYSSÆTNING. Lyngbys lanceringsfotos er taget i et blåligt omklædningsrum.
//      En rå aflæsning af marineblåt under blåt lys er for blå. Scriptet
//      hvidbalancerer mod en flade, der VIDES at være hvid, og printer både den
//      rå og den korrigerede værdi, så korrektionens størrelse står synlig.
//
//   3. MØNSTER. Flere trøjer har et andenfarvet mønster, som ville trække
//      medianen. Hvor det gælder, filtreres mønsteret fra med et navngivet
//      filter — og andelen er noteret i `superligaTeams2026.js`, fordi den er
//      dét, der afgør, om mønsteret skal TEGNES på badgen.
//
// BRUG:
//   node scripts/superliga-ude-tredje.mjs            # målingerne
//   node scripts/superliga-ude-tredje.mjs --kasser   # + kontrolbilleder i /tmp
// ---------------------------------------------------------------------------

import { writeFileSync } from 'fs';
import { chromium } from '@playwright/test';
// DATAFILEN SELV, ikke en kopi af tallene. Første udgave sammenlignede mod et
// `forventet`-felt i scriptet og påstod i sin egen overskrift, at den fejler,
// hvis superligaTeams2026.js afviger. Det gjorde den ikke — den kunne stå grøn,
// mens datafilen sagde noget helt andet. Netop den slags påstand, harnesset
// findes for at forhindre.
import { SUPERLIGA_TEAMS_2026 } from '../src/data/superligaTeams2026.js';

/**
 * FILTRE. Kører i browseren pr. pixel; `true` = tæl den med.
 * Holdt navngivne frem for inline, så tabellen nedenfor kan læses.
 */
const FILTRE = {
  // Blåt stof: væk med logoer (lyse), hud og træ (R>G>B) og alt ikke-blåt.
  blaatStof: 'p => !(p[0]>150 && p[1]>150 && p[2]>150) && !(p[0]>p[1] && p[1]>p[2]) && p[2]>p[1] && p[2]>p[0]',
  // Randers ude: bunden, uden det lyserøde gitter.
  udenGitter: 'p => !(p[0] > p[2] - 10 && p[0] > 70)',
  // Randers 3.: kun de orange kvarterer.
  kunOrange: 'p => p[0]>140 && p[0]>p[2]+50',
  // Sort trøje på sort baggrund: baggrunden er ren #000000, stoffet lysere.
  ikkeBaggrund: 'p => p[0]>12 || p[1]>12 || p[2]>12',
  // DELEFILTRE til --moenster: sand = pixlen hører til MØNSTERET (farve nr. 2).
  gul: 'p => p[0]>140 && p[1]>110 && p[2]<110',
  bronze: 'p => p[0]>90 && p[0]>p[2]+35',
  gitter: 'p => p[0] > p[2] - 10 && p[0] > 70',
  ikkeOrange: 'p => !(p[0]>140 && p[0]>p[2]+50) && p[2]>=p[0]',
  moerkLyseroed: 'p => p[0]>=60 && p[0]<228',
  // Grundfilter til --moenster: væk med det hvide studiebaggrundsfelt.
  ikkeHvid: 'p => !(p[0]>238 && p[1]>238 && p[2]>238)',
};

/**
 * Målingerne. Hvert felt er efterprøvet visuelt med --kasser.
 * `hvid` er en flade, der VIDES at være hvid, og bruges til hvidbalancering.
 */
const MAALINGER = [
  {
    hold: 'Sønderjyske Fodbold',
    felt: 'awayColor',
    hvad: 'udebane 26/27 — bordeaux',
    kilde: 'https://soenderjyskefodbold.dk/hjemme-og-udebanetroejen-for-saesonen-2026-27/',
    billede: 'https://soenderjyskefodbold.dk/wp-content/uploads/2026/07/SJF_LAUNCH_26-27_WEB_1920X1080.jpg',
    // Klubben skriver det selv: "for første gang nogensinde er udebanetrøjen
    // holdt i en dyb bordeauxfarve". Dagslys — ingen korrektion nødvendig.
    stof: [[1025, 305, 1080, 395], [1115, 395, 1250, 430], [1272, 398, 1340, 440]],
  },
  {
    hold: 'Lyngby Boldklub',
    felt: 'thirdColor',
    hvad: '3. trøje 26/27 — marineblå',
    kilde: 'https://shop.lyngby-boldklub.dk/products/3-troje-2026-2027',
    billede: 'https://shop.lyngby-boldklub.dk/cdn/shop/files/4_712a02f5-2a8c-4810-8962-bb8e18d2a801.png?width=900',
    // Nærbilledet, ikke lanceringsfotoet: dét er taget i et blåligt
    // omklædningsrum, hvor hvidreferencen selv står 32 % under korrekt
    // eksponering. Her er lyset kun svagt varmt, så korrektionen er lille.
    stof: [[40, 380, 870, 1260]],
    filter: 'blaatStof',
    hvid: [410, 490, 480, 535],   // den hvide cirkel i LOOP CATERING-logoet
  },
  {
    hold: 'F.C. København',
    felt: 'thirdColor',
    hvad: '3. trøje 25/26 — mintgrøn',
    kilde: 'https://fckfanshop.dk/collections/tredje',
    billede: 'https://fckfanshop.dk/cdn/shop/files/FCK3JSYW_AciminArcngtMenaciNuiarc_1.png?width=1000',
    // Fladt produktfoto på hvid. Den øverste del har en mørk stænk-effekt og
    // måles ikke; de to felter herunder ligger i den flade mintgrønne.
    stof: [[390, 580, 620, 880], [330, 500, 380, 700]],
  },
  {
    hold: 'Brøndby IF',
    felt: 'awayColor',
    hvad: 'udebane 26/27 — marineblå med gult brystbånd',
    kilde: 'https://shoppen.brondby.com/collections/udebanetoj',
    billede: 'https://shoppen.brondby.com/cdn/shop/files/235908-7827.jpg?width=800',
    // Udgaven UDEN sponsortryk, så den gule tekst ikke forurener. To felter,
    // over og under båndet: studiet lyser oppefra, så medianen af begge bruges.
    stof: [[300, 480, 500, 640], [300, 150, 420, 230]],
    // MØNSTER-VURDERING: gult brystbånd. `flade` er hele trøjen, `anden` det
    // gule; `baand` scanner lodret gennem torsoen og måler båndets bredde.
    moenster: { navn: 'gult brystbånd', flade: [40, 60, 760, 799], grund: 'ikkeHvid', anden: 'gul', baand: [398, 0, 799] },
  },
  {
    hold: 'Brøndby IF',
    felt: 'thirdColor',
    hvad: '3. trøje 26/27 — meget mørk brun',
    kilde: 'https://shoppen.brondby.com/collections/3-troje',
    billede: 'https://shoppen.brondby.com/cdn/shop/files/3.TroejeL_Svoksen.jpg?width=800',
    // Bronzemønsteret er 1,9 % af fladen og trækker ikke medianen.
    stof: [[150, 380, 650, 700]],
    moenster: { navn: 'bronzemønster', flade: [150, 380, 650, 700], anden: 'bronze' },
  },
  {
    hold: 'FC Nordsjælland',
    felt: 'awayColor',
    hvad: 'udebane 25/26 — mørk marineblå',
    kilde: 'https://unisport.dk/fodboldtrojer/fc-nordsjaelland-udebanetroje-202526/416987/',
    billede: 'https://thumblr.uniid.it/product/416987/17432f34972f.jpg?width=1200',
    // Det FULDE produktfoto, ikke nærbilledet af stoffet: nærbilledet har dybe
    // folder og måler #0D1328, altså mørkere end trøjen er.
    stof: [[256, 240, 377, 415], [291, 934, 464, 1079]],
  },
  {
    hold: 'OB',
    felt: 'awayColor',
    hvad: 'udebane 26/27 — sort',
    kilde: 'https://obfanshop.dk/collections/spillertoj',
    billede: 'https://obfanshop.dk/cdn/shop/files/235706-2001_1.png?width=900',
    // Baggrunden er ren #000000 og stoffet en anelse lysere; filteret skiller
    // dem ad. Bagsiden måles — forsiden har én blå lodret stribe.
    stof: [[330, 520, 560, 760], [300, 800, 600, 900]],
    filter: 'ikkeBaggrund',
  },
  {
    hold: 'OB',
    felt: 'thirdColor',
    hvad: '3. trøje 25/26 — lyserød',
    kilde: 'https://obfanshop.dk/collections/spillertoj',
    billede: 'https://obfanshop.dk/cdn/shop/files/233624-3863_1_057e7e95-385d-43a9-8029-f82ec05ca96a.png?width=900',
    // Ternet i to lyserøde nuancer (#E6CACE 69,6 % og #E1BDC3 30,4 %) med kun
    // 1,12:1 i kontrast. Ternet tegnes ikke; medianen af hele fladen er farven.
    stof: [[300, 500, 620, 800]],
    filter: 'ikkeBaggrund',
    moenster: { navn: 'tern i to lyserøde', flade: [300, 500, 620, 800], grund: 'ikkeBaggrund', anden: 'moerkLyseroed' },
  },
  {
    hold: 'Randers FC',
    felt: 'awayColor',
    hvad: 'udebane 26/27 — mørk blågrå',
    kilde: 'https://sport24.dk/kategori/randers-fc-shop/spillertoj/',
    billede: 'https://d9k6g0fi21yil.cloudfront.net/13-607858-AWAY-RFC_01_01.jpg',
    // Det lyserøde gitter fylder 16,5 % og filtreres fra, så bunden står ren.
    stof: [[430, 600, 780, 900]],
    filter: 'udenGitter',
    moenster: { navn: 'lyserødt gitter', flade: [430, 600, 780, 900], anden: 'gitter' },
  },
  {
    hold: 'Randers FC',
    felt: 'thirdColor',
    hvad: '3. trøje 26/27 — orange (trøjen er delt i orange og navy kvarterer)',
    kilde: 'https://sport24.dk/kategori/randers-fc-shop/spillertoj/',
    billede: 'https://d9k6g0fi21yil.cloudfront.net/13-607457-3-RFC_01_01.jpg',
    // Orange 52,4 %, navy 47,6 %. Orange er valgt, fordi den er dominerende OG
    // adskiller trøjen fra klubbens udebane, som også er mørk.
    stof: [[420, 560, 800, 900]],
    filter: 'kunOrange',
    moenster: { navn: 'orange/navy kvarterer', flade: [420, 560, 800, 900], grund: 'ikkeHvid', anden: 'ikkeOrange' },
  },
  {
    hold: 'Silkeborg IF',
    felt: 'thirdColor',
    hvad: '3. trøje 26/27 — lyserød med sorte ærmer',
    kilde: 'https://sport24.dk/kategori/silkeborg-if-shop/spillertoj/',
    billede: 'https://d9k6g0fi21yil.cloudfront.net/2-JD7359-SIF_LYSER%c3%98D_01.jpg',
    // Kroppen under JYSK-logoet. Ærmerne er sorte og måles ikke — de er en
    // detalje, ikke trøjens farve.
    stof: [[480, 620, 744, 816]],
  },
];

const hex = ([r, g, b]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

const browser = await chromium.launch();
const side = await browser.newPage();

/**
 * Billedet hentes i NODE og gives videre som data-URL.
 *
 * Første udgave satte `img.src` til klubbens URL inde i browseren. Siden står på
 * `about:blank` og har derfor ingen origin, så billedet blev afvist af CORS, og
 * `getImageData` ville i øvrigt have forurenet canvas'et. Fejlen var et bart
 * `Event` uden tekst — værd at kende, for den ligner en netværksfejl.
 *
 * To af butikkerne (unisport, sport24) svarer 403 på en tom User-Agent.
 */
const cache = new Map();
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
async function dataUrl(url) {
  if (cache.has(url)) return cache.get(url);
  // GENFORSØG. Scriptet rammer seks forskellige butikkers CDN'er, og mindst én
  // (obfanshop) svarer af og til 503 på et billede, der virker fint sekundet
  // efter. Uden det her fejler hele kørslen på et vejrlig, og så holder man op
  // med at køre den — hvilket er værre end et par sekunders ventetid.
  let sidst;
  for (const vent of [0, 1000, 3000, 8000]) {
    if (vent) await new Promise((ok) => { setTimeout(ok, vent); });
    try {
      const svar = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!svar.ok) { sidst = new Error(`HTTP ${svar.status}`); continue; }
      const type = svar.headers.get('content-type') || 'image/jpeg';
      const d = `data:${type};base64,${Buffer.from(await svar.arrayBuffer()).toString('base64')}`;
      cache.set(url, d);
      return d;
    } catch (err) { sidst = err; }
  }
  throw new Error(`Kunne ikke hente ${url} efter 4 forsøg: ${sidst?.message}`);
}

/** Pixels fra de angivne felter, evt. gennem et navngivet filter. */
async function pixels(url, felter, filterKode) {
  const d = await dataUrl(url);
  /* eslint-disable no-undef */
  return side.evaluate(async ([u, f, fk]) => {
    const img = new Image();
    await new Promise((ok, fejl) => { img.onload = ok; img.onerror = fejl; img.src = u; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const behold = fk ? new Function(`return (${fk})`)() : null;
    const ud = [];
    for (const [x0, y0, x1, y1] of f) {
      const d2 = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      for (let i = 0; i < d2.length; i += 4) {
        const p = [d2[i], d2[i + 1], d2[i + 2]];
        if (!behold || behold(p)) ud.push(p);
      }
    }
    return { pixels: ud, bredde: img.naturalWidth, hoejde: img.naturalHeight };
  }, [d, felter, filterKode || null]);
  /* eslint-enable no-undef */
}

/** Median pr. kanal — robust over for skygger, folder og enkelte fremmedpixels. */
function median(px) {
  const kanal = (i) => px.map((p) => p[i]).sort((a, b) => a - b)[Math.floor(px.length / 2)];
  return [kanal(0), kanal(1), kanal(2)];
}

console.log('\nUDE- OG TREDJETRØJER — målt på klubbernes egne butikker\n');

let alleOk = true;
for (const m of MAALINGER) {
  const { pixels: px, bredde, hoejde } = await pixels(m.billede, m.stof, FILTRE[m.filter]);
  const raa = median(px);

  let endelig = raa;
  let note = 'fladt lys, ingen korrektion';
  if (m.hvid) {
    const { pixels: hpx } = await pixels(m.billede, [m.hvid], null);
    const href = median(hpx);
    // von Kries: skalér hver kanal, så referencen bliver ren hvid.
    endelig = raa.map((c, i) => Math.min(255, Math.round((c * 255) / href[i])));
    note = `hvidbalanceret mod ${hex(href)} (×${(255 / href[0]).toFixed(2)}/${(255 / href[1]).toFixed(2)}/${(255 / href[2]).toFixed(2)})`;
  }

  const iData = SUPERLIGA_TEAMS_2026.find((t) => t.name === m.hold)?.[m.felt];
  if (!iData) throw new Error(`${m.hold} har intet ${m.felt} i superligaTeams2026.js`);
  const ok = hex(endelig) === iData.toUpperCase();
  if (!ok) alleOk = false;
  console.log(`  ${m.hold} · ${m.felt} — ${m.hvad}`);
  console.log(`    ${bredde}×${hoejde}, ${px.length} pixels${m.filter ? ` (filter: ${m.filter})` : ''}`);
  if (m.hvid) console.log(`    rå ${hex(raa)} → ${note}`);
  console.log(`    MÅLT ${hex(endelig)}   i data ${iData.toUpperCase()}   ${ok ? '✓' : '✗ AFVIGER'}`);
  console.log();

  if (process.argv.includes('--kasser')) {
    const dk = await dataUrl(m.billede);
    /* eslint-disable no-undef */
    const png = await side.evaluate(async ([u, f, hv]) => {
      const img = new Image();
      await new Promise((ok2, fejl) => { img.onload = ok2; img.onerror = fejl; img.src = u; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.lineWidth = 5; g.strokeStyle = '#00FF00';
      for (const [x0, y0, x1, y1] of f) g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (hv) { g.strokeStyle = '#FF00FF'; g.strokeRect(hv[0], hv[1], hv[2] - hv[0], hv[3] - hv[1]); }
      return c.toDataURL('image/png').split(',')[1];
    }, [dk, m.stof, m.hvid || null]);
    /* eslint-enable no-undef */
    const sti = `/tmp/troeje-${m.hold.split(' ')[0].toLowerCase()}-${m.felt}.png`;
    writeFileSync(sti, Buffer.from(png, 'base64'));
    console.log(`    kontrolbillede: ${sti}  (grøn = stof, magenta = hvidreference)\n`);
  }
}

console.log(alleOk
  ? `Alle ${MAALINGER.length} målinger stemmer med superligaTeams2026.js.\n`
  : 'MINDST ÉN MÅLING AFVIGER fra superligaTeams2026.js — se ovenfor.\n');
// ---------------------------------------------------------------------------
// --moenster — HUSETS TOFARVET-TEST PÅ UDE- OG TREDJETRØJERNE.
//
// `superliga-troejefarver.mjs` har den samme test, men kører kun på bold.dk's
// HJEMMEtrøjer. Fem fravalg i superligaTeams2026.js hvilede derfor på tal, intet
// committet script kunne producere — ordret den fælde, CLAUDE.md navngiver.
//
// TESTEN: farve nr. 2 skal fylde over 12 % af fladen OG mindst halvdelen af
// farve nr. 1. Det er den, der gjorde Leeds' pinstriber til en ensfarvet trøje.
// Dertil kontrasten mellem de to: en flade kan bestå på areal og alligevel være
// usynlig ved 22 px, hvilket er præcis OB's tern.
// ---------------------------------------------------------------------------
if (process.argv.includes('--moenster')) {
  const lum = (c) => {
    const f = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  console.log('\nMØNSTRE — husets tofarvet-test (over 12 %, og mindst halvdelen af nr. 1)\n');
  for (const m of MAALINGER.filter((x) => x.moenster)) {
    const mo = m.moenster;
    // GRUNDFILTERET er mønstertestens eget — ikke målingens. For Randers ude er
    // målingens filter `udenGitter`, som fjerner præcis de pixels, testen skal
    // tælle; første udgave fik derfor nul og styrtede.
    const g = mo.grund ? `(${FILTRE[mo.grund]})(p)` : 'true';
    const { pixels: alle } = await pixels(m.billede, [mo.flade], mo.grund ? FILTRE[mo.grund] : null);
    const { pixels: nr2 } = await pixels(m.billede, [mo.flade], `p => (${FILTRE[mo.anden]})(p) && ${g}`);
    const antal2 = nr2.length;
    const antal1 = alle.length - antal2;
    const pct2 = (100 * antal2) / (antal1 + antal2);
    const { pixels: kun1 } = await pixels(m.billede, [mo.flade], `p => !(${FILTRE[mo.anden]})(p) && ${g}`);
    const a = median(kun1); const b = median(nr2);
    const [L1, L2] = [lum(a), lum(b)].sort((x, y) => y - x);
    const kontrast = (L1 + 0.05) / (L2 + 0.05);
    const overGulv = pct2 > 12;
    const halvdel = antal2 >= antal1 / 2;
    console.log(`  ${m.hold} · ${mo.navn}`);
    console.log(`    nr. 1 ${hex(a)} ${(100 - pct2).toFixed(1)} %   nr. 2 ${hex(b)} ${pct2.toFixed(1)} %`);
    console.log(`    over 12 %: ${overGulv ? 'JA' : 'NEJ'}   mindst halvdelen: ${halvdel ? 'JA' : 'NEJ'}   kontrast ${kontrast.toFixed(2)}:1`);
    console.log(`    → ${overGulv && halvdel ? 'BESTÅR testen' : 'falder på testen'}`);
    if (mo.baand) {
      // Båndbredde er GEOMETRI, ikke areal: et enkelt bredt bånd kan falde på
      // arealtesten og alligevel være tydeligt synligt. Begge tal hører til.
      const [bx, by0, by1] = mo.baand;
      const { pixels: kol } = await pixels(m.billede, [[bx, by0, bx + 1, by1]], null);
      const erNr2 = new Function(`return (${FILTRE[mo.anden]})`)();
      const baand = []; let i = 0;
      while (i < kol.length) {
        if (erNr2(kol[i])) { let j = i; while (j < kol.length && erNr2(kol[j])) j += 1; if (j - i >= 2) baand.push(j - i); i = j; } else i += 1;
      }
      const H = by1 - by0;
      const bredest = Math.max(...baand, 0);
      console.log(`    bredeste bånd i lodret snit: ${bredest} px = ${(100 * bredest / H).toFixed(1)} % af højden → ${(22 * bredest / H).toFixed(2)} px på en 22 px badge`);
    }
    console.log();
  }
}

await browser.close();
process.exit(alleOk ? 0 : 1);
