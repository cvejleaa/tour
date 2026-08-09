// ---------------------------------------------------------------------------
// scripts/holdfarver-wikipedia.mjs — HVOR HOLDFARVERNE KOMMER FRA.
//
// Farverne i src/data/*Teams*.js stod uden proveniens: de var skrevet fra
// hukommelsen om klubbernes spilledragter. Elo-værdierne ved siden af har
// kilde, kalibrering og et script; farverne havde ingenting. Efter husets egen
// regel — "et tal uden kode er en påstand" — var de påstande.
//
// BRUG:
//   node scripts/holdfarver-wikipedia.mjs                 # rapport, skriver intet
//   node scripts/holdfarver-wikipedia.mjs --skriv         # opdaterer holdfilen
//   node scripts/holdfarver-wikipedia.mjs --hold Arsenal  # kun ét hold
//
// KILDEN er infoboksen i klubbens engelske Wikipedia-artikel, hvor
// {{Infobox football club}} angiver trøjen som pattern_b1/body1/leftarm1 osv.
// Teksten er CC BY-SA; vi udleder tal fra den og gengiver ikke indholdet.
//
// HVORFOR IKKE ET TRØJEFOTO. Et gennemsnit over et fotografi bærer lys, skygge
// og JPEG-artefakter — og går galt præcis dér, hvor vi har mest brug for
// hjælp: en stribet trøje bliver til mudder. Newcastle ville blive grå.
//
// HVORFOR IKKE BARE body1. Det var den fælde, jeg gik i først. Skabelonens
// farvefelt er BUNDfarven under mønsteret, ikke trøjens farve. Newcastles
// hjemmetrøje 2026/27 står som `body1 = FFFFFF` med mønsteret
// `_newcastle2627h` — en aflæsning af body1 alene ville give HVID for en
// sort/hvid-stribet trøje.
//
// LØSNINGEN er at læse selve mønster-grafikken. Den ligger på Commons som
// Kit_body_<mønster>.png: en lille, flad tegning uden lys og skygge, i
// klubbens egne farver. Målt på Newcastle giver den hvid ~27 % og tre
// nær-sorte nuancer ~27 % — altså de to rigtige farver, når kantudjævningen
// er lagt sammen.
// ---------------------------------------------------------------------------

import { inflateSync } from 'zlib';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOLDFIL = resolve(REPO, 'src/data/premierLeagueTeams2026.js');

// Wikipedia-titlerne kan IKKE gættes som "<navn> F.C.". Fire af de tyve bryder
// mønstret (AFC Bournemouth, Hull City A.F.C., Sunderland A.F.C., og Brighton
// staves med & på Wikipedia, men med "and" hos pulselive). En forkert titel
// giver en manglende side, og det skal være en hård fejl — ikke et hold, der
// tavst beholder sin gamle farve.
const ARTIKEL = {
  Arsenal: 'Arsenal F.C.',
  'Manchester City': 'Manchester City F.C.',
  'Aston Villa': 'Aston Villa F.C.',
  'Manchester United': 'Manchester United F.C.',
  Liverpool: 'Liverpool F.C.',
  Bournemouth: 'AFC Bournemouth',
  'Brighton and Hove Albion': 'Brighton & Hove Albion F.C.',
  'Newcastle United': 'Newcastle United F.C.',
  Brentford: 'Brentford F.C.',
  Chelsea: 'Chelsea F.C.',
  'Nottingham Forest': 'Nottingham Forest F.C.',
  Fulham: 'Fulham F.C.',
  Everton: 'Everton F.C.',
  'Crystal Palace': 'Crystal Palace F.C.',
  'Leeds United': 'Leeds United F.C.',
  'Tottenham Hotspur': 'Tottenham Hotspur F.C.',
  Sunderland: 'Sunderland A.F.C.',
  'Coventry City': 'Coventry City F.C.',
  'Ipswich Town': 'Ipswich Town F.C.',
  'Hull City': 'Hull City A.F.C.',
};

const UA = 'VejleaaTip/1.0 (hobby-tippespil; https://tip.vejleaa.dk)';
const PAUSE_MS = 400; // høflig hastighed mod Wikimedia — ~2,5 kald i sekundet

const sov = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function hent(url) {
  const svar = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!svar.ok) throw new Error(`${svar.status} ${svar.statusText} for ${url}`);
  return svar;
}

// --- PNG: nok til de flade trøje-grafikker ---------------------------------
//
// Bevidst minimal: 8 bit, ingen interlace. Rammer vi noget andet, KASTER vi i
// stedet for at gætte — en halvt afkodet trøje ville give en farve, der ser
// rigtig ud og ikke er det.
function afkodPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('ikke en PNG');
  let p = 8; let ihdr = null; const idat = []; let plte = null; let trns = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        w: data.readUInt32BE(0),
        h: data.readUInt32BE(4),
        dybde: data[8],
        farvetype: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!ihdr) throw new Error('PNG uden IHDR');
  if (ihdr.dybde !== 8 || ihdr.interlace !== 0) {
    throw new Error(`uunderstøttet PNG (dybde ${ihdr.dybde}, interlace ${ihdr.interlace})`);
  }
  const kanaler = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.farvetype];
  if (!kanaler) throw new Error(`ukendt farvetype ${ihdr.farvetype}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = ihdr.w * kanaler;
  const ud = Buffer.alloc(ihdr.h * stride);
  let q = 0;
  for (let y = 0; y < ihdr.h; y += 1) {
    const filter = raw[q]; q += 1;
    const linje = raw.subarray(q, q + stride); q += stride;
    const forrige = y > 0 ? ud.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const nu = ud.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= kanaler ? nu[x - kanaler] : 0;
      const b = forrige[x];
      const c = x >= kanaler ? forrige[x - kanaler] : 0;
      let v = linje[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      nu[x] = v & 0xff;
    }
  }
  return { ihdr, ud, kanaler, plte, trns };
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Alle synlige pixels som {x,y,r,g,b}. Gennemsigtigt tæller ikke med. */
function pixels(buf) {
  const {
    ihdr, ud, kanaler, plte, trns,
  } = afkodPng(buf);
  const ud2 = [];
  for (let i = 0; i < ihdr.w * ihdr.h; i += 1) {
    const o = i * kanaler;
    let r; let g; let b; let a = 255;
    if (ihdr.farvetype === 6) { r = ud[o]; g = ud[o + 1]; b = ud[o + 2]; a = ud[o + 3]; } else if (ihdr.farvetype === 2) { r = ud[o]; g = ud[o + 1]; b = ud[o + 2]; } else if (ihdr.farvetype === 3) {
      const idx = ud[o];
      r = plte[idx * 3]; g = plte[idx * 3 + 1]; b = plte[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    } else { r = ud[o]; g = r; b = r; if (kanaler === 2) a = ud[o + 1]; }
    if (a < 200) continue;
    ud2.push({ x: i % ihdr.w, y: Math.floor(i / ihdr.w), r, g, b });
  }
  return { px: ud2, bredde: ihdr.w, hoejde: ihdr.h };
}

/**
 * Læg nærtbeslægtede nuancer sammen og returnér de største flader.
 *
 * Kantudjævning giver et hav af nuancer, der IKKE er trøjefarver: Newcastles
 * grafik har 20 distinkte farver, men kun to trøjefarver. Uden sammenlægning
 * ville #FFFFFF (26,6 %) slå #101010 (11,2 %) — og en sort/hvid-stribet trøje
 * ville stå som hvid, fordi sort var delt over tre nuancer.
 */
// AFSTANDEN VAR 40, OG DET VAR FOR STRAMT. Bournemouths røde er delt over tre
// nuancer (#FF2C2C 13,7 %, #FF0000 9,0 %, #F30000 5,1 %), og afstanden mellem
// de to første er 88. De blev aldrig lagt sammen, så sort vandt med 53,6 %,
// ingen anden flade nåede halvdelen, og en rød/sort stribet trøje blev erklæret
// ensfarvet sort. Præcis samme fælde som Newcastles sorte, bare med rød.
//
// 100 lægger nuancer af samme farve sammen uden at blande farver: rød mod sort
// er 255, himmelblå mod hvid 363, og Leeds' bleggule pinstriber mod hvid 129 —
// alle langt over.
function flader(px, afstand = 100) {
  const klynger = [];
  for (const { r, g, b } of px) {
    let fundet = null;
    for (const k of klynger) {
      if (Math.abs(k.r - r) + Math.abs(k.g - g) + Math.abs(k.b - b) <= afstand) { fundet = k; break; }
    }
    if (fundet) {
      fundet.sum.r += r; fundet.sum.g += g; fundet.sum.b += b; fundet.n += 1;
      fundet.r = Math.round(fundet.sum.r / fundet.n);
      fundet.g = Math.round(fundet.sum.g / fundet.n);
      fundet.b = Math.round(fundet.sum.b / fundet.n);
    } else {
      klynger.push({
        r, g, b, n: 1, sum: { r, g, b },
      });
    }
  }
  const ialt = px.length || 1;
  return klynger
    .sort((a, b) => b.n - a.n)
    .map((k) => ({ hex: hex(k.r, k.g, k.b), andel: k.n / ialt }));
}

/**
 * HVILKET MØNSTER er det — striber, bøjler eller halvering?
 *
 * Mønsterets NAVN siger det ikke: Commons kalder filen `_newcastle2627h`, ikke
 * `_stripes`. Uden denne måling ville en tegnet stribe være en påstand, og
 * Crystal Palace og Aston Villa — der har bøjler — ville stå stribede.
 *
 * Grafikken ved det derimod. Lodrette striber skifter farve hen ad x og er
 * konstante ned ad y; bøjler er omvendt; en halvering skifter én gang.
 * Vi tæller altså skift langs hver akse mellem de to hovedfarver.
 */
function moenstertype(px, a, b) {
  const naer = (p, hexfarve) => {
    const r = parseInt(hexfarve.slice(1, 3), 16);
    const g = parseInt(hexfarve.slice(3, 5), 16);
    const bl = parseInt(hexfarve.slice(5, 7), 16);
    return Math.abs(p.r - r) + Math.abs(p.g - g) + Math.abs(p.b - bl);
  };
  const dominerende = (gruppe) => {
    let na = 0; let nb = 0;
    for (const p of gruppe) { if (naer(p, a) <= naer(p, b)) na += 1; else nb += 1; }
    // Blandede kolonner (kanter, mærker) tæller ikke som en farve.
    if (na + nb < 3) return null;
    return na > nb * 1.5 ? 'a' : (nb > na * 1.5 ? 'b' : null);
  };
  const skift = (akse) => {
    const grupper = new Map();
    for (const p of px) {
      const k = p[akse];
      if (!grupper.has(k)) grupper.set(k, []);
      grupper.get(k).push(p);
    }
    const raekke = [...grupper.keys()].sort((u, v) => u - v).map((k) => dominerende(grupper.get(k)));
    let n = 0; let sidste = null;
    for (const v of raekke) {
      if (v == null) continue;
      if (sidste != null && v !== sidste) n += 1;
      sidste = v;
    }
    return n;
  };
  const vandret = skift('x');
  const lodret = skift('y');
  if (vandret >= 3 && vandret > lodret) return { type: 'striber', baand: vandret + 1 };
  if (lodret >= 3 && lodret > vandret) return { type: 'boejler', baand: lodret + 1 };
  if (vandret === 1 && lodret === 0) return { type: 'halveret', baand: 2 };
  if (lodret === 1 && vandret === 0) return { type: 'vandret-delt', baand: 2 };
  return { type: 'ukendt', baand: 0, vandret, lodret };
}

// --- Wikipedia -------------------------------------------------------------

async function infoboks(titel) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(titel)}&prop=wikitext&section=0&format=json&formatversion=2`;
  const j = await (await hent(url)).json();
  if (j.error) throw new Error(`Wikipedia: ${j.error.info} (${titel})`);
  const w = j.parse?.wikitext;
  if (!w) throw new Error(`ingen wikitekst for "${titel}"`);
  const felter = {};
  for (const linje of w.split('\n')) {
    const m = linje.match(/^\s*\|\s*(pattern_b[123]|pattern_la[123]|body[123]|leftarm[123])\s*=\s*(\S*)\s*$/);
    if (m) felter[m[1]] = m[2];
  }
  return felter;
}

async function moensterFarver(moenster, del = 'body') {
  const fil = `File:Kit_${del}_${moenster.replace(/^_/, '')}.png`;
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(fil)}&prop=imageinfo&iiprop=url&format=json&formatversion=2`;
  const j = await (await hent(url)).json();
  const side = j.query?.pages?.[0];
  const billede = side?.imageinfo?.[0]?.url;
  if (!billede) return null; // mønstret findes ikke som fil — falder tilbage på body
  const buf = Buffer.from(await (await hent(billede)).arrayBuffer());
  const { px } = pixels(buf);
  return { flader: flader(px), px };
}

const nulstil = (v) => (v && /^[0-9A-Fa-f]{6}$/.test(v) ? `#${v.toUpperCase()}` : null);

/**
 * Trøjens farver: {primaer, sekundaer, striber}.
 *
 * `striber` betyder her "to farver deler trøjen nogenlunde ligeligt" — det
 * dækker striber, halve og bøjler under ét. Vi skelner dem ikke: badgen har
 * 22 pixels at gøre det i, og forskellen ville ikke kunne ses.
 */
function aermefarve(felter, n) {
  // ÆRMET LÆSES AF FELTET, ikke af grafikken — modsat kroppen.
  //
  // Det er den spejlvendte fælde: kroppens mønster-PNG maler HELE trøjen, så
  // body1 er bundfarven og ubrugelig på en stribet trøje. Ærmets mønster-PNG
  // maler derimod kun kanter og mærker, mens ærmets egen farve kommer fra
  // leftarm — så en aflæsning af grafikken gav HVIDE ærmer på alle tyve hold,
  // også Chelsea og Everton.
  //
  // Kontrollen er Arsenal: leftarm1 = FFFFFF, body1 = F00000. Feltet giver
  // altså røde trøjer med hvide ærmer, som det skal være, og Chelsea får
  // leftarm1 = 14349B — blå.
  return nulstil(felter[`leftarm${n}`]);
}

function troejefarver(felter, n, moenstret) {
  const bund = nulstil(felter[`body${n}`]) || nulstil(felter[`leftarm${n}`]);
  if (!moenstret || !moenstret.flader || moenstret.flader.length === 0) {
    return {
      primaer: bund, sekundaer: null, moenster: 'ensfarvet', baand: 0, kilde: 'body',
    };
  }
  const store = moenstret.flader.filter((f) => f.andel >= 0.12);
  if (store.length === 0) {
    return {
      primaer: bund, sekundaer: null, moenster: 'ensfarvet', baand: 0, kilde: 'body (mønster uden flader)',
    };
  }

  // HVILKEN AF DE TO FLADER ER KLUBBENS FARVE?
  //
  // Rækkefølgen er afgørende, og jeg fik den forkert to gange:
  //
  //  1. "Største flade" gjorde Coventry HVID. På en stribet trøje er de to
  //     farver næsten lige store, så et par pixels afgjorde det.
  //  2. "Mest mættede flade" gjorde Leeds BLEGGUL. Deres hjemmetrøje er hvid
  //     med meget tynde gule tværstriber, og en accent slog selve trøjen.
  //
  // Løsningen er at spørge i den rigtige orden: er trøjen overhovedet
  // TOFARVET? Leeds' pinstriber er så tynde, at de ikke når over tærsklen —
  // trøjen er ensfarvet, og så vinder den største flade. Coventrys himmelblå
  // fylder derimod nok til at være en af to trøjefarver, og først DÉR vælger
  // krominans mellem dem: himmelblå slår hvid, rød slår hvid.
  //
  // Er ingen af de to mættet — en ægte sort/hvid trøje som Newcastles —
  // falder vi tilbage på den største, og mønsteret bærer resten af sandheden.
  const krominans = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  // Tofarvet = to store flader, hvor den mindste fylder mindst halvdelen af
  // den største. Ellers er det en ensfarvet trøje med et mærke eller en kant.
  const tofarvet = store.length >= 2 && store[1].andel >= store[0].andel * 0.5;
  if (!tofarvet) {
    return {
      primaer: store[0].hex, sekundaer: null, moenster: 'ensfarvet', baand: 0, kilde: 'mønster',
    };
  }
  const [x, y] = [store[0], store[1]];
  const primaerFlade = krominans(y.hex) >= 0.15 && krominans(y.hex) > krominans(x.hex) ? y : x;
  const anden = primaerFlade === x ? y : x;

  const m = moenstertype(moenstret.px, primaerFlade.hex, anden.hex);
  return {
    primaer: primaerFlade.hex,
    sekundaer: anden.hex,
    moenster: m.type,
    baand: m.baand,
    kilde: 'mønster',
  };
}

// --- trøjer, kilden ikke kan ------------------------------------------------
//
// Fire trøjer er sat i hånden, fordi Wikipedia enten mangler dem eller giver
// et forkert svar. De skal IKKE overskrives af en ny kørsel.
//
// I dag overlever de kun ved et TILFÆLDE: skrivningen rører kun `troejer`, når
// den har noget nyt at lægge i feltet, så Fulhams tern står urørt, fordi
// hjemmetrøjens ærme filtreres væk som støj. Ændrer én pixel i ærmet det, får
// Fulham et nyt `troejer`-felt uden tern — uden en fejl og uden en linje i
// rapporten. Derfor står de her ved navn i stedet.
//
// Nøglen er trøjenummeret: 1 = hjemme/color, 2 = ude/awayColor, 3 = tredje.
const HAANDSAT = {
  'Aston Villa': {
    2: 'udetrøjen står tom i infoboksen; 2025-26 ført videre fra avfc.co.uk, til den nye lander',
  },
  'Leeds United': {
    3: 'tredjetrøjen står tom i infoboksen; sort ifølge klubbutikken, sættes i admin',
  },
  Fulham: {
    1: 'sorte ærmer på hvid krop — leftarm1 er FFFFFF som body1, så ærmet blev filtreret væk som støj',
    2: 'rød/sort ternet — mønster-målingen tæller skift langs én akse og kaldte trøjen bøjlet',
  },
};

const haandsat = (navn, n) => HAANDSAT[navn]?.[n] || null;

// --- kørsel ----------------------------------------------------------------

const args = process.argv.slice(2);
const skriv = args.includes('--skriv');
const kunHold = args.includes('--hold') ? args[args.indexOf('--hold') + 1] : null;

const kilde = readFileSync(HOLDFIL, 'utf8');
const navne = [...kilde.matchAll(/\{ name: '([^']+)'/g)].map((m) => m[1]);
const hold = kunHold ? navne.filter((n) => n === kunHold) : navne;
if (hold.length === 0) throw new Error(`kender ikke holdet "${kunHold}"`);

console.log(`\nHenter trøjefarver for ${hold.length} hold fra Wikipedia...\n`);
const fund = [];
for (const navn of hold) {
  const titel = ARTIKEL[navn];
  if (!titel) throw new Error(`ingen Wikipedia-titel for "${navn}" — tilføj den i ARTIKEL`);
  const felter = await infoboks(titel);
  await sov(PAUSE_MS);

  const troejer = {};
  for (const n of [1, 2, 3]) {
    const m = felter[`pattern_b${n}`];
    let flad = null;
    if (m) { flad = await moensterFarver(m, 'body'); await sov(PAUSE_MS); }
    const t = troejefarver(felter, n, flad);

    t.aerme = aermefarve(felter, n);
    troejer[n] = t;
  }
  fund.push({ navn, troejer });

  const h = troejer[1];
  const striber = h.sekundaer ? `  ${h.moenster}(${h.baand}) ${h.primaer}/${h.sekundaer}` : '';
  const aerme = h.aerme && h.aerme !== h.primaer ? `  ærmer ${h.aerme}` : '';
  console.log(`  ${navn.padEnd(28)} hjemme ${String(h.primaer).padEnd(8)} ude ${String(troejer[2].primaer).padEnd(8)} 3. ${String(troejer[3].primaer).padEnd(8)}${striber}${aerme}`);
}

// Sammenlign med det, der står i filen i dag.
console.log('\nForskelle fra holdfilen:\n');
let aendringer = 0;
let sprunget = 0;
for (const { navn, troejer } of fund) {
  const raekke = kilde.split('\n').find((l) => l.includes(`name: '${navn}'`));
  const nu = {
    color: raekke?.match(/ color: '(#[0-9A-F]{6})'/)?.[1],
    awayColor: raekke?.match(/ awayColor: '(#[0-9A-F]{6})'/)?.[1],
    thirdColor: raekke?.match(/ thirdColor: '(#[0-9A-F]{6})'/)?.[1],
  };
  const ny = { color: troejer[1].primaer, awayColor: troejer[2].primaer, thirdColor: troejer[3].primaer };
  const nummer = { color: 1, awayColor: 2, thirdColor: 3 };
  for (const felt of ['color', 'awayColor', 'thirdColor']) {
    const grund = haandsat(navn, nummer[felt]);
    if (grund) {
      // Skal STÅ i rapporten. En håndsat trøje, der bare mangler, ligner en
      // trøje uden forskel — og så tror man, kilden er enig med hånden.
      console.log(`  ${navn.padEnd(28)} ${felt.padEnd(11)} håndsat, springes over — ${grund}`);
      sprunget += 1;
      continue;
    }
    if (ny[felt] && nu[felt] && ny[felt] !== nu[felt]) {
      console.log(`  ${navn.padEnd(28)} ${felt.padEnd(11)} ${nu[felt]} → ${ny[felt]}`);
      aendringer += 1;
    }
  }
}
console.log(`\n${aendringer} farver ville ændre sig, ${sprunget} står håndsat.`);

if (!skriv) {
  console.log('\nTør-kørsel — holdfilen er IKKE rørt. Kør igen med --skriv.\n');
  process.exit(0);
}

let ud = kilde;
for (const { navn, troejer } of fund) {
  const linje = ud.split('\n').find((l) => l.includes(`name: '${navn}'`));
  if (!linje) throw new Error(`fandt ikke linjen for "${navn}" i holdfilen`);
  let ny = linje;
  const saet = (felt, vaerdi) => {
    if (!vaerdi) return;
    // En erstatning, der ikke matcher, fejler TAVST og efterlader den gamle
    // farve bag en grøn kørsel. Derfor tjekkes hver enkelt.
    const re = new RegExp(`( ${felt}: ')(#[0-9A-F]{6})(')`);
    if (!re.test(ny)) throw new Error(`${navn}: fandt ikke feltet ${felt}`);
    ny = ny.replace(re, `$1${vaerdi}$3`);
  };
  if (!haandsat(navn, 1)) saet('color', troejer[1].primaer);
  if (!haandsat(navn, 2)) saet('awayColor', troejer[2].primaer);
  if (!haandsat(navn, 3)) saet('thirdColor', troejer[3].primaer);

  // TRØJENS FORM som ét nested felt frem for tolv nye kolonner. De tre
  // color-felter bliver stående som de er, så alt der læser dem i dag virker
  // uændret; `troejer` er additivt og kan mangle på et hold uden at noget går
  // i stykker.
  //
  // Kun det, der ADSKILLER sig, skrives: en ensfarvet trøje uden egen
  // ærmefarve fylder ingenting. Ellers ville tyve rækker vokse med data, der
  // bare gentager primærfarven.
  // "Forskellig" skal betyde SYNLIGT forskellig. Man Citys ærme står som
  // #98C6EB mod kroppens #A2CFF2 — samme himmelblå, anden afrunding — og et
  // rent !==-tjek gjorde det til en oplysning. Samme afstand som farve-
  // klyngerne bruger: 40 i summeret kanalforskel.
  const langtFra = (x, y) => {
    if (!x || !y) return !!x;
    const kanal = (h, i) => parseInt(h.slice(i, i + 2), 16);
    return Math.abs(kanal(x, 1) - kanal(y, 1))
      + Math.abs(kanal(x, 3) - kanal(y, 3))
      + Math.abs(kanal(x, 5) - kanal(y, 5)) > 40;
  };
  const del = (t) => {
    const d = {};
    if (langtFra(t.sekundaer, t.primaer)) d.sekundaer = t.sekundaer;
    if (t.moenster && t.moenster !== 'ensfarvet') d.moenster = t.moenster;
    if (langtFra(t.aerme, t.primaer)) d.aerme = t.aerme;
    return Object.keys(d).length ? d : null;
  };
  const troejeDele = { hjemme: del(troejer[1]), ude: del(troejer[2]), tredje: del(troejer[3]) };
  const brugte = Object.entries(troejeDele).filter(([, v]) => v);
  // ÉN HÅNDSAT TRØJE FREDER HELE `troejer`-FELTET for det hold. Feltet skrives
  // som én tekst, så en delvis opdatering ville skulle flette hånd og kilde
  // inde i strengen — og en flettefejl dér ser ud som en trøje, der bare
  // mistede sit mønster. Fulham har både sorte ærmer (hjemme) og tern (ude);
  // begge dele skal overleve, at tredjetrøjen en dag får en kant.
  if (HAANDSAT[navn]) {
    console.log(`  ${navn}: trøjeformen står håndsat — feltet røres ikke.`);
  } else if (brugte.length) {
    const tekst = brugte
      .map(([k, v]) => `${k}: { ${Object.entries(v).map(([f, w]) => `${f}: '${w}'`).join(', ')} }`)
      .join(', ');
    const felt = ` troejer: { ${tekst} },`;
    // Erstat et eksisterende troejer-felt, ellers indsæt før venue.
    if (/ troejer: \{[^}]*(\{[^}]*\}[^}]*)*\},/.test(ny)) {
      ny = ny.replace(/ troejer: \{.*\},(?= venue:)/, felt);
    } else if (ny.includes(' venue:')) {
      ny = ny.replace(' venue:', `${felt} venue:`);
    } else {
      throw new Error(`${navn}: hverken troejer- eller venue-felt at sætte trøjeformen ved`);
    }
  }
  ud = ud.replace(linje, ny);
}
writeFileSync(HOLDFIL, ud);
console.log(`\n✅ ${HOLDFIL} opdateret. Se ændringerne med git diff.\n`);
