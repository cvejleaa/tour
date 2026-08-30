// ---------------------------------------------------------------------------
// scripts/maal-holdliste.mjs — HVAD VILLE HOLD-LISTEN FAKTISK VISE?
//
// Findes, fordi planens eget eksempel var opdigtet. Jeg skrev "typisk
// Brøndby" som eksempel på et hold, der scorer UNDER sine målchancer; målt
// ligger Brøndby i den anden ende. Den intuition var begrundelsen for at
// bygge fladen, og den holdt ikke (CLAUDE.md: et tal uden kode er en påstand).
//
// Scriptet svarer på to ting, en flade ikke selv kan vise:
//   1. Hvad ville der stå i listen lige nu — hold for hold.
//   2. Hænger forskellen sammen med, hvor MANGE kampe holdet har? En SUM
//      vokser med n, så en usorteret sum sætter systematisk holdet med
//      mindst data yderst. Det var Quality Controls blokerende fund (B2), og
//      det er derfor, kolonnen normaliseres pr. kamp.
//
// Læser de SAMME providers som serveren — ikke en kopi.
//
// HOLDNAVNE: `hentFaerdige` bærer dem ikke (kontrakten er
// {sourceKey, homeGoals, awayGoals}), og det skal den heller ikke — kernen
// har ikke brug for dem. Navnene hentes derfor fra de committede
// program-filer, der er seedet FRA de samme kilder, og nøgles på præcis den
// nøgle, providerne selv bruger. Første udgave af scriptet antog navne på
// facit-rækkerne og printede "ingen hold med målchancer" for begge spil —
// derfor rapporterer det nu HØJLYDT, hvor mange kampe der ikke kunne
// forbindes. En tom tabel skal ikke kunne læses som "ingen data".
//
// BRUG: node scripts/maal-holdliste.mjs
// ---------------------------------------------------------------------------

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { PROVIDERS, SYNCED_GAMES, matchDocId } = require('../functions-platform/syncProviders');

const HER = dirname(fileURLToPath(import.meta.url));
const tal = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const laes = (fil) => JSON.parse(readFileSync(join(HER, fil), 'utf8')).fixtures;

// Program → { sourceKey: {docId, home, away} }. Nøglen SKAL dannes på samme
// måde som providerens egen, ellers rammer opslaget aldrig:
//   superliga  sourceKey = docId  = matchDocId(runde, hjemme, ude)
//   pulselive  sourceKey = matchId, docId = r{runde}-{matchId}
const PROGRAM = {
  superliga2627: () => {
    const m = new Map();
    for (const f of laes('superliga-fixtures.json')) {
      const key = matchDocId(f.round, f.home, f.away);
      m.set(key, { docId: key, home: f.home, away: f.away });
    }
    return m;
  },
  'pl2627-efteraar': () => {
    const m = new Map();
    for (const f of laes('premier-league-fixtures-2627.json')) {
      const matchId = String(f.id).slice(String(f.id).indexOf('-') + 1);
      m.set(matchId, { docId: f.id, home: f.home, away: f.away });
    }
    return m;
  },
};

async function hentSpil(g) {
  const p = PROVIDERS[g.provider];
  const program = PROGRAM[g.gameId]();
  const faerdige = await p.hentFaerdige(g.sync, fetch);

  const ukendte = faerdige.filter((f) => !program.has(String(f.sourceKey)));
  const kendte = faerdige.filter((f) => program.has(String(f.sourceKey)));
  const docIds = kendte.map((f) => program.get(String(f.sourceKey)).docId);
  const xg = docIds.length
    ? await p.hentXg(g.sync, fetch, docIds, Date.now() + 10 * 60 * 1000)
    : [];
  const ved = new Map(xg.map((x) => [String(x.sourceKey), x]));

  const hold = new Map();
  const foeg = (navn, maal, imod, xgFor, xgImod) => {
    const h = hold.get(navn) || { navn, kampe: 0, maal: 0, imod: 0, xg: 0, xgImod: 0 };
    h.kampe += 1; h.maal += maal; h.imod += imod; h.xg += xgFor; h.xgImod += xgImod;
    hold.set(navn, h);
  };
  let udenXg = 0;
  for (const f of kendte) {
    const navne = program.get(String(f.sourceKey));
    const x = ved.get(String(f.sourceKey));
    const xh = x ? tal(x.xgHome) : null;
    const xa = x ? tal(x.xgAway) : null;
    if (xh === null || xa === null) { udenXg += 1; continue; }
    foeg(navne.home, f.homeGoals, f.awayGoals, xh, xa);
    foeg(navne.away, f.awayGoals, f.homeGoals, xa, xh);
  }
  return {
    raekker: [...hold.values()],
    faerdige: faerdige.length,
    ukendte: ukendte.length,
    udenXg,
  };
}

function rapportér(navn, { raekker, faerdige, ukendte, udenXg }) {
  console.log(`\n=== ${navn} ===`);
  console.log(`Færdige kampe hos kilden: ${faerdige}. `
    + `Uden for programfilen: ${ukendte}. Uden brugbare målchancer: ${udenXg}.`);
  if (ukendte) {
    console.log('ADVARSEL: kampe uden for programfilen tælles IKKE med. Er tallet stort,');
    console.log('er navne-nøglen drevet fra kilden, og tabellen herunder er ufuldstændig.');
  }
  if (!raekker.length) { console.log('Ingen hold med målchancer.'); return; }

  const med = raekker.map((r) => ({
    ...r,
    forskel: Math.round((r.maal - r.xg) * 10) / 10,
    prKamp: Math.round(((r.maal - r.xg) / r.kampe) * 100) / 100,
  })).sort((a, b) => b.prKamp - a.prKamp);

  console.log('\nhold                     n   mål    xG  forskel  pr. kamp');
  console.log('---------------------- --- ----- ----- -------- ---------');
  for (const r of med) {
    console.log(`${r.navn.slice(0, 22).padEnd(22)} ${String(r.kampe).padStart(3)} `
      + `${String(r.maal).padStart(5)} ${r.xg.toFixed(1).padStart(5)} `
      + `${(r.forskel > 0 ? '+' : '') + r.forskel.toFixed(1)}`.padStart(9)
      + ` ${((r.prKamp > 0 ? '+' : '') + r.prKamp.toFixed(2)).padStart(9)}`);
  }

  // Hænger forskellen sammen med antallet af kampe? Sortér på SUM og se, om
  // yderpunkterne er dem med færrest kampe.
  const efterSum = [...med].sort((a, b) => (b.maal - b.xg) - (a.maal - a.xg));
  const n = (r) => r.kampe;
  const antal = [...med.map(n)].sort((a, b) => a - b);
  const median = antal[Math.floor(antal.length / 2)];
  console.log(`\nAntal kampe pr. hold: ${antal[0]}–${antal[antal.length - 1]}, median ${median}.`);
  console.log(`Sorteret på SUM er nr. 1 "${efterSum[0].navn}" med ${n(efterSum[0])} kampe, `
    + `og nr. sidst "${efterSum[efterSum.length - 1].navn}" med ${n(efterSum[efterSum.length - 1])}.`);
  console.log('Står ét af yderpunkterne under medianen, er listen n-afhængig — og dét er');
  console.log('grunden til, at fladen sorterer PR. KAMP og ikke på summen.');
}

async function main() {
  console.log(`Målt: ${new Date().toISOString()}`);
  for (const g of SYNCED_GAMES) {
    rapportér(g.gameId, await hentSpil(g));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
