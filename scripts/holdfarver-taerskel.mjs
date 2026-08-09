// ---------------------------------------------------------------------------
// scripts/holdfarver-taerskel.mjs — HVORFOR FARVETÆRSKLEN ER 40.
//
// `flader()` i holdfarver-wikipedia.mjs lægger nærtbeslægtede nuancer sammen,
// før den vælger trøjens farver. Tærsklen for "nærtbeslægtet" er en bar
// konstant, og den afgør, om en trøje bliver stribet eller ensfarvet. Den skal
// derfor kunne efterprøves, ikke bare påstås.
//
// Det her script kører tærsklen igennem ti trøjer med kendt facit og tæller,
// hvor mange den rammer.
//
// BRUG:
//   node scripts/holdfarver-taerskel.mjs
//
// Grafikkerne hentes fra Commons én gang og caches i scripts/.kit-cache/
// (gitignoreret). Kørslen er derefter offline og deterministisk.
//
// RESULTATET, der satte tærsklen:
//
//     40  → 9/10   kun Bournemouth forkert
//     56  → 8/10   Forest mister sine bøjler
//     88  → 8/10   Bournemouth reddet, men Forest OG Man City forkerte
//     100 → 8/10   samme
//     120 → 8/10   samme
//
// INGEN TÆRSKEL NÅR 10/10, og det er ikke tilfældigt. Bournemouths tre røde
// kræver ≥ 88 for at blive lagt sammen; Forests to designrøde (#D70926 og
// #F30310) ligger kun 56 fra hinanden og skal holdes adskilt. Kravene
// modsiger hinanden. Man City vipper ved 103.
//
// Derfor står Bournemouth i HAANDSAT i stedet for at tærsklen trimmes til den.
//
// KANT-EROSION blev prøvet som alternativ: kast de pixels væk, der ligger på
// en grænse mellem to flader — dér bor kantudjævningen — og klyng så stramt.
// Det giver 6/10. Tyndstribede trøjer er næsten udelukkende kant (Coventry
// mister 70 % af sine pixels, Newcastle 78 %, Leeds 84 %), så metoden ødelægger
// netop de trøjer, hele øvelsen handler om. Kør med --erosion for at se det.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { flader, troejefarver, pixels } from './holdfarver-wikipedia.mjs';

const HER = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(HER, '.kit-cache');
const UA = 'VejleaaTip/1.0 (hobby-tippespil; https://tip.vejleaa.dk)';

// Ti trøjer med facit fra klubbernes egne butikker. Blandingen er med vilje:
// fem mønstrede og fem ensfarvede, så en tærskel ikke kan score højt ved bare
// at kalde alt det ene eller det andet.
const FACIT = {
  _bournemouth2627h: ['mønstret', 'rød med sorte striber'],
  _nottingham2627h: ['mønstret', 'rød med bøjler'],
  _newcastle2627h: ['mønstret', 'hvid med sorte striber'],
  _coventry2627h: ['mønstret', 'himmelblå med hvide striber'],
  _brentford2627h: ['mønstret', 'rød med hvide striber'],
  _sunderland2627h: ['mønstret', 'rød med hvide striber'],
  _hull2627h: ['mønstret', 'ravgul med sorte striber'],
  _mancity2627h: ['ensfarvet', 'himmelblå'],
  _leeds2627h: ['ensfarvet', 'hvid — pinstriberne er for tynde til at tælle'],
  _arsenal2627h: ['ensfarvet', 'rød'],
};

async function grafik(moenster) {
  mkdirSync(CACHE, { recursive: true });
  const fil = resolve(CACHE, `${moenster}.png`);
  if (existsSync(fil)) return readFileSync(fil);
  const titel = `File:Kit_body_${moenster.replace(/^_/, '')}.png`;
  const api = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(titel)}`;
  const svar = await fetch(api, { headers: { 'User-Agent': UA } });
  const side = Object.values((await svar.json()).query.pages)[0];
  if (!side.imageinfo) throw new Error(`ingen grafik for ${moenster}`);
  const png = await fetch(side.imageinfo[0].url, { headers: { 'User-Agent': UA } });
  const buf = Buffer.from(await png.arrayBuffer());
  writeFileSync(fil, buf);
  await new Promise((r) => { setTimeout(r, 400); });
  return buf;
}

// Afkoderen genbruges fra scriptet selv frem for en kopi. En kopi ville kunne
// drive fra originalen, og så målte harnesset noget andet end koden.

/** Kast pixels på en farvegrænse væk — dér bor kantudjævningen. */
function erosion(px, bredde, graense = 30) {
  const kort = new Map();
  for (const p of px) kort.set(p.y * bredde + p.x, p);
  const langt = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > graense;
  return px.filter((p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => {
    const n = kort.get((p.y + dy) * bredde + (p.x + dx));
    return !n || !langt(p, n);
  }));
}

/** Trøjens form ud fra flader — samme regel som troejefarver(), uden felterne. */
function form(fl) {
  const t = troejefarver({}, 1, { flader: fl, px: [] });
  return t.moenster === 'ensfarvet' ? 'ensfarvet' : 'mønstret';
}

const medErosion = process.argv.includes('--erosion');
const grafikker = new Map();
for (const navn of Object.keys(FACIT)) grafikker.set(navn, pixels(await grafik(navn)));

const navne = [...grafikker.keys()];
console.log(`\n${medErosion ? 'MED kant-erosion' : 'UDEN erosion'} — tærskel mod facit\n`);
console.log('tærskel  '.padEnd(9) + navne.map((n) => n.replace(/^_|2627h$/g, '').slice(0, 6).padEnd(8)).join(''));

for (const a of medErosion ? [20, 30, 40, 56] : [40, 56, 88, 100, 120]) {
  let ramt = 0;
  const celler = navne.map((n) => {
    const g = grafikker.get(n);
    const px = medErosion ? erosion(g.px, g.bredde) : g.px;
    const svar = form(flader(px, a));
    const ok = svar === FACIT[n][0];
    if (ok) ramt += 1;
    return `${ok ? '✓' : '✗'}${svar.slice(0, 6)}`.padEnd(8);
  });
  console.log(String(a).padEnd(9) + celler.join('') + `  ${ramt}/10`);
}

console.log('\nFacit:');
for (const [n, [f, hvorfor]] of Object.entries(FACIT)) {
  console.log(`  ${n.replace(/^_|2627h$/g, '').padEnd(14)} ${f.padEnd(10)} ${hvorfor}`);
}
console.log();
