// ---------------------------------------------------------------------------
// scripts/haandbold-historik.mjs — færdige kampe fra herre-VM 2019-2025 og
// EM 2020-2026 (Wikipedia) → scripts/haandbold-historik.json, måledata til D4
// (håndboldprofilen: Elo-K, uafgjort-model, startstyrker).
//
// HVAD DEN GØR: henter hver turneringsside ÉN gang via MediaWiki API'et
// (scripts/lib/wikiHent.mjs: beskrivende User-Agent, mindst 1 s mellem kald)
// og gemmer svaret i en lokal cache-mappe. Næste kørsel læser cachen og
// sender intet kald. Reglerne for, hvad en kamp er, står i
// scripts/lib/haandboldHistorik.mjs.
//
// HVAD DEN IKKE GØR: skriver intet i databasen og intet uden --skriv. Den
// henter ALDRIG en side, der ligger i cachen — skal en side hentes igen
// (fx fordi en kamp er rettet på Wikipedia), så slet dens fil i cachen.
//
// ALT ELLER INTET. Fejler én side (hentning eller strukturvagt), skrives der
// intet. En måling på 7 af 8 turneringer, der ligner en måling på 8, er
// netop den tavse fejl, vi ikke vil have. Vil man bevidst måle på færre, så
// sig det med --turneringer, og outputtet siger det samme.
//
// ROBOTS.TXT: se scripts/haandbold-program.mjs (manuelt, lav volumen, API'et).
//
// BRUG:
//   node scripts/haandbold-historik.mjs                       # alle 8, vis; skriv intet
//   node scripts/haandbold-historik.mjs --skriv               # skriv scripts/haandbold-historik.json
//   node scripts/haandbold-historik.mjs --turneringer vm2025,em2026
//   node scripts/haandbold-historik.mjs --cache /sti/til/mappe   # standard: <tmp>/vejleaa-wiki
//   node scripts/haandbold-historik.mjs --filer /sti/til/mappe   # NØDVEJ: gemte sider, intet kald
//
// NØDVEJEN (--filer). Svarer Wikipedia 429, så gem siderne selv og læs dem
// herfra — der sendes da intet kald. Mappen har én fil pr. turnering:
// `vm2019.json` (API-svaret: åbn wikiUrl(titel) i browseren og gem) eller
// `vm2019.wikitext` (rå wikitekst). Kilden får `vej: 'fil'` og filens tid som
// `hentet`, så ingen tror, at scriptet selv har hentet den. Se docs/drift.md.
//
// TRANSKLUDEREDE SIDER. Mappen må OGSÅ have en fil for en side, som en
// turnering transkluderer (TURNERINGER[].transklusioner, fx
// `em2026-finale.wikitext` for EM 2026-finalen). Så indsættes afsnittet, før
// kampene læses, og kilden får `transkluderet` med den sides fil og tid.
// Mangler filen, afvises kampen som 'andenSide' — og regnskabet går op med
// den afviste, ikke i stilhed. API-vejen henter ingen anden side.
//
// Bag en proxy: Node 22's fetch bruger først HTTPS_PROXY med NODE_USE_ENV_PROXY=1.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { lavWikiHenter, parseScriptArgs, laesGemtSide } from './lib/wikiHent.mjs';
import {
  TURNERINGER, udtraekKampe, resume, gemteFiler, sidensTidszone,
} from './lib/haandboldHistorik.mjs';
import { wikiSideUrl } from './lib/haandboldProgram.mjs';

const ROD = join(dirname(fileURLToPath(import.meta.url)), '..');
const UD = join(ROD, 'scripts', 'haandbold-historik.json');

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), { vaerdier: ['turneringer', 'cache', 'filer'], flag: ['skriv'] });
  if (args.filer && args.cache) throw new Error('--filer og --cache udelukker hinanden: --filer læser kun mappen og henter intet.');
  let valgte = TURNERINGER;
  if (args.turneringer) {
    const ønskede = args.turneringer.split(',').map((s) => s.trim()).filter(Boolean);
    const ukendte = ønskede.filter((n) => !TURNERINGER.some((t) => t.noegle === n));
    if (ukendte.length) throw new Error(`ukendte turneringer: ${ukendte.join(', ')}. Kendte: ${TURNERINGER.map((t) => t.noegle).join(', ')}`);
    valgte = TURNERINGER.filter((t) => ønskede.includes(t.noegle));
  }
  let hent;
  // De transkluderede sider (TURNERINGER[].transklusioner): kun fra --filer-
  // mappen. Mangler filen — eller køres der mod API'et — gives siden ikke med,
  // og kampen afvises som 'andenSide' (synligt, som før).
  let andreSider = () => ({});
  if (args.filer) {
    const mappe = resolve(process.cwd(), args.filer);
    const indhold = readdirSync(mappe);
    const filer = gemteFiler(indhold, valgte.map((t) => t.noegle));
    console.log(`Gemte sider: ${mappe} (der sendes intet kald)\n`);
    const laes = (navn, titel) => {
      const sti = join(mappe, navn);
      const side = laesGemtSide(readFileSync(sti, 'utf8'), navn);
      return {
        ...side,
        titel: side.titel ?? titel,
        // Filens tid er det bedste, vi har — og kilden siger, at det er den.
        hentet: side.hentet ?? statSync(sti).mtime.toISOString(),
        vej: 'fil',
        fil: navn,
      };
    };
    hent = async (titel) => laes(filer[valgte.find((x) => x.titel === titel).noegle], titel);
    andreSider = (t) => {
      const par = Object.entries(t.transklusioner ?? {});
      const fundne = gemteFiler(indhold, par.map(([, n]) => n), { valgfri: true });
      return Object.fromEntries(par.filter(([, n]) => fundne[n]).map(([titel, n]) => [titel, laes(fundne[n], titel)]));
    };
  } else {
    const cacheDir = resolve(process.cwd(), args.cache || join(tmpdir(), 'vejleaa-wiki'));
    console.log(`Cache: ${cacheDir}\n`);
    const henter = lavWikiHenter({ cacheDir, log: console.log, nodvej: '--filer <mappe>' });
    hent = async (titel) => ({ ...(await henter(titel)), vej: 'api' });
  }

  const kilder = [];
  const kampe = [];
  for (const t of valgte) {
    const side = await hent(t.titel);
    const andre = andreSider(t);
    const r = udtraekKampe(side.wikitekst, t.noegle, {
      andreSider: Object.fromEntries(Object.entries(andre).map(([titel, a]) => [titel, a.wikitekst])),
    });
    const res = resume(r.kampe);
    const tz = sidensTidszone(side.wikitekst);
    console.log(`${t.noegle}: ${res.kampe} spillede · ${res.uafgjortEfter60} uafgjort efter 60 min · `
      + `${res.forlaenget} forlænget · ${res.straffe} straffekast · ${res.maalPrKamp60} mål/kamp`
      + `${r.ikkeSpillet ? ` · ${r.ikkeSpillet} uden score` : ''} · siden siger ${r.infoboksKampe} kampe`);
    // Tidszonen står UNDER turneringens linje — før stod den over, og så lignede
    // den en note til turneringen ovenfor.
    if (tz.fejl) console.log(`   (tidszone ukendt — tid er lokal uden forskydning: ${tz.fejl})`);
    for (const x of r.transkluderet) console.log(`   ↳ afsnittet «${x.afsnit}» indsat fra «${x.side}» (${andre[x.side].fil})`);
    const ART = { walkover: 'WALKOVER', andenSide: 'AFVIST (anden side)', ulaeselig: 'AFVIST' };
    for (const a of r.afviste) console.log(`   ⚠️  ${ART[a.art]} ${a.sektion}${a.nr ? ` nr. ${a.nr}` : ''}: ${a.grund}`);
    if (Object.keys(r.ukendteFelter).length) console.log(`   (ukendte felter, ikke resultat-lignende: ${Object.entries(r.ukendteFelter).map(([k, n]) => `${k}×${n}`).join(', ')})`);
    kilder.push({
      noegle: t.noegle,
      side: side.titel,
      url: wikiSideUrl(side.titel),
      revid: side.revid,
      hentet: side.hentet,
      vej: side.vej,
      ...(side.fil ? { fil: side.fil } : {}),
      forskydningMin: tz.forskydningMin,
      ...(tz.fejl ? { forskydningGrund: tz.fejl } : {}),
      licens: 'CC BY-SA 4.0',
      ...res,
      infoboksKampe: r.infoboksKampe,
      ...(r.transkluderet.length ? {
        transkluderet: r.transkluderet.map((x) => ({
          side: andre[x.side].titel,
          afsnit: x.afsnit,
          sektion: x.sektion,
          url: wikiSideUrl(andre[x.side].titel),
          revid: andre[x.side].revid,
          hentet: andre[x.side].hentet,
          vej: andre[x.side].vej,
          fil: andre[x.side].fil,
        })),
      } : {}),
      ikkeSpillet: r.ikkeSpillet,
      afviste: r.afviste,
    });
    kampe.push(...r.kampe);
  }

  const alleAfviste = kilder.flatMap((k) => k.afviste);
  const walkovers = alleAfviste.filter((a) => a.art === 'walkover').length;
  const afviste = alleAfviste.length - walkovers;
  console.log(`\nI alt ${kampe.length} kampe fra ${kilder.length} turneringer`
    + `${afviste ? ` · ${afviste} AFVIST (se ovenfor)` : ''}${walkovers ? ` · ${walkovers} walkover (ikke spillet)` : ''}.`);
  if (!args.flag.has('skriv')) {
    console.log('Tør-kørsel — intet skrevet. Kør med --skriv for at skrive scripts/haandbold-historik.json.\n');
    return;
  }
  const fil = {
    _note: `Færdige kampe fra ${kilder.map((k) => k.noegle).join(', ')} (herrer), bygget af scripts/haandbold-historik.mjs fra Wikipedia; `
      + 'indholdet er CC BY-SA 4.0 (kilder med revision nedenfor). efter60 = stillingen efter ordinær tid (det, der tippes på); '
      + 'slut = inkl. forlængelse/straffekast; afgjort = null | forlaenget | straffe. Holdene er Wikipedias koder, '
      + 'undtagen COR (det fælles koreanske hold, VM 2019) og RUS for «Russian Handball Federation» (VM 2021), '
      + 'og Færøerne er FRO overalt (EM 2026-siden skriver FAR; scripts/lib/haandboldHistorik.mjs SAMME_HOLD). '
      + 'dato/tid er turneringens lokale tid (kilder[].forskydningMin; null med forskydningGrund, når siden ikke siger det entydigt). '
      + 'kilder[].vej = api (hentet af scriptet) eller fil (læst med --filer fra en gemt side; hentet = filens tid; '
      + 'revid = null for en .wikitext-fil, for action=raw bærer ingen revision). '
      + 'kilder[].transkluderet = afsnit fra en anden side, indsat hvor siden transkluderer dem ({{#section:Side|Afsnit}}; EM 2026-finalen), '
      + 'med den sides egen fil og tid — kampene derfra står i turneringen som alle andre. '
      + 'Afviste kampe står under kilder[].afviste med grund og art (walkover | andenSide | ulaeselig); '
      + 'kilder[].infoboksKampe er sidens eget kamptal, og læste + afviste (uden walkovers) giver præcis det. '
      + 'RET ALDRIG I HÅNDEN: kør scriptet igen.',
    turneringer: kilder.map((k) => k.noegle),
    kilder,
    kampe,
  };
  writeFileSync(UD, `${JSON.stringify(fil, null, 0).replace(/\},\{"turnering"/g, '},\n{"turnering"')}\n`);
  console.log(`✅ skrev ${UD}\n`);
}

main().catch((e) => { console.error(`\n⚠️  ${e.message}\n   Intet er skrevet.\n`); process.exit(1); });
