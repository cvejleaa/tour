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

/** Alle synlige pixels som {r,g,b}. Gennemsigtigt tæller ikke med. */
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
    ud2.push({ r, g, b });
  }
  return ud2;
}

/**
 * Læg nærtbeslægtede nuancer sammen og returnér de største flader.
 *
 * Kantudjævning giver et hav af nuancer, der IKKE er trøjefarver: Newcastles
 * grafik har 20 distinkte farver, men kun to trøjefarver. Uden sammenlægning
 * ville #FFFFFF (26,6 %) slå #101010 (11,2 %) — og en sort/hvid-stribet trøje
 * ville stå som hvid, fordi sort var delt over tre nuancer.
 */
function flader(px, afstand = 40) {
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

// --- Wikipedia -------------------------------------------------------------

async function infoboks(titel) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(titel)}&prop=wikitext&section=0&format=json&formatversion=2`;
  const j = await (await hent(url)).json();
  if (j.error) throw new Error(`Wikipedia: ${j.error.info} (${titel})`);
  const w = j.parse?.wikitext;
  if (!w) throw new Error(`ingen wikitekst for "${titel}"`);
  const felter = {};
  for (const linje of w.split('\n')) {
    const m = linje.match(/^\s*\|\s*(pattern_b[123]|body[123]|leftarm[123])\s*=\s*(\S*)\s*$/);
    if (m) felter[m[1]] = m[2];
  }
  return felter;
}

async function moensterFarver(moenster) {
  const fil = `File:Kit_body_${moenster.replace(/^_/, '')}.png`;
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(fil)}&prop=imageinfo&iiprop=url&format=json&formatversion=2`;
  const j = await (await hent(url)).json();
  const side = j.query?.pages?.[0];
  const billede = side?.imageinfo?.[0]?.url;
  if (!billede) return null; // mønstret findes ikke som fil — falder tilbage på body
  const buf = Buffer.from(await (await hent(billede)).arrayBuffer());
  return flader(pixels(buf));
}

const nulstil = (v) => (v && /^[0-9A-Fa-f]{6}$/.test(v) ? `#${v.toUpperCase()}` : null);

/**
 * Trøjens farver: {primaer, sekundaer, striber}.
 *
 * `striber` betyder her "to farver deler trøjen nogenlunde ligeligt" — det
 * dækker striber, halve og bøjler under ét. Vi skelner dem ikke: badgen har
 * 22 pixels at gøre det i, og forskellen ville ikke kunne ses.
 */
function troejefarver(felter, n, moenstret) {
  const bund = nulstil(felter[`body${n}`]) || nulstil(felter[`leftarm${n}`]);
  if (!moenstret || moenstret.length === 0) {
    return { primaer: bund, sekundaer: null, striber: false, kilde: 'body' };
  }
  const store = moenstret.filter((f) => f.andel >= 0.12);
  if (store.length === 0) return { primaer: bund, sekundaer: null, striber: false, kilde: 'body (mønster uden flader)' };

  // DEN STØRSTE FLADE ER IKKE KLUBBENS FARVE. Første udgave valgte den, og
  // resultatet var forkert på fire hold: Coventry (himmelblå) blev HVID,
  // ligesom Crystal Palace, Sunderland og Newcastle. På en stribet trøje er de
  // to farver næsten lige store, så et par pixels afgjorde valget — og hvide
  // ærmer eller felter vandt over klubbens egen farve.
  //
  // Blandt de STORE flader vælges derfor den mest mættede: himmelblå slår
  // hvid, rød slår hvid. Er ingen af dem mættet — en ægte sort/hvid trøje som
  // Newcastles — falder vi tilbage på den største, og så bærer `striber` og
  // sekundærfarven resten af sandheden.
  // KROMINANS, ikke HSL-mætning. Mætningen har en lillebitte nævner tæt på
  // hvid, så #F7FCFF — praktisk talt hvid — får mætning 0,97 og slog Man Citys
  // himmelblå. Krominans (maks − min) skelner rent: hvid 0,03, himmelblå 0,31.
  const krominans = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  const sorteret = [...store].sort((x, y) => krominans(y.hex) - krominans(x.hex));
  const primaerFlade = krominans(sorteret[0].hex) >= 0.15 ? sorteret[0] : store[0];
  // Sekundær = den største flade, der IKKE er den primære. To store flader,
  // hvor den mindste fylder mindst halvdelen af den største, betyder tofarvet
  // trøje — striber, halve eller bøjler — og ikke en ensfarvet med et mærke.
  const anden = store.find((f) => f !== primaerFlade);
  const tofarvet = !!anden && anden.andel >= primaerFlade.andel * 0.5;
  return {
    primaer: primaerFlade.hex,
    sekundaer: tofarvet ? anden.hex : null,
    striber: tofarvet,
    kilde: 'mønster',
  };
}

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
    if (m) { flad = await moensterFarver(m); await sov(PAUSE_MS); }
    troejer[n] = troejefarver(felter, n, flad);
  }
  fund.push({ navn, troejer });

  const h = troejer[1];
  const striber = h.striber ? `  striber ${h.primaer}/${h.sekundaer}` : '';
  console.log(`  ${navn.padEnd(28)} hjemme ${String(h.primaer).padEnd(8)} ude ${String(troejer[2].primaer).padEnd(8)} 3. ${String(troejer[3].primaer).padEnd(8)}${striber}`);
}

// Sammenlign med det, der står i filen i dag.
console.log('\nForskelle fra holdfilen:\n');
let aendringer = 0;
for (const { navn, troejer } of fund) {
  const raekke = kilde.split('\n').find((l) => l.includes(`name: '${navn}'`));
  const nu = {
    color: raekke?.match(/ color: '(#[0-9A-F]{6})'/)?.[1],
    awayColor: raekke?.match(/ awayColor: '(#[0-9A-F]{6})'/)?.[1],
    thirdColor: raekke?.match(/ thirdColor: '(#[0-9A-F]{6})'/)?.[1],
  };
  const ny = { color: troejer[1].primaer, awayColor: troejer[2].primaer, thirdColor: troejer[3].primaer };
  for (const felt of ['color', 'awayColor', 'thirdColor']) {
    if (ny[felt] && nu[felt] && ny[felt] !== nu[felt]) {
      console.log(`  ${navn.padEnd(28)} ${felt.padEnd(11)} ${nu[felt]} → ${ny[felt]}`);
      aendringer += 1;
    }
  }
}
console.log(`\n${aendringer} farver ville ændre sig.`);

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
  saet('color', troejer[1].primaer);
  saet('awayColor', troejer[2].primaer);
  saet('thirdColor', troejer[3].primaer);
  ud = ud.replace(linje, ny);
}
writeFileSync(HOLDFIL, ud);
console.log(`\n✅ ${HOLDFIL} opdateret. Se ændringerne med git diff.\n`);
