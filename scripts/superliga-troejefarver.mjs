// ---------------------------------------------------------------------------
// scripts/superliga-troejefarver.mjs — HVOR SUPERLIGAENS FARVER KOMMER FRA.
//
// Premier Leagues farver hentes af holdfarver-wikipedia.mjs fra flade
// trøjegrafikker. Superligaen kan ikke bruge den vej (se nedenfor), så de tolv
// hjemmefarver er læst af FOTOS af de faktiske 2026/27-trøjer.
//
// Det her script er målingen bag tallene i src/data/superligaTeams2026.js.
// Uden det er de påstande — og det er ikke en teoretisk bekymring: Quality
// Control kunne ikke reproducere de tre FCM-værdier, jeg først skrev i
// kommentaren (#38080D, #5E1723, #8A0B1B), og fik #51131C / #32070A / #1D1B19
// ud af det samme vindue. Samme karakter, andre tal, og ingen kunne afgøre
// hvem der havde ret. Nu kan man køre det.
//
// BRUG:
//   node scripts/superliga-troejefarver.mjs            # krop, alle tolv
//   node scripts/superliga-troejefarver.mjs --trim     # krave/kant-farver
//   node scripts/superliga-troejefarver.mjs --kontrast # læsbarhed parvis
//
// KILDEN er bold.dk's artikel "Bedøm selv: Her er de nye Superliga-trøjer".
// Billederne hentes én gang og caches i scripts/.kit-cache/ (gitignoreret);
// de er klubbernes og bold.dk's, og de committes derfor ikke.
//
// HVORFOR IKKE WIKIPEDIA. Ikke af den grund, jeg først skrev. Jeg påstod, at
// Brøndby stod med `body1 = 003DA5`, "altså BLÅ for en gul trøje" — men body1
// er BUNDfarven under mønsteret, præcis den fælde holdfarver-wikipedia.mjs
// selv dokumenterer. Kører man metoden rigtigt, giver Brøndbys grafik gul
// 76,5 %. Argumentet var forkert, og fem af de seks fejlfarver ville metoden
// faktisk have fanget.
//
// Den grund, der HOLDER, er aktualitet. Trøjefeltet for de tolv:
//
//     FCK          _copenhagen2627h      2026/27   ✓
//     Randers      _randers2627h         2026/27   ✓
//     Silkeborg    _silkeborg2627h       2026/27   ✓
//     FCM          _midtjylland2526h     2025/26
//     Brøndby      _brondby2526h         2025/26
//     FCN          _fcn2526h             2025/26
//     AGF          _agf2324h             2023/24
//     OB           _ob2324h              2023/24
//     Horsens      _horsens1920h         2019/20
//     Lyngby       _adidascampeon23rb    generisk adidas-skabelon, ikke klubben
//     Viborg       (tomt)
//     Sønderjyske  (tomt)
//
// TRE AF TOLV er indeværende sæson. At 5 af 6 alligevel ville være ramt
// skyldes, at klubber sjældent skifter grundfarve mellem sæsoner — ikke at
// kilden er aktuel. Fotoene er 2026/27 hele vejen rundt.
//
// FORBEHOLDET VED FOTOS er ægte, og holdfarver-wikipedia.mjs advarer selv mod
// dem: studielys tager krominans, og tynde striber bliver til mudder. Det
// skete: AGF's marineblå pinstriber forsvandt i grå, FCM's røde i sort, og
// Sønderjyskes blå mistede en tredjedel af sin mætning. Konsekvensen er draget
// i holdfilen — AGF og FCM står ensfarvede, fordi deres mønster ikke kan måles.
//
// KRYDSTJEK mod de tre aktuelle flade grafikker, så afvigelsen står nede på
// papir og ikke i hukommelsen:
//
//     FCK        foto #FFFFFF   grafik #FBFBFB    enige
//     Randers    foto #78C5ED   grafik #80BFFF    grafikken lidt mættere
//     Silkeborg  foto #CA202C   grafik #F50000    grafikken TYDELIGT mættere
//
// Fotoværdien er beholdt alle tolv steder. En tabel fra én kilde med ét
// forbehold er nemmere at stole på end en, hvor tre rækker kommer et andet
// sted fra og ingen kan se hvilke. Ser en badge for mat ud i produktion, står
// grafik-værdien her som det dokumenterede alternativ.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { erTofarvet, GULV_PCT, HALVDEL } from './troejeMoenster.mjs';

const HER = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(HER, '.kit-cache');
const UA = 'VejleaaTip/1.0 (hobby-tippespil; https://tip.vejleaa.dk)';
const BASE = 'https://s3.eu-central-1.amazonaws.com/static.bold.dk/picture/640x/';

// Filnavn hos kilden → holdnavnet i src/data/superligaTeams2026.js.
const TROEJER = {
  'fcm-troje.jpg': 'FC Midtjylland',
  'fck-troje.jpg': 'F.C. København',
  'brondby-troje.jpg': 'Brøndby IF',
  'agf-troje-2.jpg': 'AGF',
  'fcn-troje.jpg': 'FC Nordsjælland',
  'viborg-troje.jpg': 'Viborg FF',
  'ob-troje.jpg': 'OB',
  'randers-troje.jpg': 'Randers FC',
  'sonderjyske-troje.jpg': 'Sønderjyske Fodbold',
  'silkeborg-troje.jpg': 'Silkeborg IF',
  'horsens-troje.jpg': 'AC Horsens',
  'lyngby-troje.jpg': 'Lyngby Boldklub',
};

// VINDUET er valgt for at ramme rent stof: under sponsorbåndet, over sømmen,
// inden for kroppen. Sponsorlogoet er den største enkeltfejlkilde — Brøndbys
// "Betano" er marineblå og ville ellers have gjort en ensfarvet gul trøje
// tofarvet.
const VINDUE = { y0: 0.62, y1: 0.86, x0: 0.30, x1: 0.70 };

// Trim og bånd måles ved kraven, hvor de står som massive flader i stedet for
// tynde kanter. Målt i kroppen forsvinder de i kantudjævning.
const TRIM = {
  'FC Nordsjælland': { y0: 0.42, y1: 0.52, x0: 0.32, x1: 0.68 },
  'Brøndby IF': { y0: 0.05, y1: 0.09, x0: 0.38, x1: 0.62 },
  'F.C. København': { y0: 0.05, y1: 0.09, x0: 0.40, x1: 0.60 },
  'Randers FC': { y0: 0.45, y1: 0.60, x0: 0.28, x1: 0.42 },
  AGF: { y0: 0.055, y1: 0.085, x0: 0.42, x1: 0.58 },
  'FC Midtjylland': { y0: 0.09, y1: 0.13, x0: 0.35, x1: 0.65 },
};

async function foto(fil) {
  mkdirSync(CACHE, { recursive: true });
  const sti = resolve(CACHE, fil);
  if (existsSync(sti)) return readFileSync(sti);
  const svar = await fetch(BASE + fil, { headers: { 'User-Agent': UA } });
  if (!svar.ok) throw new Error(`kunne ikke hente ${fil}: ${svar.status}`);
  const buf = Buffer.from(await svar.arrayBuffer());
  writeFileSync(sti, buf);
  await new Promise((r) => { setTimeout(r, 400); });
  return buf;
}

// --- JPEG-baseline-afkoder --------------------------------------------------
// Node har ingen indbygget billedafkoder, og holdfarver-wikipedia.mjs' PNG-
// afkoder duer ikke: kilden leverer JPEG. Kun det, målingen behøver —
// baseline, ingen progressiv, ingen aritmetisk kodning.
function afkodJpeg(buf) {
  const zigzag = [
    0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
  ];
  const qt = {}; const huff = {};
  let bredde = 0; let hoejde = 0; let komp = []; let restart = 0;
  let p = 2;
  let scanStart = -1;
  while (p < buf.length) {
    if (buf[p] !== 0xff) { p += 1; continue; }
    const m = buf[p + 1]; const len = buf.readUInt16BE(p + 2);
    if (m === 0xdb) {
      let q = p + 4;
      while (q < p + 2 + len) {
        const pq = buf[q] >> 4; const tq = buf[q] & 15; q += 1;
        const tab = new Int32Array(64);
        for (let i = 0; i < 64; i += 1) {
          tab[zigzag[i]] = pq ? buf.readUInt16BE(q + i * 2) : buf[q + i];
        }
        qt[tq] = tab; q += pq ? 128 : 64;
      }
    } else if (m === 0xc0 || m === 0xc1) {
      hoejde = buf.readUInt16BE(p + 5); bredde = buf.readUInt16BE(p + 7);
      const n = buf[p + 9];
      komp = [];
      for (let i = 0; i < n; i += 1) {
        const o = p + 10 + i * 3;
        komp.push({ id: buf[o], h: buf[o + 1] >> 4, v: buf[o + 1] & 15, tq: buf[o + 2] });
      }
    } else if (m === 0xc2) {
      throw new Error('progressiv JPEG understøttes ikke');
    } else if (m === 0xc4) {
      let q = p + 4;
      while (q < p + 2 + len) {
        const tc = buf[q] >> 4; const th = buf[q] & 15; q += 1;
        const antal = []; let i;
        let total = 0;
        for (i = 0; i < 16; i += 1) { antal.push(buf[q + i]); total += buf[q + i]; }
        q += 16;
        const koder = new Map();
        let kode = 0; let k = 0;
        for (i = 0; i < 16; i += 1) {
          for (let j = 0; j < antal[i]; j += 1) {
            koder.set(`${i + 1}:${kode}`, buf[q + k]); k += 1; kode += 1;
          }
          kode <<= 1;
        }
        huff[`${tc}${th}`] = koder; q += total;
      }
    } else if (m === 0xdd) {
      restart = buf.readUInt16BE(p + 4);
    } else if (m === 0xda) {
      const n = buf[p + 4];
      for (let i = 0; i < n; i += 1) {
        const id = buf[p + 5 + i * 2]; const t = buf[p + 6 + i * 2];
        const c = komp.find((x) => x.id === id);
        c.dc = t >> 4; c.ac = t & 15;
      }
      scanStart = p + 2 + len;
      break;
    }
    p += 2 + len;
  }
  if (scanStart < 0) throw new Error('ingen scan fundet');

  // Bit-læser, der springer 0xFF00-stopbytes og restart-markører over.
  let bp = scanStart; let bit = 0;
  const laesBit = () => {
    if (bp >= buf.length) return 0;
    const b = buf[bp];
    const v = (b >> (7 - bit)) & 1;
    bit += 1;
    if (bit === 8) {
      bit = 0; bp += 1;
      if (b === 0xff) bp += 1;          // udfyldnings-nulbyte
    }
    return v;
  };
  const afkod = (tab) => {
    let kode = 0;
    for (let l = 1; l <= 16; l += 1) {
      kode = (kode << 1) | laesBit();
      const v = tab.get(`${l}:${kode}`);
      if (v !== undefined) return v;
    }
    throw new Error('ugyldig huffman-kode');
  };
  const modtag = (n) => { let v = 0; for (let i = 0; i < n; i += 1) v = (v << 1) | laesBit(); return v; };
  const udvid = (v, n) => (n === 0 ? 0 : (v < (1 << (n - 1)) ? v - (1 << n) + 1 : v));

  const hMax = Math.max(...komp.map((c) => c.h));
  const vMax = Math.max(...komp.map((c) => c.v));
  const mcuX = Math.ceil(bredde / (8 * hMax));
  const mcuY = Math.ceil(hoejde / (8 * vMax));
  for (const c of komp) {
    c.bredde = mcuX * c.h * 8; c.hoejde = mcuY * c.v * 8;
    c.data = new Uint8ClampedArray(c.bredde * c.hoejde);
    c.pred = 0;
  }

  const blok = new Int32Array(64);
  const idct = (ind, ud, ux, uy, ubredde) => {
    // Direkte IDCT — langsom, men målingen kører på tolv små billeder.
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        let sum = 0;
        for (let v = 0; v < 8; v += 1) {
          for (let u = 0; u < 8; u += 1) {
            const cu = u === 0 ? Math.SQRT1_2 : 1;
            const cv = v === 0 ? Math.SQRT1_2 : 1;
            sum += cu * cv * ind[v * 8 + u]
              * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
              * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
          }
        }
        ud[(uy + y) * ubredde + ux + x] = Math.round(sum / 4) + 128;
      }
    }
  };

  let mcu = 0;
  for (let my = 0; my < mcuY; my += 1) {
    for (let mx = 0; mx < mcuX; mx += 1) {
      if (restart && mcu > 0 && mcu % restart === 0) {
        if (bit) { bit = 0; bp += 1; }
        while (bp < buf.length && !(buf[bp] === 0xff && buf[bp + 1] >= 0xd0 && buf[bp + 1] <= 0xd7)) bp += 1;
        bp += 2;
        for (const c of komp) c.pred = 0;
      }
      for (const c of komp) {
        for (let by = 0; by < c.v; by += 1) {
          for (let bx = 0; bx < c.h; bx += 1) {
            blok.fill(0);
            const t = afkod(huff[`0${c.dc}`]);
            c.pred += udvid(modtag(t), t);
            blok[0] = c.pred * qt[c.tq][0];
            let k = 1;
            while (k < 64) {
              const rs = afkod(huff[`1${c.ac}`]);
              const r = rs >> 4; const sz = rs & 15;
              if (sz === 0) { if (r === 15) { k += 16; continue; } break; }
              k += r;
              if (k > 63) break;
              blok[zigzag[k]] = udvid(modtag(sz), sz) * qt[c.tq][zigzag[k]];
              k += 1;
            }
            idct(blok, c.data, (mx * c.h + bx) * 8, (my * c.v + by) * 8, c.bredde);
          }
        }
      }
      mcu += 1;
    }
  }

  const [Y, Cb, Cr] = komp;
  const pixel = (x, y) => {
    const hent = (c) => c.data[Math.min(c.hoejde - 1, (y * c.v / vMax) | 0) * c.bredde
      + Math.min(c.bredde - 1, (x * c.h / hMax) | 0)];
    const yy = hent(Y);
    if (komp.length === 1) return [yy, yy, yy];
    const cb = hent(Cb) - 128; const cr = hent(Cr) - 128;
    const kl = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return [kl(yy + 1.402 * cr), kl(yy - 0.344136 * cb - 0.714136 * cr), kl(yy + 1.772 * cb)];
  };
  return { bredde, hoejde, pixel };
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/**
 * Samme grådige klyngning og samme afstand 40 som holdfarver-wikipedia.mjs.
 *
 * BEMÆRK forskellen, som Quality Control med rette pegede på: tærsklen 40 er
 * kalibreret i holdfarver-taerskel.mjs på FLADE grafikker, ikke på fotos.
 * Tallet er det samme, kalibreringen følger ikke med. Den er brugt her for at
 * kunne sammenligne de to ligaer med samme linjal, ikke fordi 40 er efterprøvet
 * på fotografier.
 */
function flader(px, afstand = 40) {
  const klynger = [];
  for (const [r, g, b] of px) {
    let traf = null;
    for (const k of klynger) {
      if (Math.abs(k.r / k.n - r) + Math.abs(k.g / k.n - g) + Math.abs(k.b / k.n - b) < afstand) { traf = k; break; }
    }
    if (traf) { traf.r += r; traf.g += g; traf.b += b; traf.n += 1; } else klynger.push({ r, g, b, n: 1 });
  }
  klynger.sort((a, b) => b.n - a.n);
  return klynger.map((k) => ({ hex: hex(k.r / k.n, k.g / k.n, k.b / k.n), andel: k.n / px.length }));
}

function udsnit(bil, v) {
  const px = [];
  for (let y = Math.floor(bil.hoejde * v.y0); y < bil.hoejde * v.y1; y += 3) {
    for (let x = Math.floor(bil.bredde * v.x0); x < bil.bredde * v.x1; x += 3) px.push(bil.pixel(x, y));
  }
  return px;
}

/** WCAG-kontrast — bruges til at vise, hvornår et mønster er usynligt. */
function kontrast(a, b) {
  const lum = (h) => {
    const k = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
  };
  const [x, y] = [lum(a) + 0.05, lum(b) + 0.05];
  return Math.round((Math.max(x, y) / Math.min(x, y)) * 100) / 100;
}

// --- kørsel ----------------------------------------------------------------

const tilstand = process.argv.includes('--trim') ? 'trim'
  : process.argv.includes('--kontrast') ? 'kontrast' : 'krop';

const maalt = new Map();
for (const [fil, navn] of Object.entries(TROEJER)) {
  const bil = afkodJpeg(await foto(fil));
  const vindue = tilstand === 'trim' ? (TRIM[navn] || VINDUE) : VINDUE;
  const fl = flader(udsnit(bil, vindue));
  maalt.set(navn, fl);
  if (tilstand !== 'kontrast') {
    console.log(`  ${navn.padEnd(22)} ${fl.slice(0, 4).map((f) => `${f.hex} ${(f.andel * 100).toFixed(1).padStart(4)} %`).join('   ')}`);
  }
}

if (tilstand === 'krop') {
  // TOFARVET-TESTEN. Den stod her som to bare tal (`0.12` og `0.5`) i en
  // kopi af `troejefarver()` i holdfarver-wikipedia.mjs — tre eksemplarer af
  // samme beslutning, hvoraf kun det ene var testet. Den bor nu i
  // `troejeMoenster.mjs`, så en ændring af gulvet rammer alle tre steder.
  //
  // Det er dén test, der gjorde Leeds ensfarvet — og som AGF og FCM også
  // falder for. Uden den ville de to have fået et mønster, Leeds ikke fik, af
  // data der er svagere end Leeds'.
  //
  // BEMÆRK, at det er den UDELTE test: den kender ikke `slags` og har intet
  // kontrastkrav. Kørte man den på Randers' skråbånd, ville den sige
  // "ensfarvet" — trøjen bærer kun sit bånd, fordi den blev målt af
  // `superliga-ude-tredje.mjs`, som bruger den delte. HJEMMEtrøjerne her er
  // altså dømt efter en snævrere regel end ude- og tredjetrøjerne, og en
  // hjemmetrøje med en enkeltfigur ville stadig slippe igennem som ensfarvet.
  console.log(`\nTofarvet-testen (>= ${GULV_PCT} %, og nr. 2 >= halvdelen af nr. 1):\n`);
  for (const [navn, fl] of maalt) {
    const store = fl.filter((f) => f.andel * 100 >= GULV_PCT);
    const to = erTofarvet(fl);
    const tal = store.length >= 2
      ? `${(store[1].andel * 100).toFixed(1)} % mod krav ${(store[0].andel * 100 * HALVDEL).toFixed(1)} %`
      : `kun én flade over ${GULV_PCT} %`;
    console.log(`  ${navn.padEnd(22)} ${to ? 'MØNSTRET ' : 'ensfarvet'}  ${tal}`);
  }
}

if (tilstand === 'kontrast') {
  // Et mønster, man ikke kan se, er ikke et mønster. Og to hold i samme liga,
  // der er umulige at skelne, er værre end én forkert farve.
  console.log('\nLæsbarhed — WCAG-kontrast:\n');
  const primaer = new Map([...maalt].map(([n, f]) => [n, f[0].hex]));
  const par = [...primaer].sort((a, b) => (a[1] < b[1] ? -1 : 1));
  const naere = [];
  for (let i = 0; i < par.length; i += 1) {
    for (let j = i + 1; j < par.length; j += 1) {
      const k = kontrast(par[i][1], par[j][1]);
      if (k < 1.5) naere.push([par[i][0], par[j][0], k]);
    }
  }
  naere.sort((a, b) => a[2] - b[2]);
  for (const [a, b, k] of naere) console.log(`  ${k.toFixed(2)}:1   ${a} / ${b}`);
  // Her stod, at "kortkoden står ved siden af badgen på alle fem brugssteder,
  // så identifikation hviler aldrig på farven alene". Kortkoden er væk (#132):
  // spillerne kunne ikke tyde forkortelserne. Argumentet holder alligevel —
  // bedre end før — fordi det, der erstattede koden, er selve HOLDNAVNET
  // skrevet fuldt ud. Men det er nu navnet, ikke koden, der bærer det.
  console.log('\n  Holdnavnet står ved siden af badgen, så identifikation');
  console.log('  hviler aldrig på farven alene. (Kortkoden forsvandt i #132.)');
}
console.log();
