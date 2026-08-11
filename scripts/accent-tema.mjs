// ---------------------------------------------------------------------------
// scripts/accent-tema.mjs — MÅL ALLE ACCENT-TEMAER I BEGGE BASISTEMAER.
//
// "Et tal uden kode er en påstand." Temaernes kontrasttal blev før slet ikke
// målt: theme.css havde 23 håndskrevne rækker, og den eneste test målte to tal,
// stylesheetet ikke brugte. Det her script kører `accentTema` over
//
//   · de 23 Tour-hold i src/data/teamThemes.js
//   · alle Superliga-hold
//   · alle Premier League-hold
//   · appens egen grønne standardfarve
//
// i BÅDE lyst og mørkt tema, og fejler (exit 1) hvis ét eneste krav i
// `temaFund` falder. Kravene ligger i src/lib/accentTema.js, så harness og
// testsuite ikke kan stå med hver sin bar.
//
// Kørsel:
//   node scripts/accent-tema.mjs            # tabel + samlet dom
//   node scripts/accent-tema.mjs --foer     # samme tal for de GAMLE, håndholdte
//                                           # temaer, så forskellen kan ses
// ---------------------------------------------------------------------------

import { SUPERLIGA_TEAMS_2026 } from '../src/data/superligaTeams2026.js';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../src/data/premierLeagueTeams2026.js';
import { TEAM_THEMES } from '../src/data/teamThemes.js';
import { accentTema, temaFund, SIDEFLADER, KULOER_GULV } from '../src/lib/accentTema.js';
import { kontrast, kuloer } from '../src/lib/contrastText.js';

const foer = process.argv.includes('--foer');

/** Klubfarven for et hold: første kulørte i rækken hjemme → ude → tredje. */
function klubfarve(t) {
  for (const f of [t.color, t.awayColor, t.thirdColor]) {
    if (f && kuloer(f) >= KULOER_GULV) return f;
  }
  return null;
}

/**
 * DE GAMLE TAL, AFSKREVET FRA `[data-team]`-BLOKKEN i theme.css, som den stod
 * før c099d0d. Værdierne står her og ikke i datafilen, netop fordi de var en
 * KOPI: `--c-pitch-dark` var håndblandet pr. hold, og `--c-on-pitch` var sat i
 * øjemål til '#fff' eller '#111'. Weak/tint fandtes slet ikke og faldt tilbage
 * på #eef7f1. `--foer` måler præcis dét, så forskellen kan ses, ikke påstås.
 */
const GAMLE_TEMAER = {
  alpecin: ['#C8102E', '#9c0c23', '#ffffff'],
  bahrain: ['#E30613', '#b1040f', '#ffffff'],
  cajarural: ['#009639', '#00702b', '#ffffff'],
  cofidis: ['#E2001A', '#b10014', '#ffffff'],
  decathlon: ['#0082C3', '#006497', '#ffffff'],
  ef: ['#FF0098', '#c40076', '#ffffff'],
  groupama: ['#003DA5', '#002d7a', '#ffffff'],
  jayco: ['#00B0B9', '#008990', '#10151b'],
  lotto: ['#E30613', '#b1040f', '#ffffff'],
  lidltrek: ['#0050AA', '#003c80', '#ffffff'],
  movistar: ['#0033A0', '#002677', '#ffffff'],
  netcompany: ['#DA291C', '#a91f15', '#ffffff'],
  nsn: ['#2B3A67', '#1f2b4d', '#ffffff'],
  pinarello: ['#00B7C4', '#008f99', '#10151b'],
  redbull: ['#122E5C', '#0c2042', '#ffffff'],
  soudal: ['#0E1A7B', '#0a1259', '#ffffff'],
  total: ['#ED1C24', '#bd141b', '#ffffff'],
  picnic: ['#E2001A', '#b10014', '#ffffff'],
  tudor: ['#1A1A1A', '#000000', '#ffffff'],
  visma: ['#FFE500', '#d6c000', '#10151b'],
  uae: ['#E4002B', '#b10021', '#ffffff'],
  unox: ['#ED1C45', '#c01334', '#ffffff'],
  astana: ['#009DDC', '#0079aa', '#10151b'],
};

function gammeltTema(key) {
  const [pitch, pitchDark, onPitch] = GAMLE_TEMAER[key];
  return { pitch, pitchDark, onPitch, pitchWeak: '#eef7f1', pitchTint: '#eef7f1' };
}

const raekker = [];
let faldne = 0;

function maal(gruppe, navn, farve, gammel) {
  if (!farve) {
    raekker.push({ gruppe, navn, note: 'INGEN KULØR — spillet beholder app-grøn' });
    return;
  }
  for (const mode of ['lyst', 'moerkt']) {
    const tema = gammel ?? accentTema(farve, mode);
    const fund = temaFund(tema, mode);
    if (fund.length) faldne += 1;
    const f = SIDEFLADER[mode];
    raekker.push({
      gruppe,
      navn,
      mode,
      ind: farve,
      pitch: tema.pitch,
      blaek: kontrast(tema.pitch, f.haardeste),
      paaFlade: kontrast(tema.onPitch, tema.pitch),
      paaHover: kontrast(tema.onPitch, tema.pitchDark),
      modSide: kontrast(tema.pitch, f.baggrund),
      fund,
    });
  }
}

maal('app', 'Standard (grøn)', '#0b6e4f', null);
for (const t of TEAM_THEMES) {
  maal('tour', t.label, t.primary, foer ? gammeltTema(t.key) : null);
}
for (const t of SUPERLIGA_TEAMS_2026) maal('superliga', t.name, klubfarve(t), null);
for (const t of PREMIER_LEAGUE_TEAMS_2026) maal('premierleague', t.name, klubfarve(t), null);

const n = (x) => x.toFixed(2).padStart(6);
let sidsteGruppe = '';
for (const r of raekker) {
  if (r.gruppe !== sidsteGruppe) {
    console.log(`\n── ${r.gruppe.toUpperCase()} ${'─'.repeat(72 - r.gruppe.length)}`);
    console.log(`${'hold'.padEnd(26)}${'tema'.padEnd(8)}${'ind'.padEnd(9)}${'pitch'.padEnd(9)}  blæk  flade  hover   side`);
    sidsteGruppe = r.gruppe;
  }
  if (r.note) {
    console.log(`${r.navn.padEnd(26)}${r.note}`);
    continue;
  }
  const linje = `${r.navn.padEnd(26)}${r.mode.padEnd(8)}${r.ind.padEnd(9)}${r.pitch.padEnd(9)}`
    + `${n(r.blaek)} ${n(r.paaFlade)} ${n(r.paaHover)} ${n(r.modSide)}`;
  console.log(r.fund.length ? `${linje}   ✗ ${r.fund.join('; ')}` : linje);
}

const talte = raekker.filter((r) => !r.note).length;
console.log(`\n${talte} målinger, ${faldne} faldt.`);
if (foer) {
  console.log('(--foer: de gamle, håndholdte tal. Kør uden flaget for de nye.)');
}
const uden = raekker.filter((r) => r.note).map((r) => r.navn);
if (uden.length) console.log(`Uden kulør i nogen trøje: ${uden.join(', ')}`);

if (faldne && !foer) {
  console.error('\nMindst ét tema falder. Se linjerne med ✗.');
  process.exit(1);
}
