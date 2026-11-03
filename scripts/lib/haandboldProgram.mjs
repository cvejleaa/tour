// ---------------------------------------------------------------------------
// scripts/lib/haandboldProgram.mjs — VM 2027-programmet fra Wikipedia →
// kampe til seed-football + fasekalenderen (`game.faser`) + grupperne
// (`game.grupper`).
//
// Rene funktioner; scripts/haandbold-program.mjs henter siden og skriver
// filen. Testet i haandboldProgram.test.mjs mod en fixture af siden.
//
// EJERENS BESLUTNINGER (planen §11.4 og §12.10), som koden her bærer:
//   - Presidents Cup og placeringskampene (31.-25. plads, 5.-8. plads) er IKKE
//     med. Bronzekampen ER med (på finaledagen).
//   - En runde er en SPILLEDAG MED MINDST ÉN KAMP, DER ER MED. En dag med kun
//     Presidents Cup eller placering er ikke en runde — ellers står der en tom
//     runde midt i kalenderen, og «Dag 7 af 17» passer ikke. Kalenderen
//     bygges derfor af det FILTREREDE program, aldrig af turneringens dagliste.
//   - Der oprettes aldrig en kamp uden kickoff (QC): kickoff ER tip-deadline,
//     og en kamp uden giver straks en strandede-alarm.
//
// SEKTIONERNE ER ET LUKKET SÆT. En ny overskrift på siden (fx en
// «Placement round») er en beslutning — med eller ej — ikke noget, koden må
// gætte. Ukendt sektion med kampe → kast med navnet.
// ---------------------------------------------------------------------------

import { findHandballboxe, findSportsTabeller, laesBox, sidensForskydning, utcIso } from './wikiHandball.mjs';
import { faseKalenderFejl } from '../../src/lib/faser.js';
import { HAANDBOLD_VM2027_HOLD, holdForKode } from '../../src/data/haandboldVm2027Hold.js';

// Faserne i kalenderens rækkefølge. `bestemt` er den bøjede form til
// sætninger («Hovedrunden lægges ind …», src/lib/faser.js).
export const VM_FASER = [
  { noegle: 'indledende', navn: 'Indledende runde', bestemt: 'Den indledende runde', knockout: false },
  { noegle: 'hoved', navn: 'Hovedrunde', bestemt: 'Hovedrunden', knockout: false },
  { noegle: 'kvart', navn: 'Kvartfinaler', bestemt: 'Kvartfinalerne', knockout: true },
  { noegle: 'semi', navn: 'Semifinaler', bestemt: 'Semifinalerne', knockout: true },
  { noegle: 'finale', navn: 'Finaledag', bestemt: 'Finaledagen', knockout: true },
];

// VM 2027's FORMAT (32 hold, 8 grupper à 4 → 4 hovedrundegrupper à 6). Står
// siden med et andet antal, er formen ændret — eller siden halvt redigeret —
// og så hellere stop end en kalender med forkerte tal i «Dag 7 af 17».
export const VM2027_FORMAT = {
  antalHold: 32,
  grupper: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  holdPrGruppe: 4,
  kampe: { indledende: 48, hoved: 36, kvart: 4, semi: 2, finale: 2 },
  // VÆRTENS TIDSZONE. Tyskland (og Danmark) er CET = UTC+1 i januar — ingen
  // sommertid. Siden SIGER, hvilken zone tiderne står i, men det er en påstand
  // om siden, og den efterprøves: står der noget andet end værtens zone på
  // kampdagene, flytter hver tip-deadline sig en time, og så stopper vi.
  tidszone: 'Europe/Berlin',
  // GRUPPERNE (game.grupper). KONSTANTER, som siden EFTERPRØVES mod — som
  // tidszonen — og aldrig læses ud af den: gruppetabellernes `team_order` er
  // et LEVENDE felt (redaktørerne sorterer det efter stillingen under
  // turneringen, og hovedrundens pladsholdere A1, B1 … erstattes af rigtige
  // koder). En kørsel midt i turneringen må ikke give et andet `grupper`.
  //   point        winpoints (og drawpoints/losspoints) på HVER tabel
  //   videre       resultN=Q på præcis de øverste N pladser i hver tabel
  //   hovedgrupper hovedrundegruppens team_order kommer fra præcis disse
  //                indledende grupper (pladsholderen A1 eller A-holdets kode)
  point: { sejr: 2, uafgjort: 1 },
  videre: { indledende: 3, hoved: 2 },
  hovedgrupper: { I: ['A', 'B'], II: ['C', 'D'], III: ['E', 'F'], IV: ['G', 'H'] },
};

/**
 * En IANA-zones forskydning fra UTC i minutter på en dato (kl. 12 UTC, så
 * ingen skiftetime kan ramme). Fx ('Europe/Berlin', '2027-01-13') → 60.
 */
export function zoneForskydning(zone, dato) {
  const del = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${dato}T12:00:00Z`))
    .find((d) => d.type === 'timeZoneName').value; // «GMT+01:00» / «GMT»
  const m = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(del);
  if (!m) throw new Error(`zoneForskydning: kan ikke læse «${del}» for ${zone}`);
  return m[1] ? (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/**
 * Siger siden det samme som værtens zone på HVER kampdag? Ellers kast — der
 * gættes ikke om en tip-deadline.
 */
export function tjekTidszone(forskydning, datoer, zone) {
  if (!zone) throw new Error('Formatet har ingen tidszone (værtens IANA-zone) — siden kan ikke efterprøves, og der gættes ikke.');
  for (const dato of datoer) {
    const z = zoneForskydning(zone, dato);
    if (z !== forskydning) {
      throw new Error(`Siden siger, at tiderne er ${utcTekst(forskydning)}, men ${zone} er ${utcTekst(z)} den ${dato}. `
        + 'Hver tip-deadline ville flytte sig — ret siden/formatet, intet er skrevet.');
    }
  }
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[–—-]/g, '-').replace(/\s+/g, ' ').trim();

/**
 * Hvor hører en kamp hjemme? Ud fra sektionsstien (['Main round', 'Group I']).
 * @returns {{fase: string, gruppe?: string} | {fra: 'presidents'|'placering'}}
 * @throws ved en sektion, der ikke står i det lukkede sæt
 */
export function klassificer(sektion) {
  const [s0, s1] = [norm(sektion?.[0]), norm(sektion?.[1])];
  const vis = (sektion || []).join(' › ') || '(ingen overskrift)';
  if (s0 === 'preliminary round') {
    const g = /^group ([a-h])$/.exec(s1);
    if (g) return { fase: 'indledende', gruppe: g[1].toUpperCase() };
  } else if (s0 === 'presidents cup') {
    return { fra: 'presidents' };
  } else if (s0 === 'main round') {
    if (/^group (i|ii|iii|iv)$/.test(s1)) return { fase: 'hoved', gruppe: s1.slice(6).toUpperCase() };
  } else if (s0 === 'final round' || s0 === 'knockout stage') {
    if (/^quarter-?finals$/.test(s1)) return { fase: 'kvart' };
    if (/^semi-?finals$/.test(s1)) return { fase: 'semi' };
    if (s1 === 'third place game' || s1 === 'bronze medal game') return { fase: 'finale' };
    if (s1 === 'final') return { fase: 'finale' };
    // Placering: «5-8th place semifinals», «Fifth place game», «Seventh place game».
    if (/^(5-8th place semifinals|fifth place game|seventh place game)$/.test(s1)) return { fra: 'placering' };
  }
  throw new Error(`Ukendt sektion «${vis}» på siden. Afgør, om dens kampe er med (ejerens beslutning, planen §11.4), `
    + 'og lær klassificer() i scripts/lib/haandboldProgram.mjs den — der gættes ikke.');
}

/**
 * Læs siden: hver kamp med sin klassifikation. En kamp i en sektion, der ER
 * med, og som ikke kan læses, vælter kaldet. En kamp, der IKKE er med (fx en
 * placeringskamp med en underlig tid), tælles som advarsel — den må ikke
 * blokere programmet, men den må heller ikke forsvinde i stilhed.
 *
 * UKENDTE FELTER. Parseren samler felter, den ikke kender, i `ukendte`. I en
 * medtaget kamp er det en FEJL: `|timezone=UTC+2` eller `|status=postponed`
 * ville ellers blive ignoreret, og kickoff — tip-deadline — stod uændret med
 * en grøn kørsel. VM 2027-siden har ingen ukendte felter (2/11 2026), så
 * reglen koster intet i dag. I en fravalgt kamp er det en advarsel.
 */
export function klassificeredeKampe(wikitekst) {
  const advarsler = [];
  const kampe = [];
  for (const b of findHandballboxe(wikitekst)) {
    const k = klassificer(b.sektion);
    const hvor = `Kamp nr. ${b.nr} (${b.sektion.join(' › ')})`;
    if (k.fra) {
      try { laesBox(b); } catch (e) { advarsler.push(`(fravalgt kamp) ${e.message}`); }
      if (b.ukendte.length) advarsler.push(`(fravalgt kamp) ${hvor} har felter, parseren ikke kender: ${b.ukendte.join(', ')}`);
      continue;
    }
    if (b.ukendte.length) {
      throw new Error(`${hvor} har felter, parseren ikke kender: ${b.ukendte.join(', ')}. Et ukendt felt kan flytte `
        + 'en tip-deadline (fx timezone= eller status=), så programmet bygges ikke. Læs formen på siden, og lær '
        + 'scripts/lib/wikiHandball.mjs feltet — der gættes ikke.');
    }
    const kamp = laesBox(b);
    if (!kamp.dato) throw new Error(`Kamp nr. ${b.nr} (${b.sektion.join(' › ')}) har ingen dato — kalenderen kan ikke bygges.`);
    // FODNOTER. Parseren fjerner {{refn|…}}/<ref> fra dato, tid og hold, så
    // historikken kan læse «20:54{{refn|…}}». I programmet er tiden en
    // tip-deadline, og noten kan sige netop det, der flytter den («flyttet
    // til 18:00», «afventer TV»). Så samme regel som for ukendte felter.
    if (kamp.fodnoter.length) {
      throw new Error(`${hvor} har en fodnote i ${kamp.fodnoter.join(', ')}. En note kan flytte en tip-deadline, så `
        + 'programmet bygges ikke. Læs noten på siden, og afgør tiden — der gættes ikke.');
    }
    kampe.push({ ...kamp, ...k });
  }
  return { kampe, advarsler };
}

/**
 * Fasekalenderen af de MEDTAGNE kampe: runde = spilledag.
 * @returns {{faser: Array, rundeForDato: Map<string, number>}}
 */
export function byggFaser(kampe) {
  const datoer = [...new Set(kampe.map((k) => k.dato))].sort();
  const rundeForDato = new Map(datoer.map((d, i) => [d, i + 1]));
  // Én fase pr. dag. En dag med både hovedrunde og kvartfinale ville give en
  // runde, der både er og ikke er knockout.
  const faseForDato = new Map();
  for (const k of kampe) {
    const f = faseForDato.get(k.dato);
    if (f && f !== k.fase) throw new Error(`${k.dato} har kampe fra både «${f}» og «${k.fase}» — en runde kan kun høre til én fase.`);
    faseForDato.set(k.dato, k.fase);
  }
  const faser = [];
  for (const f of VM_FASER) {
    const dage = datoer.filter((d) => faseForDato.get(d) === f.noegle);
    if (!dage.length) throw new Error(`Siden har ingen kampe i fasen «${f.navn}» — formen er ændret, eller siden er ufuldstændig.`);
    const fase = {
      navn: f.navn,
      bestemt: f.bestemt,
      fra: rundeForDato.get(dage[0]),
      til: rundeForDato.get(dage[dage.length - 1]),
      start: dage[0],
      antalKampe: kampe.filter((k) => k.fase === f.noegle).length,
    };
    if (f.knockout) fase.knockout = true;
    faser.push(fase);
  }
  const fejl = faseKalenderFejl(faser);
  if (fejl.length) throw new Error(`Fasekalenderen består ikke formkontrollen (src/lib/faser.js):\n  - ${fejl.join('\n  - ')}`);
  return { faser, rundeForDato };
}

// Sports table-modulets standard, når feltet ikke står på tabellen
// (Module:Sports table, style=WDL): 3 point for en sejr, 1 for uafgjort, 0
// for et nederlag. Derfor er en tabel UDEN winpoints en fodboldtabel, og den
// fejler mod formatets 2.
const TABEL_STANDARD = { winpoints: 3, drawpoints: 1, losspoints: 0 };

/**
 * Gruppetabellerne på siden, klassificeret på SEKTIONSSTIEN (klassificer) —
 * aldrig på gruppenavnet: Presidents Cup har også en «Group I» og «Group II»,
 * og deres team_order (A4, B4 …) er ikke hovedrundens.
 * @returns {{indledende: Map<string, object>, hoved: Map<string, object>}}
 *   gruppe → {gruppe, hvor, koder, videre, point:{sejr, uafgjort, tab}}
 */
export function gruppeTabeller(wikitekst) {
  const ud = { indledende: new Map(), hoved: new Map() };
  for (const t of findSportsTabeller(wikitekst)) {
    const k = klassificer(t.sektion);
    if (k.fra) continue; // Presidents Cup og placering er ikke med
    const hvor = `Gruppetabellen i «${t.sektion.join(' › ')}»`;
    if (!ud[k.fase] || !k.gruppe) {
      throw new Error(`${hvor}: fasen «${k.fase}» har ingen grupper i formatet. Afgør formen på siden — der gættes ikke.`);
    }
    if (ud[k.fase].has(k.gruppe)) throw new Error(`${hvor}: gruppe ${k.gruppe} har to tabeller på siden — der gættes ikke, hvilken der gælder.`);
    const f = t.felter;
    const koder = String(f.team_order ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!koder.length) throw new Error(`${hvor} har ingen team_order — siden er ufuldstændig eller ændret.`);
    // Hvor mange går videre: pladserne med resultN=Q. De skal være de
    // ØVERSTE — et Q på plads 4 uden et på plads 3 er en ny betydning.
    const q = Object.entries(f).filter(([n, v]) => /^result\d+$/.test(n) && v === 'Q').map(([n]) => Number(n.slice(6))).sort((a, b) => a - b);
    if (q.some((n, i) => n !== i + 1)) {
      throw new Error(`${hvor}: Q står på plads ${q.join(', ')} — ikke på de øverste pladser. Læs formen på siden — der gættes ikke.`);
    }
    const tal = (navn) => {
      if (f[navn] === undefined || f[navn] === '') return TABEL_STANDARD[navn];
      const n = Number(f[navn]);
      if (!Number.isInteger(n)) throw new Error(`${hvor}: ${navn}=«${f[navn]}» er ikke et helt tal.`);
      return n;
    };
    ud[k.fase].set(k.gruppe, {
      gruppe: k.gruppe,
      hvor,
      koder,
      videre: q.length,
      point: { sejr: tal('winpoints'), uafgjort: tal('drawpoints'), tab: tal('losspoints') },
    });
  }
  return ud;
}

/** Siger tabellen det samme som formatet om point og om, hvor mange der går videre? Ellers kast. */
function tjekTabel(t, videre, format) {
  const p = format.point;
  if (t.point.sejr !== p.sejr || t.point.uafgjort !== p.uafgjort || t.point.tab !== 0) {
    throw new Error(`${t.hvor}: siden giver ${t.point.sejr} point for en sejr, ${t.point.uafgjort} for uafgjort og ${t.point.tab} for et nederlag, `
      + `men formatet siger ${p.sejr}, ${p.uafgjort} og 0. Gruppestillingen ville tælle forkert — ret siden/formatet, intet er skrevet.`);
  }
  if (t.videre !== videre) {
    throw new Error(`${t.hvor}: siden siger, at de ${t.videre} øverste går videre (resultN=Q), men formatet siger ${videre}. `
      + 'Stregen i gruppetabellen ville stå forkert — ret siden/formatet, intet er skrevet.');
  }
}

/**
 * `game.grupper` (datakontrakten): formatets konstanter, efterprøvet mod
 * sidens tabeller, og medlemskabet af de indledende grupper fra kampene.
 *
 * MEDLEMSKAB kommer af handballboxenes gruppe (allerede valideret i
 * byggProgram: 8 × 4, 6 kampe, intet hold i to grupper). Tabellens team_order
 * er kun et krydstjek af MÆNGDEN.
 * RÆKKEFØLGEN inden for en gruppe er PROGRAMRÆKKEFØLGEN: holdenes første
 * optræden i det sorterede program (kickoff, id). Den er stabil, når
 * redaktørerne sorterer team_order efter stillingen, og den er ikke en
 * placering.
 * Hovedrundens HOLD gemmes ikke — de udledes af de kampe, ejeren lægger ind.
 * Her står kun, hvilke indledende grupper en hovedrundegruppe kommer FRA.
 *
 * @param {{tabeller: ReturnType<typeof gruppeTabeller>, fixtures: Array, hold: Array, format: object}} o
 *   fixtures SORTERET (kickoff, id), med `gruppe`
 */
export function byggGrupper({ tabeller, fixtures, hold, format }) {
  const navnFor = (noegle) => VM_FASER.find((f) => f.noegle === noegle).navn;
  const medlemmer = new Map(format.grupper.map((g) => [g, []]));
  const gruppeAf = new Map();
  for (const fx of fixtures) {
    for (const n of [fx.home, fx.away]) {
      if (gruppeAf.has(n)) continue;
      gruppeAf.set(n, fx.gruppe);
      medlemmer.get(fx.gruppe).push(n);
    }
  }

  const sammeNoegler = (m, forventet, fase) => {
    const fundet = [...m.keys()];
    if ([...fundet].sort().join() !== [...forventet].sort().join()) {
      throw new Error(`Gruppetabellerne i fasen «${navnFor(fase)}» er ${fundet.join(', ') || '(ingen)'}, men formatet siger ${forventet.join(', ')}. Intet er skrevet.`);
    }
  };

  // Den indledende runde: point, videre og MÆNGDEN af hold.
  sammeNoegler(tabeller.indledende, format.grupper, 'indledende');
  for (const g of format.grupper) {
    const t = tabeller.indledende.get(g);
    tjekTabel(t, format.videre.indledende, format);
    const paaSiden = t.koder.map((kode) => {
      const h = holdForKode(kode, hold);
      if (!h) throw new Error(`${t.hvor}: holdkoden «${kode}» i team_order findes ikke i src/data/haandboldVm2027Hold.js — ret holdfilen (hbKode/aliaser), der gættes ikke.`);
      return h.name;
    });
    const kampene = medlemmer.get(g);
    if ([...paaSiden].sort().join() !== [...kampene].sort().join()) {
      throw new Error(`${t.hvor}: tabellen har ${[...paaSiden].sort().join(', ')}, men kampene i gruppe ${g} har ${[...kampene].sort().join(', ')}. `
        + 'Siden modsiger sig selv — ret siden, intet er skrevet.');
    }
  }

  // Hovedrunden: point, videre og hvilke indledende grupper holdene kommer
  // fra — pladsholderen «A1» eller et rigtigt hold fra gruppe A.
  const hovedNavne = Object.keys(format.hovedgrupper);
  sammeNoegler(tabeller.hoved, hovedNavne, 'hoved');
  const n = format.videre.indledende;
  for (const navn of hovedNavne) {
    const t = tabeller.hoved.get(navn);
    tjekTabel(t, format.videre.hoved, format);
    const fra = format.hovedgrupper[navn];
    const bogstaver = t.koder.map((kode) => {
      const ph = /^([A-Z])(\d)$/.exec(kode);
      if (ph) {
        if (!format.grupper.includes(ph[1]) || Number(ph[2]) < 1 || Number(ph[2]) > n) {
          throw new Error(`${t.hvor}: pladsholderen «${kode}» i team_order er ikke et af de ${n} bedste hold fra en indledende gruppe. Intet er skrevet.`);
        }
        return ph[1];
      }
      const h = holdForKode(kode, hold);
      if (!h || !gruppeAf.has(h.name)) {
        throw new Error(`${t.hvor}: «${kode}» i team_order er hverken en pladsholder (A1) eller et hold fra den indledende runde. Intet er skrevet.`);
      }
      return gruppeAf.get(h.name);
    });
    const ok = bogstaver.length === n * fra.length
      && fra.every((b) => bogstaver.filter((x) => x === b).length === n);
    if (!ok) {
      throw new Error(`${t.hvor}: team_order (${t.koder.join(', ')}) kommer fra gruppe ${[...new Set(bogstaver)].sort().join(', ')}, `
        + `men formatet siger de ${n} bedste fra gruppe ${fra.join(' og ')}. Ret siden/formatet, intet er skrevet.`);
    }
  }

  return {
    point: { sejr: format.point.sejr, uafgjort: format.point.uafgjort },
    faser: [
      { fase: navnFor('indledende'), videre: format.videre.indledende, grupper: format.grupper.map((g) => ({ navn: g, hold: medlemmer.get(g) })) },
      { fase: navnFor('hoved'), videre: format.videre.hoved, grupper: hovedNavne.map((g) => ({ navn: g, fra: [...format.hovedgrupper[g]] })) },
    ],
  };
}

/** Holdet for en kode — eller kast. Aldrig en pladsholder i den indledende runde. */
function holdEllerKast(side, kamp, hold) {
  const hvor = `Kamp nr. ${kamp.nr} (${kamp.sektion.join(' › ')})`;
  if (!side?.kode) throw new Error(`${hvor}: holdet er ${side?.pladsholder ? `pladsholderen «${side.pladsholder}»` : 'tomt'} — den indledende runde skal have rigtige hold.`);
  const t = holdForKode(side.kode, hold);
  if (!t) throw new Error(`${hvor}: holdkoden «${side.kode}» findes ikke i src/data/haandboldVm2027Hold.js — ret holdfilen (hbKode/aliaser), der gættes ikke.`);
  return t;
}

/**
 * Hele vejen: siden → {fixtures, faser, grupper, advarsler, usikreTider}.
 * @param {string} wikitekst
 * @param {{hold?: Array, format?: object}} [o]
 */
export function byggProgram(wikitekst, { hold = HAANDBOLD_VM2027_HOLD, format = VM2027_FORMAT } = {}) {
  const forskydning = sidensForskydning(wikitekst);
  const { kampe, advarsler } = klassificeredeKampe(wikitekst);
  tjekTidszone(forskydning, [...new Set(kampe.map((k) => k.dato))].sort(), format.tidszone);

  // Antal pr. fase — formatet er en påstand om siden, og den efterprøves.
  for (const [fase, n] of Object.entries(format.kampe)) {
    const fundet = kampe.filter((k) => k.fase === fase).length;
    if (fundet !== n) throw new Error(`Fasen «${fase}» har ${fundet} kampe på siden, men formatet siger ${n}. Intet er skrevet.`);
  }
  const { faser, rundeForDato } = byggFaser(kampe);

  const indledende = kampe.filter((k) => k.fase === 'indledende');
  const fixtures = [];
  const usikreTider = [];
  const pr = new Map(); // gruppe → {hold:Set, kampe:n, pr hold}
  for (const k of indledende) {
    const h = holdEllerKast(k.hjemme, k, hold);
    const u = holdEllerKast(k.ude, k, hold);
    if (h === u) throw new Error(`Kamp nr. ${k.nr}: ${h.name} møder sig selv.`);
    if (!k.tid) {
      throw new Error(`Kamp nr. ${k.nr} (${h.name}–${u.name}, ${k.dato}) har intet tidspunkt. `
        + 'En kamp uden kickoff oprettes aldrig (kickoff er tip-deadline) — vent på tiden, eller sæt den i hånden.');
    }
    const fx = {
      id: `r${rundeForDato.get(k.dato)}-${h.hbKode.toLowerCase()}-${u.hbKode.toLowerCase()}`,
      round: rundeForDato.get(k.dato),
      home: h.name,
      away: u.name,
      kickoff: utcIso(k.dato, k.tid, forskydning),
      gruppe: k.gruppe,
    };
    if (k.tidSenest) {
      // Et VINDUE («18:00/30»): den TIDLIGSTE tid er deadline. Så lukker
      // tippet aldrig efter kampstart; i værste fald 30 min for tidligt.
      // Rettes med seed-football --kickoffs-only, når tiden ligger fast.
      fx.kickoffSenest = utcIso(k.dato, k.tidSenest, forskydning);
      usikreTider.push(`${fx.id} ${h.name}–${u.name} ${k.dato}: siden siger «${k.tid}/${k.tidSenest}» — deadline sat til ${k.tid} (det tidligste)`);
    }
    fixtures.push(fx);
    const g = pr.get(k.gruppe) || { hold: new Map(), kampe: 0 };
    g.kampe += 1;
    for (const t of [h, u]) g.hold.set(t.name, (g.hold.get(t.name) || 0) + 1);
    pr.set(k.gruppe, g);
  }

  // Grupperne: præcis formatets bogstaver, 4 hold, 6 kampe, 3 pr. hold, og
  // ingen hold i to grupper.
  const set = new Set();
  if ([...pr.keys()].sort().join() !== format.grupper.join()) {
    throw new Error(`Grupperne på siden er ${[...pr.keys()].sort().join(', ')}, ikke ${format.grupper.join(', ')}.`);
  }
  for (const [navn, g] of pr) {
    const n = format.holdPrGruppe;
    if (g.hold.size !== n || g.kampe !== (n * (n - 1)) / 2 || [...g.hold.values()].some((x) => x !== n - 1)) {
      throw new Error(`Gruppe ${navn} har ${g.hold.size} hold og ${g.kampe} kampe — ikke ${n} hold, der møder hinanden én gang.`);
    }
    for (const t of g.hold.keys()) {
      if (set.has(t)) throw new Error(`${t} står i to grupper.`);
      set.add(t);
    }
  }
  if (set.size !== format.antalHold) throw new Error(`Programmet har ${set.size} hold, ikke ${format.antalHold}.`);
  if (hold.length !== format.antalHold) throw new Error(`Holdfilen har ${hold.length} hold, ikke ${format.antalHold}.`);

  fixtures.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
  // Efter sorteringen: gruppernes rækkefølge er programrækkefølgen.
  const grupper = byggGrupper({ tabeller: gruppeTabeller(wikitekst), fixtures, hold, format });
  return { fixtures, faser, grupper, advarsler, usikreTider, forskydningMin: forskydning };
}

/** Minutter øst for UTC → «UTC+1», «UTC−3», «UTC+5:30». Til noten — tidszonen står i SIDEN, ikke her. */
export function utcTekst(min) {
  if (!Number.isInteger(min)) throw new Error(`utcTekst: forskydningen ${min} er ikke et helt antal minutter`);
  const a = Math.abs(min);
  const t = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${min < 0 ? '−' : '+'}${t}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** Wikipedias adresse for en side (til kildeangivelsen). */
export const wikiSideUrl = (titel) => `https://en.wikipedia.org/wiki/${encodeURIComponent(String(titel).replace(/ /g, '_')).replace(/%27/g, "'")}`;

/**
 * Filen, scriptet skriver (scripts/haandbold-vm2027-program.json). seed-football
 * læser `fixtures` og viser `_note`; `faser` og `grupper` kopieres ordret til
 * scripts/games.mjs (game.faser og game.grupper — games.test.mjs binder dem).
 */
export function programFil(p, { titel, revid = null, hentet = null }) {
  const dato = hentet ? String(hentet).slice(0, 10) : 'ukendt dato';
  return {
    _note: `Håndbold-VM 2027 (herrer), den indledende runde: ${p.fixtures.length} kampe. Bygget af scripts/haandbold-program.mjs `
      + `fra Wikipedia («${titel}», revision ${revid ?? 'ukendt'}, hentet ${dato}); indholdet er CC BY-SA 4.0. `
      + `kickoff er UTC (siden angiver lokal tid ${utcTekst(p.forskydningMin)}). id = r{runde}-{hjemmekode}-{udekode}, runde = spilledag med mindst én medtaget kamp. `
      + 'kickoffSenest står kun, hvor siden har et tidsvindue — deadline er da det tidligste. '
      + 'kickoffSenest og gruppe når IKKE kampene i databasen (seed-football skriver kun round, home, away, kickoff, Elo og odds); vinduet huskes kun her, '
      + 'men gruppen når spillet via grupper. faser og grupper er game.faser og game.grupper (holdene i programrækkefølge) og kopieres ordret til scripts/games.mjs. '
      + 'RET ALDRIG I HÅNDEN: kør scriptet igen.',
    kilde: { side: titel, url: wikiSideUrl(titel), revid, hentet, licens: 'CC BY-SA 4.0' },
    faser: p.faser,
    grupper: p.grupper,
    usikreTider: p.usikreTider,
    fixtures: p.fixtures,
  };
}
