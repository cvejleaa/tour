// ---------------------------------------------------------------------------
// scripts/probe-xg.mjs — LÆSER KUN. Henter xG for sæsonens færdige kampe og
// sammenligner med det faktiske facit: hvem har fået mere (eller mindre), end
// spillet berettigede til?
//
// Findes for at et tal aldrig skal stå som en påstand (CLAUDE.md). Skriver
// intet — hverken i produktionsdata eller i repoet.
//
//   node scripts/probe-xg.mjs            # Superligaen
//   node scripts/probe-xg.mjs --pl       # Premier League
// ---------------------------------------------------------------------------
const T = '5b6ab6f5eb84c60031bbbd24';
const SL = 'https://api.superliga.dk';
const PL = 'https://sdp-prem-prod.premier-league-prod.pulselive.com/api';
const PL_H = { 'User-Agent': 'Mozilla/5.0', Origin: 'https://www.premierleague.com', Referer: 'https://www.premierleague.com/' };

/** 1X2 ud af to tal. */
const udfald = (h, a) => (h > a ? '1' : h < a ? '2' : 'X');

async function superliga() {
  const r = await fetch(`${SL}/events-v2?appName=superligadk&access_token=${T}&env=production&locale=da&seasonId=35802&status=finished`);
  const { events } = await r.json();
  const ud = [];
  for (const e of events) {
    const s = await fetch(`${SL}/opta-stats/events/${e.eventId}/teams?appName=superligadk&access_token=${T}&env=production&locale=da`);
    if (!s.ok) continue;
    const d = await s.json();
    const xg = d.expectedGoals || {};
    ud.push({
      runde: Number(e.round), hjemme: e.homeName, ude: e.awayName,
      mål: [e.score.home, e.score.away],
      xg: [Number(xg.home), Number(xg.away)],
    });
  }
  return ud;
}

async function premierLeague() {
  const r = await fetch(`${PL}/v2/matches?competition=8&season=2026&_limit=100`, { headers: PL_H });
  const { data } = await r.json();
  const ud = [];
  for (const m of data.filter((x) => x.period === 'FullTime')) {
    const s = await fetch(`${PL}/v3/matches/${m.matchId}/stats`, { headers: PL_H });
    if (!s.ok) continue;
    const sider = await s.json();
    const xg = (side) => Number(sider.find((x) => x.side === side)?.stats?.expectedGoals ?? NaN);
    ud.push({
      runde: m.matchWeek, hjemme: m.homeTeam.name, ude: m.awayTeam.name,
      mål: [m.homeTeam.score, m.awayTeam.score],
      xg: [xg('Home'), xg('Away')],
    });
  }
  return ud;
}

const kampe = process.argv.includes('--pl') ? await premierLeague() : await superliga();
const brugbare = kampe.filter((k) => Number.isFinite(k.xg[0]) && Number.isFinite(k.xg[1]));

let uenige = 0;
console.log(`\n${brugbare.length} færdige kampe med xG.\n`);
console.log('Rd  Kamp                                     Facit  xG           Fortjent?');
for (const k of brugbare.sort((a, b) => a.runde - b.runde)) {
  const f = udfald(k.mål[0], k.mål[1]);
  const x = udfald(k.xg[0], k.xg[1]);
  const enig = f === x;
  if (!enig) uenige += 1;
  const navn = `${k.hjemme} – ${k.ude}`.slice(0, 40).padEnd(40);
  console.log(`${String(k.runde).padStart(2)}  ${navn} ${k.mål[0]}-${k.mål[1]}    `
    + `${k.xg[0].toFixed(2)}-${k.xg[1].toFixed(2)}    ${enig ? 'ja' : `NEJ (xG sagde ${x})`}`);
}

// Hold-regnskab: mål minus xG over sæsonen.
const hold = new Map();
const tilfoej = (navn, maal, xg) => {
  const h = hold.get(navn) || { maal: 0, xg: 0, kampe: 0 };
  h.maal += maal; h.xg += xg; h.kampe += 1; hold.set(navn, h);
};
for (const k of brugbare) { tilfoej(k.hjemme, k.mål[0], k.xg[0]); tilfoej(k.ude, k.mål[1], k.xg[1]); }

console.log(`\n${uenige} af ${brugbare.length} kampe (${Math.round(100 * uenige / brugbare.length)} %) endte ANDERLEDES, end xG pegede på.\n`);
console.log('Hold                      Kampe  Mål   xG     Over/under');
for (const [navn, h] of [...hold].sort((a, b) => (b[1].maal - b[1].xg) - (a[1].maal - a[1].xg))) {
  const d = h.maal - h.xg;
  console.log(`${navn.slice(0, 24).padEnd(24)}  ${String(h.kampe).padStart(4)}  ${String(h.maal).padStart(3)}  ${h.xg.toFixed(2).padStart(6)}  ${d >= 0 ? '+' : ''}${d.toFixed(2)}`);
}
