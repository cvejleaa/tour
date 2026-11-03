// src/lib/grupper.js — TURNERINGENS GRUPPER: hvem er i hvilken gruppe, hvilken
// gruppe en kamp hører til, og gruppestillingen (Håndbold-VM 2027).
//
// KUN KLIENTEN, INTET SPEJL ENDNU. Intet afregnes på gruppestillingen: puljens
// facit er semifinalefasens hold (src/lib/puljeFacit.js), og kampene er
// serverens facit. Tabellen er en deterministisk visning af dem, ikke en ny
// sandhed, og en server-skrevet `game.gruppeStillinger` ville være en kopi, der
// skulle holdes synkron ved hver facit-rettelse. Den dag serveren skal bruge
// grupperne (Runde-Botten, en faseKampe-vagt på hovedrundens parringer),
// fødes spejlet functions-platform/grupper.js med en paritetstest i mønstret
// fra functions-platform/faser.test.js.
//
// HVORFOR IKKE leagueTable (superligaScoring.js). Den giver 3 point for en
// sejr, sorterer på målforskel og navn og kender hverken V/U/T eller
// indbyrdes kampe. Den er også spejlet med paritetstest og bærer SL's
// pulje-afregning (championshipTeams), så at parametrisere den ville røre en
// afregning for at tegne en tabel. Tæl-reglen for mål (goalOf) er kopieret
// ORDRET, og en test binder de to til samme K/mål.
//
// IHF AFGØR, HVEM DER GIK VIDERE (QC Q1, husets puljeFacit-princip). Vi regner
// stillingen, men den, der bestemmer hovedrundens hold, er IHF — via de
// hovedrundekampe, ejeren lægger ind (📥 Læg næste fases kampe ind).
// Hovedrundens hold udledes derfor af kampene og gemmes aldrig, og
// `videreHold` er de hold, der FAKTISK har kamp i næste fase — ikke vores
// rang. Er de to uenige, siger grupperAdvarsel det ved navn i Spil-tidsplan.
// Advarslen afgør ingenting; den peger.
//
// DATAKONTRAKTEN (game.grupper, seedet fra scripts/games.mjs):
//   { point: { sejr: 2, uafgjort: 1 },
//     faser: [ { fase: 'Indledende runde', videre: 3, grupper: [{ navn: 'A', hold: [...] }, …] },
//              { fase: 'Hovedrunde',       videre: 2, grupper: [{ navn: 'I', fra: ['A','B'] }, …] } ] }
//   `hold` står i PROGRAMRÆKKEFØLGE (holdenes første optræden i kampprogrammet).
//   Den bruges kun til at ordne hold, der står helt lige — det er ikke en
//   placering, og den kaldes ikke noget andet.
//   Højst to faser: den første med `hold`, den anden med `fra`. En tredje
//   gruppefase ville kræve et afledt medlemskab af et afledt medlemskab; det
//   bygges, den dag en turnering har det.
//
// TIEBREAK — IHF's reglement, ikke Wikipedia. Kilde: «Regulations for IHF
// Competitions (Indoor Handball)», udgaven 21. august 2024, kapitel II «Men's
// and Women's World Championships», afsnittet om gruppekampenes evaluering
// (PDF-side 31-32):
//   https://www.ihf.info/sites/default/files/2024-12/Regulations%20for%20IHF%20Competitions_Indoor%20Handball_E.pdf
//   «If two (2) or more teams have gained the same number of points after the
//   group matches have been completed, their ranking is decided based on the
//   following: results in points between the teams concerned; goal
//   differences in the matches between the teams concerned; greater number of
//   goals scored in the matches between the teams concerned. If the teams are
//   still equal, a decision is made between those teams with equal number of
//   points as follows: goal difference … in all matches; greater number of
//   goals scored in all matches. If a ranking is still not possible, a
//   drawing of lots shall decide.»
// Altså (1) point, (2) indbyrdes point, (3) indbyrdes målforskel, (4) indbyrdes
// mål, (5) målforskel i alle gruppens kampe, (6) flest scorede mål i alle
// gruppens kampe, så lodtrækning. Wikipedias class_rules nævner kun (1)-(5).
// Lodtrækningen kan vi ikke kende: hold, der stadig står lige, får samme
// placering og `delt: true`, og fladen siger det ærligt.
//   GENANVENDELSE: NEJ. Reglementet siger ikke, at (2)-(4) køres igen på den
// rest, der stadig står lige, når de har skilt en blok delvist ad (sådan som
// UEFA's reglement udtrykkeligt gør). Det siger: «If the teams are STILL
// equal … goal difference … in all matches» — altså direkte videre til (5) og
// (6). Vi følger ordlyden. ORAKLET KAN IKKE AFGØRE DET: i de 35 færdige VM-
// tabeller 2021-2025 giver genanvendelse og ikke-genanvendelse præcis samme
// rækkefølge (src/lib/grupper.orakel.test.js, kontrolfundet), så valget
// bæres af ordlyden og en syntetisk test, ikke af en observation. Forskellen
// opstår kun i en cirkulær lighed, hvor de indbyrdes kampe skiller ét hold
// fra og efterlader to, der står helt lige i trekanten, men ikke i deres
// egen kamp. Rammer det stregen, og IHF har afgjort det anderledes, siger
// grupperAdvarsel det, så snart næste fase er lagt ind (Q1).
//   ORAKLET RAMMER: (3) indbyrdes målforskel og (5)/(6) målforskel/mål i alle
// kampe afgør hver mindst én tabel. (2) indbyrdes point afgør ingen alene
// (hvor den skiller, er (3) enig), og (6) nås aldrig; begge bæres syntetisk.
//   Det samme reglement siger, at hovedrunden medtager de indledende resultater
// mod hold, der også gik videre — «points achieved as well as goals scored and
// conceded». Det er præcis, hvad gruppeStilling gør, når den får begge fasers
// kampe: den tæller kun kampe, hvor BEGGE hold er i gruppen.

import { harFaseKalender, faseFor, rundeEtiket } from './faser';

/**
 * Kriterierne ud over point, navngivet. `indbyrdes` regnes på kampene mellem
 * de hold, der står lige; `alle` på alle gruppens kampe. Eksporteret, så
 * orakeltesten kan vise, hvilke kriterier oraklet faktisk rammer.
 */
export const IHF_REGEL = Object.freeze({
  indbyrdes: Object.freeze(['point', 'maalforskel', 'maal']),
  alle: Object.freeze(['maalforskel', 'maal']),
  genanvend: false,
});

const NOEGLE = {
  point: (s) => s.points,
  maalforskel: (s) => s.gf - s.ga,
  maal: (s) => s.gf,
};

// ORDRET fra leagueTable (superligaScoring.js): tomt/null er ikke et mål.
const goalOf = (g) => (g == null || g === '' ? NaN : Number(g));

function holdNavn(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** De afgjorte kampe, hvor BEGGE hold er i `med`. */
function afgjorte(kampe, med) {
  const ud = [];
  for (const m of kampe || []) {
    const hg = goalOf(m?.homeGoals);
    const ag = goalOf(m?.awayGoals);
    if (!m?.home || !m?.away || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    if (!med.has(m.home) || !med.has(m.away)) continue;
    ud.push({ home: m.home, away: m.away, hg, ag });
  }
  return ud;
}

/** K/V/U/T/mål/point pr. hold i `hold`, af de kampe hvor begge er med. */
function tael(hold, kampe, point) {
  const t = new Map(hold.map((h) => [h, { played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, points: 0 }]));
  for (const { home, away, hg, ag } of kampe) {
    const a = t.get(home);
    const b = t.get(away);
    if (!a || !b) continue;
    a.played += 1; b.played += 1;
    a.gf += hg; a.ga += ag; b.gf += ag; b.ga += hg;
    if (hg > ag) { a.won += 1; b.lost += 1; a.points += point.sejr; } else if (hg < ag) {
      b.won += 1; a.lost += 1; b.points += point.sejr;
    } else { a.draw += 1; b.draw += 1; a.points += point.uafgjort; b.points += point.uafgjort; }
  }
  return t;
}

/**
 * Del en blok efter en nøgle (højest først). Inden for samme nøgle bevares
 * blokkens rækkefølge (programrækkefølgen). → liste af del-blokke.
 */
function delOp(blok, noegle, orden) {
  const sorteret = [...blok].sort((x, y) => {
    const a = noegle(x);
    const b = noegle(y);
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return b[i] - a[i];
    return orden.get(x) - orden.get(y);
  });
  const dele = [];
  let forrige = null;
  for (const h of sorteret) {
    const k = noegle(h).join(',');
    if (k !== forrige) dele.push([]);
    dele[dele.length - 1].push(h);
    forrige = k;
  }
  return dele;
}

/** Afgør en blok, der står lige på point. → ordnede del-blokke (længde > 1 = delt). */
function afgoer(blok, ctx) {
  if (blok.length === 1) return [blok];
  const { regel, kampe, point, alt, orden } = ctx;
  const alle = (b) => delOp(b, (h) => regel.alle.map((k) => NOEGLE[k](alt.get(h))), orden);
  const mini = tael(blok, kampe, point);
  const dele = delOp(blok, (h) => regel.indbyrdes.map((k) => NOEGLE[k](mini.get(h))), orden);
  if (dele.length === 1) return alle(blok); // de indbyrdes kampe skiller intet
  return dele.flatMap((d) => {
    if (d.length === 1) return [d];
    return regel.genanvend ? afgoer(d, ctx) : alle(d);
  });
}

/**
 * Stillingen efter en navngivet regel. gruppeStilling er denne med IHF_REGEL;
 * orakeltesten kører den også med kriterier slået fra (kontrolfundet).
 */
export function rangerGruppe(hold, kampe, point, regel = IHF_REGEL) {
  const liste = [...new Set((hold || []).map(holdNavn).filter(Boolean))];
  const orden = new Map(liste.map((h, i) => [h, i]));
  const spillede = afgjorte(kampe, new Set(liste));
  const alt = tael(liste, spillede, point);
  const raekke = (h, rank, delt) => ({ rank, delt, teamName: h, ...alt.get(h) });
  // Før gruppens første afgjorte kamp: ingen placeringstal.
  if (spillede.length === 0) return liste.map((h) => raekke(h, null, false));
  const ctx = { regel, kampe: spillede, point, alt, orden };
  const blokke = delOp(liste, (h) => [alt.get(h).points], orden).flatMap((b) => afgoer(b, ctx));
  const ud = [];
  for (const b of blokke) {
    const rank = ud.length + 1;
    for (const h of b) ud.push(raekke(h, rank, b.length > 1));
  }
  return ud;
}

/**
 * Gruppestillingen efter IHF's kriterier (se headeren).
 * @param {string[]} hold gruppens hold i programrækkefølge
 * @param {Array<{home,away,homeGoals,awayGoals}>} kampe — kun afgjorte kampe
 *   mellem to hold i `hold` tæller; alt andet ignoreres
 * @param {{sejr:number, uafgjort:number}} point
 * @returns {Array<{rank:number|null, delt:boolean, teamName:string, played:number,
 *   won:number, draw:number, lost:number, gf:number, ga:number, points:number}>}
 */
export function gruppeStilling(hold, kampe, point) {
  return rangerGruppe(hold, kampe, point, IHF_REGEL);
}

const GRUPPER_NOEGLER = ['point', 'faser'];
const FASE_NOEGLER = ['fase', 'videre', 'grupper'];
const erObjekt = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * Hvad er der galt med grupperne? Tom liste = gyldige.
 * @param {unknown} grupper game.grupper
 * @param {object} game spillet (faser og teams)
 * @returns {string[]}
 */
export function grupperFejl(grupper, game) {
  if (!erObjekt(grupper)) return ['grupper skal være et objekt'];
  const fejl = [];
  for (const k of Object.keys(grupper)) if (!GRUPPER_NOEGLER.includes(k)) fejl.push(`ukendt nøgle "${k}"`);
  const p = grupper.point;
  if (!erObjekt(p) || !Number.isInteger(p.sejr) || !Number.isInteger(p.uafgjort)
    || p.sejr <= 0 || p.uafgjort < 0 || p.uafgjort >= p.sejr) {
    fejl.push('point skal være { sejr, uafgjort } med heltal, sejr > uafgjort ≥ 0');
  }
  if (!harFaseKalender(game)) fejl.push('spillet har ingen gyldig fasekalender');
  const teams = new Set((Array.isArray(game?.teams) ? game.teams : []).map((t) => holdNavn(t?.name)).filter(Boolean));
  if (!teams.size) fejl.push('spillet har ingen holdliste (teams)');
  const faser = grupper.faser;
  if (!Array.isArray(faser) || faser.length === 0) return [...fejl, 'faser skal være en ikke-tom liste'];
  if (faser.length > 2) fejl.push(`højst to gruppefaser (en med hold, en med fra) — fik ${faser.length}`);
  const navne = new Set();
  let forrigeIdx = -1;
  let forrigeGrupper = null;
  faser.forEach((f, i) => {
    const hvor = `gruppefase ${i + 1}`;
    if (!erObjekt(f)) { fejl.push(`${hvor}: ikke et objekt`); forrigeGrupper = null; return; }
    for (const k of Object.keys(f)) if (!FASE_NOEGLER.includes(k)) fejl.push(`${hvor}: ukendt nøgle "${k}"`);
    const kalIdx = harFaseKalender(game) && typeof f.fase === 'string'
      ? game.faser.findIndex((k) => k.navn === f.fase) : -1;
    if (typeof f.fase !== 'string' || !f.fase.trim()) fejl.push(`${hvor}: fase mangler`);
    else if (harFaseKalender(game)) {
      const hits = game.faser.filter((k) => k.navn === f.fase);
      if (hits.length !== 1) fejl.push(`${hvor}: fasen «${f.fase}» findes ikke (præcis én gang) i spillets fasekalender`);
      else if (hits[0].knockout === true) fejl.push(`${hvor}: fasen «${f.fase}» er knockout — den har ingen grupper`);
      else if (kalIdx <= forrigeIdx) fejl.push(`${hvor}: fasen «${f.fase}» kommer ikke efter forrige gruppefase i kalenderen`);
    }
    if (!Number.isInteger(f.videre) || f.videre < 1) fejl.push(`${hvor}: videre skal være et heltal ≥ 1`);
    if (!Array.isArray(f.grupper) || f.grupper.length === 0) {
      fejl.push(`${hvor}: grupper skal være en ikke-tom liste`);
      forrigeGrupper = null;
      forrigeIdx = Math.max(forrigeIdx, kalIdx);
      return;
    }
    const brugtHold = new Map();
    const brugtFra = new Map();
    f.grupper.forEach((g, j) => {
      const gHvor = `${hvor}, gruppe ${j + 1}`;
      if (!erObjekt(g)) { fejl.push(`${gHvor}: ikke et objekt`); return; }
      const navn = typeof g.navn === 'string' ? g.navn.trim() : '';
      if (!navn) fejl.push(`${gHvor}: navn mangler`);
      else if (navne.has(navn)) fejl.push(`gruppe ${navn} står to gange`);
      else navne.add(navn);
      const vis = navn ? `gruppe ${navn}` : gHvor;
      for (const k of Object.keys(g)) if (!['navn', i === 0 ? 'hold' : 'fra'].includes(k)) fejl.push(`${vis}: ukendt nøgle "${k}"`);
      if (i === 0) {
        if (!Array.isArray(g.hold) || g.hold.length < 2) { fejl.push(`${vis}: hold skal være en liste med mindst 2 hold`); return; }
        if (Number.isInteger(f.videre) && f.videre >= g.hold.length) fejl.push(`${vis}: videre (${f.videre}) skal være færre end gruppens ${g.hold.length} hold`);
        for (const h of g.hold) {
          const n = holdNavn(h);
          if (!n) { fejl.push(`${vis}: et hold er ikke et navn`); continue; }
          if (teams.size && !teams.has(n)) fejl.push(`${vis}: «${n}» står ikke i spillets holdliste`);
          if (brugtHold.has(n)) fejl.push(`«${n}» står i både gruppe ${brugtHold.get(n)} og ${navn}`);
          else brugtHold.set(n, navn);
        }
      } else {
        if (!Array.isArray(g.fra) || g.fra.length === 0) { fejl.push(`${vis}: fra skal være en ikke-tom liste`); return; }
        for (const b of g.fra) {
          if (!forrigeGrupper?.has(b)) fejl.push(`${vis}: fra nævner «${b}», som ikke er en gruppe i forrige gruppefase`);
          if (brugtFra.has(b)) fejl.push(`gruppe ${b} står i fra for både ${brugtFra.get(b)} og ${navn}`);
          else brugtFra.set(b, navn);
        }
      }
    });
    forrigeGrupper = new Set(f.grupper.filter(erObjekt).map((g) => (typeof g.navn === 'string' ? g.navn.trim() : '')));
    forrigeIdx = Math.max(forrigeIdx, kalIdx);
  });
  return fejl;
}

// Evnen slås op ved hver gentegning (fane, kampkort, guide) — huskes pr. spil.
const harCache = new WeakMap();

/** EVNEN: har spillet gyldige grupper på en gyldig fasekalender? Alle flader gater på den. */
export function harGrupper(game) {
  if (!game || typeof game !== 'object') return false;
  if (!harCache.has(game)) {
    harCache.set(game, harFaseKalender(game) && grupperFejl(game.grupper, game).length === 0);
  }
  return harCache.get(game);
}

/** Holdets gruppe i den første gruppefase (med `hold`), eller null. */
function foersteGruppe(game, hold) {
  const n = holdNavn(hold);
  const g = game.grupper.faser[0].grupper.find((x) => x.hold.some((h) => holdNavn(h) === n));
  return g ? g.navn : null;
}

/** Gruppefasen for en kamp: { i, gf } — eller null (knockout, uden for kalenderen, ingen gruppefase). */
function gruppeFaseFor(game, round) {
  const f = faseFor(game, round);
  if (!f || f.knockout) return null;
  const i = game.grupper.faser.findIndex((x) => x.fase === f.navn);
  return i < 0 ? null : { i, gf: game.grupper.faser[i] };
}

/**
 * Kampens gruppe: 'A'..'H' i den indledende runde, 'I'..'IV' i hovedrunden.
 * null: knockout, ukendt fase, uden harGrupper, og når de to hold ikke deler gruppe.
 */
export function kampGruppe(game, m) {
  if (!harGrupper(game) || !m) return null;
  const gfi = gruppeFaseFor(game, m.round);
  if (!gfi) return null;
  const home = holdNavn(m.home);
  const away = holdNavn(m.away);
  if (!home || !away) return null;
  if (gfi.i === 0) {
    const g = gfi.gf.grupper.find((x) => x.hold.some((h) => holdNavn(h) === home) && x.hold.some((h) => holdNavn(h) === away));
    return g ? g.navn : null;
  }
  const a = foersteGruppe(game, home);
  const b = foersteGruppe(game, away);
  if (!a || !b) return null;
  const g = gfi.gf.grupper.find((x) => x.fra.includes(a) && x.fra.includes(b));
  return g ? g.navn : null;
}

/** Kalenderfasen efter `navn` (næste i game.faser), eller null. */
function naesteKalenderFase(game, navn) {
  const i = game.faser.findIndex((f) => f.navn === navn);
  return i >= 0 && i + 1 < game.faser.length ? game.faser[i + 1] : null;
}

/** Kampene i en kalenderfase (på navn). */
function fasensKampe(game, matches, navn) {
  return (matches || []).filter((m) => faseFor(game, m?.round)?.navn === navn);
}

/** Holdene med kamp i en liste af kampe. */
function holdMedKamp(kampe) {
  const s = new Set();
  for (const m of kampe) {
    const h = holdNavn(m?.home);
    const u = holdNavn(m?.away);
    if (h) s.add(h);
    if (u) s.add(u);
  }
  return s;
}

/**
 * Hele gruppebilledet til 📊 Grupper.
 *   Første gruppefase: hold fra game.grupper; kampe = fasens runder.
 *   Anden: hold = hold med kamp i fasens runder, hvis første gruppe ∈ fra (i
 *   fra-rækkefølge, så programrækkefølge); 'klar' når antallet er
 *   videre(første fase) × fra.length; raekker af begge fasers kampe (de
 *   medførte resultater er de første fases kampe mellem to hold, der begge er med).
 *   videreHold = gruppens hold med kamp i NÆSTE kalenderfase, i stillingens
 *   rækkefølge — men kun når de alle er kendt: i første fase, når den gruppe,
 *   de går videre til, er klar (QC Q1); i sidste gruppefase, når netop
 *   `videre` hold har kamp dér. Ellers null.
 * @returns {Array<{fase, videre, start, grupper: Array<{navn, fra?, status, hold, raekker, videreHold}>}>}
 */
export function grupperOversigt(game, matches) {
  if (!harGrupper(game)) return [];
  const { point, faser } = game.grupper;
  const kal = (navn) => game.faser.find((f) => f.navn === navn);
  const ud = faser.map((gf, i) => {
    const kampeHer = fasensKampe(game, matches, gf.fase);
    const kampe = i === 0 ? kampeHer : [...fasensKampe(game, matches, faser[0].fase), ...kampeHer];
    const medHer = holdMedKamp(kampeHer);
    const grupper = gf.grupper.map((g) => {
      if (i === 0) {
        const hold = g.hold.map(holdNavn);
        return { navn: g.navn, status: 'klar', hold, raekker: gruppeStilling(hold, kampe, point), videreHold: null };
      }
      const hold = g.fra.flatMap((b) => faser[0].grupper.find((x) => x.navn === b).hold.map(holdNavn))
        .filter((h) => medHer.has(h));
      const klar = hold.length === faser[0].videre * g.fra.length;
      return {
        navn: g.navn,
        fra: [...g.fra],
        status: klar ? 'klar' : 'venter',
        hold,
        raekker: klar ? gruppeStilling(hold, kampe, point) : null,
        videreHold: null,
      };
    });
    return { fase: gf.fase, videre: gf.videre, start: kal(gf.fase).start, grupper };
  });
  // videreHold: holdene med kamp i næste kalenderfase.
  ud.forEach((f, i) => {
    const naeste = naesteKalenderFase(game, f.fase);
    const videre = naeste ? holdMedKamp(fasensKampe(game, matches, naeste.navn)) : new Set();
    for (const g of f.grupper) {
      if (!g.raekker) continue;
      const vh = g.raekker.map((r) => r.teamName).filter((h) => videre.has(h));
      let kendt = vh.length === f.videre;
      if (i + 1 < ud.length) {
        const til = ud[i + 1].grupper.find((x) => x.fra.includes(g.navn));
        kendt = kendt && til?.status === 'klar';
      }
      g.videreHold = kendt ? vh : null;
    }
  });
  return ud;
}

/** Er hver kamp mellem gruppens hold afgjort (alle mod alle, inkl. medførte)? */
function alleAfgjort(hold, kampe) {
  const n = hold.length;
  return afgjorte(kampe, new Set(hold)).length === (n * (n - 1)) / 2;
}

/**
 * Advarsler til Spil-tidsplan (ved siden af kalenderens). Tom liste = intet.
 *   - ugyldige grupper (grupperFejl) — uden dem forsvinder fanen tavst;
 *   - en kamp i anden gruppefase med et hold uden gruppe, på tværs af
 *     grupper, eller mellem to hold fra samme første gruppe (de har allerede
 *     mødt hinanden; resultatet medføres) — kampen ved navn;
 *   - flere hold fra en gruppe i næste fase, end der går videre;
 *   - Q1: vores entydige rang siger X over stregen, men Y er lagt ind i næste
 *     fase. Kun når gruppens kampe alle er afgjort (ellers er det bare en
 *     facit, der ikke er tastet endnu) og stregen ikke går gennem en delt plads.
 */
export function grupperAdvarsel(game, matches) {
  if (game?.grupper == null) return [];
  const fejl = grupperFejl(game.grupper, game);
  if (fejl.length) return fejl.map((f) => `Grupperne er ugyldige (fanen 📊 Grupper vises ikke): ${f}`);
  if (!harGrupper(game)) return [];
  const ud = [];
  const { faser } = game.grupper;
  const bestemtFor = (navn) => {
    const k = game.faser.find((f) => f.navn === navn);
    return (k?.bestemt || navn).toLowerCase();
  };
  for (let i = 1; i < faser.length; i += 1) {
    for (const m of fasensKampe(game, matches, faser[i].fase)) {
      const home = holdNavn(m.home);
      const away = holdNavn(m.away);
      if (!home || !away) continue;
      const navn = `${rundeEtiket(game, m.round)}: ${home}–${away}`;
      const a = foersteGruppe(game, home);
      const b = foersteGruppe(game, away);
      const uden = [[home, a], [away, b]].filter(([, g]) => !g).map(([h]) => h);
      if (uden.length) {
        ud.push(`${navn} — ${uden.join(' og ')} står ikke i nogen gruppe i ${bestemtFor(faser[0].fase)}. Kampen tælles ikke i grupperne.`);
      } else if (a === b) {
        ud.push(`${navn} — begge hold er fra gruppe ${a} og har allerede mødt hinanden (resultatet medføres). Tjek kampen.`);
      } else if (!kampGruppe(game, m)) {
        ud.push(`${navn} — gruppe ${a} og ${b} er ikke i samme gruppe i ${bestemtFor(faser[i].fase)}. Kampen tælles ikke i grupperne.`);
      }
    }
  }
  const oversigt = grupperOversigt(game, matches);
  oversigt.forEach((f, i) => {
    const naeste = naesteKalenderFase(game, f.fase);
    if (!naeste) return;
    const bestemt = bestemtFor(naeste.navn);
    const videre = holdMedKamp(fasensKampe(game, matches, naeste.navn));
    const kampe = i === 0 ? fasensKampe(game, matches, f.fase)
      : [...fasensKampe(game, matches, oversigt[0].fase), ...fasensKampe(game, matches, f.fase)];
    for (const g of f.grupper) {
      if (!g.raekker) continue;
      const lagtInd = g.raekker.map((r) => r.teamName).filter((h) => videre.has(h));
      if (lagtInd.length > f.videre) {
        ud.push(`Gruppe ${g.navn}: ${lagtInd.length} hold er lagt ind i ${bestemt} (${lagtInd.join(', ')}), men kun ${f.videre} går videre. Tjek ${bestemt}s kampe.`);
        continue;
      }
      if (!g.videreHold || !alleAfgjort(g.hold, kampe)) continue;
      const r = g.raekker;
      if (r[f.videre - 1]?.rank == null) continue;
      if (r[f.videre] && r[f.videre].rank === r[f.videre - 1].rank) continue; // delt hen over stregen
      const vores = r.slice(0, f.videre);
      const mangler = vores.filter((x) => !g.videreHold.includes(x.teamName));
      const ekstra = g.videreHold.filter((h) => !vores.some((x) => x.teamName === h));
      if (!mangler.length) continue;
      ud.push(`Gruppe ${g.navn}: stillingen siger ${mangler.map((x) => `${x.teamName} som nr. ${x.rank}`).join(' og ')}, `
        + `men ${ekstra.join(' og ')} er lagt ind i ${bestemt}. Tjek facit eller ${bestemt}s kampe.`);
    }
  });
  return ud;
}
