// ---------------------------------------------------------------------------
// scripts/lib/wikiHandball.mjs — læs {{handballbox}}-kampe i en Wikipedia-
// sides wikitekst. Rene funktioner, ingen netværk (det står i wikiHent.mjs).
//
// HVORFOR WIKIPEDIA (planen §13): IHF afviser automatiske hentninger fra
// Googles net. Wikipedias side om VM 2027 har alle 48 kampe i den indledende
// runde med tider, og siderne om VM/EM 2019-2026 har facit med ordinær tid,
// forlængelse og straffekast i hvert sit felt.
//
// EN SKRABER FEJLER TAVST, NÅR KILDEN ÆNDRER FORM (planen §6). Wikitekst er
// skrevet i hånden af frivillige, så formen KAN skifte fra side til side og fra
// redigering til redigering. Reglen her er derfor: alt, der ikke ligner den
// form, vi kender, er en FEJL med en dansk besked, der siger hvor — aldrig et
// gæt, aldrig en stille udeladelse. Konkret:
//   - en skabelon, der aldrig lukkes                    → kast
//   - et hold, der hverken er {{hb|KOD}} eller en ren pladsholder → kast
//   - en dato eller et tidspunkt i en ukendt form        → kast
//   - en score, der ikke er «tal–tal»                    → kast
//   - et ukendt felt, hvis navn ligner et resultat (ET, aet, SO, pen …)
//     → kast, for det kunne bære det facit, vi ellers ville læse forkert.
//     Andre ukendte felter (fx et nyt kort-felt) samles i `ukendte` på kampen.
//     Parseren selv kaster ikke på dem; KALDEREN skal gøre noget med dem:
//     programmet kaster på et ukendt felt i en medtaget kamp (`timezone=` eller
//     `status=postponed` kunne flytte en tip-deadline), og historikken tæller
//     dem og viser dem i udskriften (haandboldProgram.mjs / haandboldHistorik.mjs).
//   - forlængelse/straffe uden stillingen efter 60 min (FT), eller FT uden
//     forlængelse/straffe, eller felter der ikke summer til slutstillingen → kast
//   - en walkover (10–0 uden pausestilling)             → kast med art 'walkover'
//   - en fodnote ({{refn|…}}, <ref>) i dato/tid/hold     → fjernes, og feltet
//     står i `fodnoter` på kampen. Programmet kaster på det i en medtaget
//     kamp (noten kan flytte kickoff); historikken bruger kun tiden til
//     rækkefølgen og ignorerer det.
// Kalderen (program/historik) beslutter, om en kastet kamp vælter hele
// kørslen (programmet: ja) eller tælles og vises som afvist (historikken).
//
// FORMEN, SOM DEN STÅR PÅ SIDERNE (VM 2025, VM 2027, hentet 2/11 2026):
//   {{handballbox |date=28 January 2025 |time=20:30
//    |team1={{hb-rt|POR}} |score=31–30 |team2={{hb|GER}}
//    |HT=13–9 |FT=26–26 |OT1=5–4 |PEN=…  |stadium=… }}
//   score = SLUTSTILLINGEN inkl. forlængelse og straffekast (33–31 for en
//   kamp, der stod 28–28 og endte 5–3 i straffekast). FT står KUN, når kampen
//   gik ud over 60 minutter, og er da stillingen efter ordinær tid.
// ---------------------------------------------------------------------------

// Felter, vi kender. Alt andet tælles som ukendt (se RESULTAT_LIGNENDE).
const KENDTE_FELTER = new Set([
  'date', 'time', 'team1', 'team2', 'score', 'report', 'goals1', 'goals2',
  'HT', 'FT', 'OT1', 'OT2', 'PEN', 'twomin1', 'twomin2', 'yellow1', 'yellow2',
  'red1', 'red2', 'stadium', 'attendance', 'referee', 'refnat',
]);
// Et ukendt felt med et af disse navne kan bære resultatet. Så hellere stop.
// Hele navnet skal passe (`other=` er ikke et resultat; `OT3=`, `aet=` og
// `penalties=` er). MediaWiki skelner mellem store og små bogstaver, så `ft=`
// er et andet felt end `FT=` — og netop derfor skal det stoppe kørslen.
const RESULTAT_LIGNENDE = /^(score\w*|result\w*|ft\d*|ht\d*|ot\d*|et\d*|aet|pen\w*|pso|so|shootout\w*|7m\w*|extra\w*|overtime\w*|winner\w*)$/i;

const MAANEDER = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

// Fodnoteskabeloner må stå i et scorefelt (PEN=5–3{{efn-ua|…}} på VM 2025-siden).
const FODNOTE = /^(efn|efn-ua|efn-lr|efn-la|refn|sfn|cn|citation needed|notetag|ref)$/i;

/** Fjern <!-- kommentarer --> (en åben kommentar løber til tekstens slut, som i MediaWiki). */
export function fjernKommentarer(tekst) {
  return String(tekst).replace(/<!--[\s\S]*?(?:-->|$)/g, '');
}

/**
 * Find skabelonen, der starter på `start` (ved "{{"), og returnér indeks lige
 * efter dens "}}". Tæller både {{ }} og [[ ]], så et link med "|" eller en
 * indlejret skabelon ikke afslutter den for tidligt.
 * @returns {number} slut-indeks, eller -1 hvis den aldrig lukkes
 */
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
 * Del en skabelons krop i felter på de "|", der står på øverste niveau.
 * Første led er skabelonens navn.
 */
export function delFelter(krop) {
  const led = [];
  let nu = '';
  let kroelle = 0;
  let kantet = 0;
  for (let i = 0; i < krop.length; i += 1) {
    const to = krop.slice(i, i + 2);
    if (to === '{{') { kroelle += 1; nu += to; i += 1; continue; }
    if (to === '}}' && kroelle > 0) { kroelle -= 1; nu += to; i += 1; continue; }
    if (to === '[[') { kantet += 1; nu += to; i += 1; continue; }
    if (to === ']]' && kantet > 0) { kantet -= 1; nu += to; i += 1; continue; }
    if (krop[i] === '|' && kroelle === 0 && kantet === 0) { led.push(nu); nu = ''; continue; }
    nu += krop[i];
  }
  led.push(nu);
  return led;
}

/** Overskrifterne i teksten med niveau og position: [{niveau, titel, pos}]. */
export function overskrifter(tekst) {
  const ud = [];
  const re = /^(={2,6})\s*(.*?)\s*\1\s*$/gm;
  let m;
  while ((m = re.exec(tekst))) ud.push({ niveau: m[1].length, titel: m[2].replace(/'''?/g, '').trim(), pos: m.index });
  return ud;
}

/** Sektionsstien for en position: ['Main round', 'Group I']. Niveau 2 først. */
export function sektionVed(overs, pos) {
  const sti = [];
  for (const o of overs) {
    if (o.pos > pos) break;
    sti.length = Math.max(0, o.niveau - 2);
    sti[o.niveau - 2] = o.titel;
  }
  return sti.filter((s) => s !== undefined);
}

/**
 * Alle {{handballbox}} i teksten, rå: navn → værdi + sektionssti.
 * @returns {Array<{nr: number, sektion: string[], felter: Record<string,string>, ukendte: string[]}>}
 */
export function findHandballboxe(wikitekst) {
  const tekst = fjernKommentarer(wikitekst);
  const overs = overskrifter(tekst);
  const ud = [];
  const re = /\{\{\s*handballbox\s*(?=[|}\n])/gi;
  let m;
  while ((m = re.exec(tekst))) {
    const slut = skabelonSlut(tekst, m.index);
    if (slut < 0) {
      const linje = tekst.slice(0, m.index).split('\n').length;
      throw new Error(`En {{handballbox}} ved linje ${linje} lukkes aldrig — siden er ufuldstændig eller ændret. Intet er læst.`);
    }
    const krop = tekst.slice(m.index + 2, slut - 2);
    const [, ...led] = delFelter(krop);
    const felter = {};
    const ukendte = [];
    for (const l of led) {
      const i = l.indexOf('=');
      if (i < 0) {
        if (l.trim()) ukendte.push(`(uden navn: ${l.trim().slice(0, 30)})`);
        continue;
      }
      const navn = l.slice(0, i).trim();
      const vaerdi = l.slice(i + 1).trim();
      if (!KENDTE_FELTER.has(navn)) {
        if (RESULTAT_LIGNENDE.test(navn) && vaerdi) {
          throw new Error(`Kamp nr. ${ud.length + 1} har feltet «${navn}=${vaerdi}», som ligner et resultat, men som parseren ikke kender. `
            + 'Stop: læs formen på siden, og lær parseren feltet (scripts/lib/wikiHandball.mjs), før noget bruges.');
        }
        ukendte.push(navn);
      }
      felter[navn] = vaerdi;
    }
    ud.push({ nr: ud.length + 1, sektion: sektionVed(overs, m.index), felter, ukendte });
    re.lastIndex = slut;
  }
  return ud;
}

// HOLD UDEN EN TREBOGSTAVSKODE PÅ SIDEN. Hver form står ORDRET, som den står
// i kasserne — intet mønster, for et mønster ville gætte på former, ingen har
// set. En ny form kaster stadig (se parseHold).
//   VM 2019: det fælles koreanske hold, {{hb|Korea|unification}} (og -rt).
//     Koden COR er vores, ikke sidens: siden bruger KOR som nøgle i
//     gruppetabellen (|name_KOR=…), men holdet er IKKE Sydkorea (det havde
//     spillere fra både Syd- og Nordkorea), og KOR er Sydkoreas kode i VM
//     2021 og 2023. Målingen (D4) har afgjort, at COR forbliver sit eget hold
//     i Elo (ELO_SAMME i haandboldMaaling.mjs, tom; scripts/maal-haandbold.mjs
//     afsnit 7b) — her får holdet en stabil kode, der ikke blander dem sammen.
//   VM 2021: Rusland spillede som «Russian Handball Federation» (RHF), fordi
//     WADA-sanktionen forbød navn og flag — ikke fordi det var et andet hold.
//     Samme forbund, samme spillere, samme landshold (linket peger på
//     «Russia men's national handball team»). Elo måler holdets styrke, så
//     RHF er RUS. Kasserne skriver det som et link, ikke {{hb|RUS}}.
const SAERLIGE_HOLD = new Map([
  ['{{hb|Korea|unification}}', 'COR'],
  ['{{hb-rt|Korea|unification}}', 'COR'],
  ["[[Russia men's national handball team|Russian Handball Federation]]", 'RUS'],
]);

/**
 * Et hold-felt: {{hb|DEN}} / {{hb-rt|DEN}} → {kode:'DEN'}; en ren pladsholder
 * (A1, WQF1, LSF2 …) → {pladsholder:'A1'}; en af SAERLIGE_HOLD → {kode}; tomt
 * → null. Alt andet kaster.
 */
export function parseHold(vaerdi, hvor = '') {
  const v = String(vaerdi ?? '').trim();
  if (!v) return null;
  if (SAERLIGE_HOLD.has(v)) return { kode: SAERLIGE_HOLD.get(v) };
  const skab = /^\{\{\s*(hb|hb-rt|hbrt|hb-lt)\s*\|\s*([A-Z]{3})\s*(?:\|[^{}]*)?\}\}$/.exec(v);
  if (skab) return { kode: skab[2] };
  if (/^[A-Za-z0-9 ]{1,12}$/.test(v) && !/[{}[\]]/.test(v)) return { pladsholder: v };
  throw new Error(`${hvor}holdet «${v.slice(0, 60)}» er hverken {{hb|KODE}} eller en pladsholder — ny form på siden?`);
}

/** "13 January 2027" / "January 13, 2027" → '2027-01-13'. Tomt → null. Andet kaster. */
export function parseDato(vaerdi, hvor = '') {
  const v = String(vaerdi ?? '').trim();
  if (!v) return null;
  let d; let mdr; let aar;
  let m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(v);
  if (m) [, d, mdr, aar] = m;
  else if ((m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(v))) [, mdr, d, aar] = m;
  else throw new Error(`${hvor}datoen «${v.slice(0, 40)}» har en ukendt form`);
  const mi = MAANEDER.indexOf(mdr.toLowerCase());
  if (mi < 0) throw new Error(`${hvor}datoen «${v}» har en ukendt måned`);
  const iso = `${aar}-${String(mi + 1).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  const t = new Date(`${iso}T00:00:00Z`);
  if (t.getUTCDate() !== Number(d)) throw new Error(`${hvor}datoen «${v}» findes ikke`);
  return iso;
}

/**
 * Tidspunktet. "17:30" → {tid:'17:30', senest:null}. Tomt → null.
 *
 * TO TIDER I ÉT FELT. VM 2027-siden har seks kampe med "18:00/30" og
 * "20:30/21:00" (hentet 2/11 2026): TV har ikke lagt sig fast. Det er ikke et
 * tidspunkt, men et VINDUE, og vi gætter ikke, hvilken ende der bliver
 * rigtig. Formen læses som {tid: tidligste, senest: seneste}; KALDEREN
 * beslutter, hvad den gør med et vindue (programmet: tidligste som deadline,
 * meldt højt — se haandboldProgram.mjs). Alt andet end de to former kaster.
 */
export function parseTid(vaerdi, hvor = '') {
  const v = String(vaerdi ?? '').trim();
  if (!v) return null;
  const fejl = () => new Error(`${hvor}tidspunktet «${v.slice(0, 40)}» har en ukendt form`);
  const m = /^(\d{1,2})[:.](\d{2})(?:\s*\/\s*(?:(\d{1,2})[:.])?(\d{2}))?$/.exec(v);
  if (!m) throw fejl();
  const t1 = Number(m[1]);
  const m1 = Number(m[2]);
  if (t1 > 23 || m1 > 59) throw fejl();
  const tid = `${String(t1).padStart(2, '0')}:${m[2]}`;
  if (m[4] === undefined) return { tid, senest: null };
  const t2 = m[3] === undefined ? t1 : Number(m[3]);
  const m2 = Number(m[4]);
  if (t2 > 23 || m2 > 59) throw fejl();
  const fra = t1 * 60 + m1;
  const til = t2 * 60 + m2;
  // Et vindue skal gå FREMAD og være kort. "20:30/19:00" eller "18:00/23:00"
  // er ikke et TV-vindue, men en tastefejl eller en ny betydning.
  if (til <= fra || til - fra > 120) throw fejl();
  return { tid, senest: `${String(t2).padStart(2, '0')}:${m[4]}` };
}

/** Fjern fodnoter ({{efn|…}}, <ref>…</ref>) fra et felt — intet andet. */
function udenFodnoter(v) {
  let s = String(v ?? '').replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  // Fjern kun skabeloner, hvis NAVN er en kendt fodnote.
  let i = s.indexOf('{{');
  while (i >= 0) {
    const slut = skabelonSlut(s, i);
    if (slut < 0) break;
    const navn = delFelter(s.slice(i + 2, slut - 2))[0].trim();
    if (FODNOTE.test(navn)) { s = s.slice(0, i) + s.slice(slut); i = s.indexOf('{{', i); } else i = s.indexOf('{{', slut);
  }
  return s.trim();
}

/** "31–30" → {h:31, u:30}. Tomt → null. Alt andet (tekst, «w/o», skabeloner) kaster. */
export function parseScore(vaerdi, hvor = '') {
  const v = udenFodnoter(vaerdi);
  if (!v) return null;
  const m = /^(\d{1,3})\s*[–—−-]\s*(\d{1,3})$/.exec(v);
  if (!m) throw new Error(`${hvor}stillingen «${v.slice(0, 40)}» er ikke «tal–tal»`);
  return { h: Number(m[1]), u: Number(m[2]) };
}

const plus = (a, b) => ({ h: a.h + b.h, u: a.u + b.u });
const ens = (a, b) => a.h === b.h && a.u === b.u;

/**
 * Facit for en spillet kamp: slutstilling, stilling efter 60 min og afgørelse.
 * @returns {null | {slut:{h,u}, efter60:{h,u}, afgjort: null|'forlaenget'|'straffe', halvleg:{h,u}|null}}
 *   null = kampen er ikke spillet (tom score og ingen periode-felter).
 */
export function facitFraBox(felter, hvor = '') {
  const slut = parseScore(felter.score, `${hvor}score: `);
  const ft = parseScore(felter.FT, `${hvor}FT: `);
  const ot1 = parseScore(felter.OT1, `${hvor}OT1: `);
  const ot2 = parseScore(felter.OT2, `${hvor}OT2: `);
  const pen = parseScore(felter.PEN, `${hvor}PEN: `);
  const ht = parseScore(felter.HT, `${hvor}HT: `);
  if (!slut) {
    if (ft || ot1 || ot2 || pen) throw new Error(`${hvor}kampen har periodefelter, men ingen slutstilling`);
    return null;
  }
  const ekstra = ot1 || ot2 || pen;
  if (ekstra && !ft) throw new Error(`${hvor}forlængelse/straffekast uden FT (stillingen efter 60 min) — kan ikke læse ordinær tid`);
  if (ft && !ekstra) throw new Error(`${hvor}FT står uden forlængelse eller straffekast — formen er ukendt`);
  if (ot2 && !ot1) throw new Error(`${hvor}OT2 uden OT1`);
  if (ft && ft.h !== ft.u) throw new Error(`${hvor}FT ${ft.h}–${ft.u} er ikke uafgjort, men kampen gik videre`);
  if (ft) {
    let sum = ft;
    for (const p of [ot1, ot2, pen]) if (p) sum = plus(sum, p);
    if (!ens(sum, slut)) {
      throw new Error(`${hvor}FT + forlængelse + straffe = ${sum.h}–${sum.u}, men slutstillingen er ${slut.h}–${slut.u}`);
    }
  }
  const efter60 = ft || slut;
  if (ht && (ht.h > efter60.h || ht.u > efter60.u)) {
    throw new Error(`${hvor}pausestillingen ${ht.h}–${ht.u} er større end stillingen efter 60 min ${efter60.h}–${efter60.u}`);
  }
  // WALKOVER. Et hold, der ikke stiller op, taber 0–10 ved bordet. VM 2021:
  // Kap Verde trak sig midt i turneringen (COVID), og dets seks resterende
  // kampe står med score 0–10/10–0, uden tid, pausestilling og rapport.
  // Det er ikke en spillet kamp og må ikke ind i en måling af spillede
  // kampe — men den skal kunne kendes fra en ulæselig kamp. Formen er
  // snæver: præcis 10–0 og INGEN pausestilling. En 10–0 med pausestilling
  // er en ny form og falder igennem til vagten herunder. (FT behøver ingen
  // vagt: med FT er efter60 = FT, og FT er altid uafgjort — aldrig 10–0.)
  if (!ht && Math.max(efter60.h, efter60.u) === 10 && Math.min(efter60.h, efter60.u) === 0) {
    const e = new Error(`${hvor}walkover (${slut.h}–${slut.u} tildelt uden kamp, ingen pausestilling) — ikke en spillet kamp`);
    e.art = 'walkover';
    throw e;
  }
  for (const x of [efter60.h, efter60.u]) {
    if (x < 5 || x > 70) throw new Error(`${hvor}${x} mål efter 60 min er ikke en håndboldkamp — forkert felt?`);
  }
  const afgjort = pen ? 'straffe' : (ot1 ? 'forlaenget' : null);
  return { slut, efter60, afgjort, halvleg: ht };
}

/**
 * Sidens tidszone: «All times are local (UTC+1)». Præcis én forskydning
 * på hele siden, ellers kast — vi gætter aldrig en tidszone.
 * @returns {number} minutter øst for UTC (UTC+1 → 60)
 */
export function sidensForskydning(wikitekst) {
  const tekst = fjernKommentarer(wikitekst);
  const fundne = new Set();
  const re = /All times are local[^\n]*?UTC\s*([+−-])\s*(\d{1,2})(?::(\d{2}))?/gi;
  let m;
  while ((m = re.exec(tekst))) {
    const fortegn = m[1] === '+' ? 1 : -1;
    fundne.add(fortegn * (Number(m[2]) * 60 + Number(m[3] || 0)));
  }
  if (fundne.size === 0) {
    // Står sætningen der, men uden en forskydning, så sig hvad den siger. EM
    // 2022: «All times are local ([[Central European Time|UTC]])» — teksten
    // siger UTC, linket siger CET. Det er ikke entydigt, og der vælges ikke.
    const linje = /All times are local[^\n]*/i.exec(tekst);
    if (linje) {
      const ord = udenFodnoter(linje[0]).replace(/'{2,}/g, '').trim().slice(0, 120);
      throw new Error(`Siden skriver «${ord}» uden en forskydning efter UTC (fx UTC+1) — der gættes ikke.`);
    }
    throw new Error('Siden siger ikke, hvilken tidszone tiderne står i («All times are local (UTC+1)») — der gættes ikke.');
  }
  if (fundne.size > 1) throw new Error(`Siden har flere tidszoner (${[...fundne].map((x) => x / 60).join(', ')}) — der gættes ikke.`);
  return [...fundne][0];
}

/**
 * Beskær siden til kampene: fra den niveau-2-overskrift, der rummer den
 * første {{handballbox}}, til den niveau-2-overskrift, der følger efter den
 * sidste. Bruges til fixtures og til programmet — SAMME beskæring begge
 * steder, så testen, der sammenligner dem, sammenligner det samme.
 * Indholdet ellers (kvalifikation, dommere, noter) skal ikke ligge i repoet.
 */
export function beskaarTilKampe(wikitekst) {
  const tekst = String(wikitekst);
  const { fra, til } = kampOmraade(tekst);
  return tekst.slice(fra, til);
}

/** [fra, til) for beskaarTilKampe — og for transklusioner(). */
function kampOmraade(tekst) {
  const re = /\{\{\s*handballbox\s*(?=[|}\n])/gi;
  const starter = [];
  let m;
  while ((m = re.exec(tekst))) starter.push(m.index);
  if (!starter.length) throw new Error('Siden har ingen {{handballbox}} — intet at beskære til.');
  const sidsteSlut = skabelonSlut(tekst, starter[starter.length - 1]);
  if (sidsteSlut < 0) throw new Error('Den sidste {{handballbox}} lukkes aldrig — siden er ufuldstændig.');
  const n2 = overskrifter(tekst).filter((o) => o.niveau === 2);
  const fra = [...n2].reverse().find((o) => o.pos <= starter[0])?.pos ?? 0;
  const til = n2.find((o) => o.pos >= sidsteSlut)?.pos ?? tekst.length;
  return { fra, til };
}

/**
 * KAMPE PÅ EN ANDEN SIDE. EM 2026-siden har ingen {{handballbox}} for
 * finalen; sektionen er «{{#section:2026 European Men's Handball
 * Championship final|Final}}», og kassen hentes fra finalens egen side, når
 * Wikipedia VISER siden. I wikiteksten står den ikke, og før denne funktion
 * forsvandt finalen i stilhed (64 af 65 kampe — over gulvet på 60).
 * Finder transklusioner ({{#section…:}}, {{#lst…:}}, {{:Side}}) i kampenes
 * område (samme som beskaarTilKampe). De læses ikke — den anden side er ikke
 * hentet — men de meldes, så kalderen kan afvise dem med grund.
 * @returns {Array<{sektion: string[], side: string, skabelon: string}>}
 */
export function transklusioner(wikitekst) {
  const tekst = fjernKommentarer(wikitekst);
  const { fra, til } = kampOmraade(tekst);
  const overs = overskrifter(tekst);
  const ud = [];
  const re = /\{\{\s*(?:#(?:section|section-h|lst|lsth|lstx)\s*:|:)\s*([^|{}]+?)\s*(?:\|[^{}]*)?\}\}/gi;
  re.lastIndex = fra;
  let m;
  while ((m = re.exec(tekst)) && m.index < til) {
    ud.push({ sektion: sektionVed(overs, m.index), side: m[1], skabelon: m[0].slice(0, 120) });
  }
  return ud;
}

/**
 * Sidens eget kamptal: «| matches = 65» i {{Infobox …}} øverst. Det er
 * sidens påstand om, hvor mange kampe der blev SPILLET (VM 2021: 102 — de 108
 * kasser minus Kap Verdes seks walkovers), og historikken holder sig selv op
 * mod den, så en kamp ikke kan forsvinde i stilhed.
 * @returns {{antal: number|null, fejl: string|null}}
 */
export function infoboksKampe(wikitekst) {
  const tekst = fjernKommentarer(wikitekst);
  const m = /\{\{\s*infobox\b/i.exec(tekst);
  if (!m) return { antal: null, fejl: 'siden har ingen {{Infobox …}}' };
  const slut = skabelonSlut(tekst, m.index);
  if (slut < 0) return { antal: null, fejl: 'infoboksen lukkes aldrig' };
  const felt = delFelter(tekst.slice(m.index + 2, slut - 2)).slice(1)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1)])
    .find(([navn]) => navn === 'matches');
  if (!felt) return { antal: null, fejl: 'infoboksen har intet «matches=»' };
  const v = udenFodnoter(felt[1]);
  if (!/^\d{1,4}$/.test(v)) return { antal: null, fejl: `infoboksens «matches=${v.slice(0, 30)}» er ikke et tal` };
  return { antal: Number(v), fejl: null };
}

/** Lokal dato+tid med forskydning → UTC ISO ('2027-01-13T16:30:00Z'). */
export function utcIso(dato, tid, forskydningMin) {
  const [y, mo, d] = dato.split('-').map(Number);
  const [t, mi] = tid.split(':').map(Number);
  const ms = Date.UTC(y, mo - 1, d, t, mi) - forskydningMin * 60000;
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/**
 * Én box læst: hold, dato, tid og facit — eller kastet med sted-angivelse.
 * @returns {{nr, sektion, dato, tid, tidSenest, hjemme, ude, facit, ukendte}}
 *   tidSenest er kun sat, når siden angiver et vindue ("18:00/30").
 */
export function laesBox(b) {
  const hvor = `Kamp nr. ${b.nr} (${b.sektion.join(' › ') || 'uden sektion'}): `;
  // Fodnoter fjernes i ALLE de felter, der læses — ikke kun i scoren. VM 2023,
  // kvartfinalen FRA–GER: «|time=20:54{{refn|…kampen var sat til 20:30…}}».
  // Hvilke felter der havde en, står i `fodnoter`. Scorefelterne er ikke med:
  // parseScore har altid fjernet dem, og en note dér flytter ingen deadline.
  const fodnoter = [];
  const felt = (navn) => {
    const raa = String(b.felter[navn] ?? '').trim();
    const ren = udenFodnoter(raa);
    if (ren !== raa) fodnoter.push(navn);
    return ren;
  };
  return {
    nr: b.nr,
    sektion: b.sektion,
    dato: parseDato(felt('date'), hvor),
    ...tidsfelter(parseTid(felt('time'), hvor)),
    hjemme: parseHold(felt('team1'), hvor),
    ude: parseHold(felt('team2'), hvor),
    facit: facitFraBox(b.felter, hvor),
    ukendte: b.ukendte,
    fodnoter,
  };
}

function tidsfelter(t) {
  return { tid: t?.tid ?? null, tidSenest: t?.senest ?? null };
}

/** Alle kampe på siden; den første, der ikke kan læses, vælter kaldet. */
export function laesKampe(wikitekst) {
  return findHandballboxe(wikitekst).map(laesBox);
}
