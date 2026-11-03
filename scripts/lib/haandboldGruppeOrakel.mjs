// ---------------------------------------------------------------------------
// scripts/lib/haandboldGruppeOrakel.mjs — IHF's FÆRDIGE gruppetabeller fra
// VM-siderne på Wikipedia → orakel for gruppeStilling (src/lib/grupper.js).
//
// Rene funktioner; scripts/haandbold-gruppeorakel.mjs læser filerne og skriver
// scripts/testdata/ihf-gruppestillinger.json. Testet i
// haandboldGruppeOrakel.test.mjs.
//
// HVAD ORAKLET ER. For hver færdig tabel (`update=complete`) i den indledende
// runde og hovedrunden: IHF's slutrækkefølge (`team_order`) og tabellens egne
// tal (V/U/T/mål pr. hold). Rækkefølgen er facit; tallene er en KONTROL af,
// at kampene i scripts/haandbold-historik.json er præcis dem, tabellen er
// regnet af (inkl. de medførte kampe i hovedrunden).
//
// KUN VM (QC Q7). EHF's tiebreak er ikke IHF's, så en EM-side afvises ved
// navn — også selv om dens sektioner hedder det samme.
//
// KLASSIFICERET PÅ SEKTIONSSTIEN (QC Q5), aldrig på gruppenavnet: Presidents
// Cup har også «Group I» og «Group II». klassificer() er programbyggerens
// lukkede sæt; en tabel i en ukendt sektion vælter kørslen.
//
// HOLDNAVNE = historikkens. Tabellen nøgler på sin egen kode (`team_order=RHF`),
// men historikken bruger RUS for «Russian Handball Federation» (VM 2021). Hver
// kode oversættes via tabellens `name_KODE`-felt med samme parser og samme
// omkodning som historikken (parseHold, SAMME_HOLD), så de to aldrig kan tale
// om hvert sit hold.
//
// UDELADT, NAVNGIVET. En tabel, hvis tal ikke kan regnes af historikkens
// kampe, er ikke et orakel for vores regnemotor: VM 2021 gruppe A har to
// aflyste kampe (Kap Verde trak sig), som tabellen tæller som 10–0, men som
// historikken med rette afviser som walkovers. Den slags tabeller står under
// `udeladt` med grunden — aldrig i stilhed.
// ---------------------------------------------------------------------------

import { fjernKommentarer, overskrifter, sektionVed, delFelter, parseHold } from './wikiHandball.mjs';
import { klassificer } from './haandboldProgram.mjs';
import { SAMME_HOLD } from './haandboldHistorik.mjs';

/** Find skabelonens slut fra `start` ("{{"): indeks lige efter "}}", eller -1. */
function skabelonSlut(tekst, start) {
  let dybde = 0;
  for (let i = start; i < tekst.length - 1; i += 1) {
    const to = tekst.slice(i, i + 2);
    if (to === '{{') { dybde += 1; i += 1; } else if (to === '}}') {
      dybde -= 1; i += 1;
      if (dybde === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Alle {{#invoke:Sports table|main|…}} i teksten: felter + sektionssti.
 * @returns {Array<{sektion: string[], felter: Record<string,string>}>}
 */
export function findSportsTabeller(wikitekst) {
  const tekst = fjernKommentarer(wikitekst);
  const overs = overskrifter(tekst);
  const ud = [];
  const re = /\{\{\s*#invoke:\s*Sports table\s*\|/gi;
  let m;
  while ((m = re.exec(tekst))) {
    const slut = skabelonSlut(tekst, m.index);
    if (slut < 0) {
      const linje = tekst.slice(0, m.index).split('\n').length;
      throw new Error(`En Sports table ved linje ${linje} lukkes aldrig — siden er ufuldstændig. Intet er læst.`);
    }
    const felter = {};
    for (const l of delFelter(tekst.slice(m.index + 2, slut - 2)).slice(1)) {
      const i = l.indexOf('=');
      if (i < 0) continue; // «main» og lignende positionsled
      felter[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
    ud.push({ sektion: sektionVed(overs, m.index), felter });
    re.lastIndex = slut;
  }
  return ud;
}

/** Tabellens kode → historikkens holdkode, via `name_KODE`. Kaster ved en ukendt form. */
function historikKode(felter, kode, hvor) {
  const navn = felter[`name_${kode}`];
  if (navn === undefined) throw new Error(`${hvor}: team_order nævner ${kode}, men tabellen har intet name_${kode}.`);
  const h = parseHold(navn, `${hvor} name_${kode}: `);
  if (!h?.kode) throw new Error(`${hvor}: name_${kode} er ikke et hold («${navn}»).`);
  return SAMME_HOLD.get(h.kode) ?? h.kode;
}

const tal = (v, hvor) => {
  const n = Number(String(v ?? '').trim());
  if (!Number.isInteger(n) || n < 0) throw new Error(`${hvor}: «${v}» er ikke et tal.`);
  return n;
};

/**
 * Én sides færdige gruppetabeller (indledende + hovedrunde).
 * @param {string} wikitekst
 * @param {string} turnering 'vm2021' | 'vm2023' | 'vm2025' …
 * @returns {{tabeller: Array, ufaerdige: string[]}}
 */
export function laesGruppetabeller(wikitekst, turnering) {
  if (!/^vm\d{4}$/.test(turnering)) {
    throw new Error(`«${turnering}» er ikke et VM. Oraklet er kun IHF's tiebreak (QC Q7) — en EM-side afgøres efter EHF's.`);
  }
  const tabeller = [];
  const ufaerdige = [];
  for (const t of findSportsTabeller(wikitekst)) {
    const sektion = t.sektion.join(' › ');
    const k = klassificer(t.sektion);
    if (k.fra || (k.fase !== 'indledende' && k.fase !== 'hoved')) continue; // Presidents Cup m.m.
    const hvor = `${turnering} ${sektion}`;
    if (t.felter.update !== 'complete') { ufaerdige.push(sektion); continue; }
    if (t.felter.winpoints !== '2') throw new Error(`${hvor}: winpoints=${t.felter.winpoints} — IHF giver 2 point for en sejr.`);
    const koder = String(t.felter.team_order || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (koder.length < 2) throw new Error(`${hvor}: team_order mangler.`);
    const hold = koder.map((kode) => historikKode(t.felter, kode, hvor));
    if (new Set(hold).size !== hold.length) throw new Error(`${hvor}: et hold står to gange i team_order.`);
    const stats = {};
    koder.forEach((kode, i) => {
      const f = (n) => tal(t.felter[`${n}_${kode}`], `${hvor} ${n}_${kode}`);
      stats[hold[i]] = { won: f('win'), draw: f('draw'), lost: f('loss'), gf: f('gf'), ga: f('ga') };
    });
    tabeller.push({ turnering, fase: k.fase, gruppe: k.gruppe, sektion, team_order: hold, stats });
  }
  return { tabeller, ufaerdige };
}

/**
 * Kampene, en tabel er regnet af, fra historikken: gruppens egne kampe, og i
 * hovedrunden også de indledende kampe mellem to hold, der begge er med
 * (IHF-reglementet: «only those results from the preliminary round are taken
 * into consideration that were obtained against teams that also qualified»).
 */
export function tabellensKampe(tabel, historikKampe) {
  const med = new Set(tabel.team_order);
  return historikKampe.filter((m) => m.turnering === tabel.turnering
    && (m.sektion === tabel.sektion
      || (tabel.fase === 'hoved' && m.sektion.startsWith('Preliminary round › ')))
    && med.has(m.hjemme) && med.has(m.ude));
}

/** V/U/T/mål pr. hold af historikkens kampe (stillingen efter 60 min). */
export function regnTal(hold, kampe) {
  const s = Object.fromEntries(hold.map((h) => [h, { won: 0, draw: 0, lost: 0, gf: 0, ga: 0 }]));
  for (const m of kampe) {
    const { h, u } = m.efter60;
    const a = s[m.hjemme];
    const b = s[m.ude];
    a.gf += h; a.ga += u; b.gf += u; b.ga += h;
    if (h > u) { a.won += 1; b.lost += 1; } else if (h < u) { b.won += 1; a.lost += 1; } else { a.draw += 1; b.draw += 1; }
  }
  return s;
}

/**
 * Hvorfor kan tabellen IKKE regnes af historikken? null = den kan (orakel).
 * Ellers en tekst, der nævner holdene og forskellen.
 */
export function afvigelse(tabel, historikKampe) {
  const regnet = regnTal(tabel.team_order, tabellensKampe(tabel, historikKampe));
  const forskelle = [];
  for (const h of tabel.team_order) {
    const a = tabel.stats[h];
    const b = regnet[h];
    const vis = (x) => `${x.won}-${x.draw}-${x.lost} ${x.gf}:${x.ga}`;
    if (['won', 'draw', 'lost', 'gf', 'ga'].some((n) => a[n] !== b[n])) forskelle.push(`${h} tabel ${vis(a)} ≠ historik ${vis(b)}`);
  }
  return forskelle.length ? forskelle.join('; ') : null;
}

/**
 * Hele oraklet af flere sider.
 * @param {Array<{turnering:string, wikitekst:string, kilde:object}>} sider
 * @param {Array} historikKampe scripts/haandbold-historik.json `kampe`
 */
export function byggOrakel(sider, historikKampe) {
  const tabeller = [];
  const udeladt = [];
  const kilder = [];
  for (const s of sider) {
    const { tabeller: t, ufaerdige } = laesGruppetabeller(s.wikitekst, s.turnering);
    for (const sektion of ufaerdige) udeladt.push({ turnering: s.turnering, sektion, grund: 'tabellen er ikke færdig (update ≠ complete)' });
    for (const tabel of t) {
      const grund = afvigelse(tabel, historikKampe);
      if (grund) {
        udeladt.push({ turnering: tabel.turnering, sektion: tabel.sektion, grund: `tabellens tal kan ikke regnes af historikkens kampe (aflyste kampe/walkovers): ${grund}` });
      } else {
        tabeller.push(tabel);
      }
    }
    kilder.push(s.kilde);
  }
  return { tabeller, udeladt, kilder };
}
