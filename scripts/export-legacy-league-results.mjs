// ---------------------------------------------------------------------------
// export-legacy-league-results.mjs — engangs-eksport af de GAMLE spils
// liga-slutstillinger (top 5) til platformen (spil-89af9).
//
// Læser godkendte ligaer i tour-85928 og vm2026-tip, beregner hver ligas
// slutstilling med SPILLETS EGEN scoring-logik (Tour: functions/-modulerne i
// dette repo; VM: vendorede kopier i scripts/legacy-vm/), og skriver top 5 til
// legacyLeagueResults/{source}-{leagueId} i platformens Firestore. Bruges af
// "Indsæt top 5"-funktionen i admin → Send mail.
//
// Miljø:  TOUR_SA, VM_SA, SPIL_SA (stier til service-account-JSON)
//         DRY_RUN=true → udskriv kun, skriv intet.
// Kør via .github/workflows/export-legacy-leagues.yml
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Tour: appens egne moduler (identisk med takke-mailens slutstillinger).
const { leagueStandings: tourLeagueStandings } = require('../functions/thankYouEmail.js');
const { leagueBonusTotalsByUid } = require('../functions/leagueBonus.js');
// VM: vendorede kopier af appens moduler.
const { leagueBonusPointsByUid } = require('./legacy-vm/leagueBonusScoring.cjs');
const { leagueTotal: vmLeagueTotal } = require('./legacy-vm/leagueRecap.cjs');

// ── VM leagueStandings + normalizeScoring (spejler VM/functions/thankYouEmail.js) ──
const VM_DEFAULT_SCORING = { group: true, knockout: true, bonus: true, leagueBonus: true, doubleKnockout: false };

export function vmNormalizeScoring(league) {
  if (league && league.scoring && typeof league.scoring === 'object') {
    return { ...VM_DEFAULT_SCORING, ...league.scoring };
  }
  if (league && league.format) {
    switch (league.format) {
      case 'bonusOnly': return { group: false, knockout: false, bonus: true, leagueBonus: true, doubleKnockout: false };
      case 'knockoutOnly': return { group: false, knockout: true, bonus: false, leagueBonus: true, doubleKnockout: false };
      case 'groupOnly': return { group: true, knockout: false, bonus: false, leagueBonus: true, doubleKnockout: false };
      case 'doubleKnockout': return { group: true, knockout: true, bonus: true, leagueBonus: true, doubleKnockout: true };
      default: return { ...VM_DEFAULT_SCORING };
    }
  }
  return { ...VM_DEFAULT_SCORING };
}

/** Delt "1224"-rangering (samme som begge appers leagueStandings). */
export function rankRows(sorted) {
  let prevPoints = null;
  let prevRank = 0;
  return sorted.map((r, i) => {
    const rank = (prevPoints !== null && r.points === prevPoints) ? prevRank : i + 1;
    prevPoints = r.points;
    prevRank = rank;
    return { ...r, rank };
  });
}

export function vmLeagueStandings(league, membersById, leagueBonusByUid = {}) {
  const scoring = vmNormalizeScoring(league);
  const useLeagueBonus = scoring.leagueBonus === true;
  const uids = Array.isArray(league && league.memberUids) ? league.memberUids : [];
  const sorted = uids
    .map((uid) => {
      const u = membersById[uid];
      if (!u) return null;
      let points = vmLeagueTotal(u, scoring);
      if (useLeagueBonus) points += Number(leagueBonusByUid[uid] || 0);
      return { uid, name: u.displayName || 'Spiller', points };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'da'));
  return { name: (league && league.name) || 'Liga', memberCount: sorted.length, rows: rankRows(sorted) };
}

/** Top-N rækker klar til Firestore ({rank, name, points}). */
export function topRows(rows, n = 5) {
  return rows.slice(0, n).map(({ rank, name, points }) => ({
    rank, name, points: Math.round(Number(points) * 10) / 10,
  }));
}

async function loadAll(db, col) {
  const snap = await db.collection(col).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

/** Tour (tour-85928): slutstilling pr. godkendt liga. */
async function exportTour(db) {
  const [users, leagues, lbQ, lbA, lbAwards] = await Promise.all([
    loadAll(db, 'users'), loadAll(db, 'leagues'), loadAll(db, 'leagueBonus'),
    loadAll(db, 'leagueBonusAnswers'), loadAll(db, 'leagueBonusAwards'),
  ]);
  // Kun godkendte brugere — matcher appens stillingstabel.
  const membersById = {};
  for (const u of users) {
    if (u.status !== 'approved') continue;
    membersById[u.id] = { displayName: u.displayName, stagePoints: u.stagePoints, bonusPoints: u.bonusPoints };
  }
  const qByLeague = new Map();
  for (const q of lbQ) {
    if (!q.leagueId) continue;
    if (!qByLeague.has(q.leagueId)) qByLeague.set(q.leagueId, []);
    qByLeague.get(q.leagueId).push(q);
  }
  const ansByQid = {};
  for (const a of lbA) {
    if (!a.questionId) continue;
    (ansByQid[a.questionId] = ansByQid[a.questionId] || []).push({ uid: a.uid, answer: a.answer });
  }
  const awardsByLeague = new Map();
  for (const a of lbAwards) {
    if (!a.leagueId) continue;
    if (!awardsByLeague.has(a.leagueId)) awardsByLeague.set(a.leagueId, []);
    awardsByLeague.get(a.leagueId).push(a);
  }
  const out = [];
  for (const lg of leagues) {
    if (lg.status !== 'approved') continue;
    const lbByUid = leagueBonusTotalsByUid(qByLeague.get(lg.id) || [], ansByQid, awardsByLeague.get(lg.id) || []);
    const st = tourLeagueStandings(lg, membersById, lbByUid);
    if (st.rows.length < 2) continue;
    out.push({ source: 'tour', sourceLabel: 'Tour de France', leagueId: lg.id, name: st.name, memberCount: st.memberCount, top: topRows(st.rows) });
  }
  return out;
}

/** VM (vm2026-tip): slutstilling pr. godkendt liga. */
async function exportVm(db) {
  const [users, leagues, lbQ, lbA] = await Promise.all([
    loadAll(db, 'users'), loadAll(db, 'leagues'), loadAll(db, 'leagueBonus'), loadAll(db, 'leagueBonusAnswers'),
  ]);
  const membersById = {};
  for (const u of users) {
    if (u.status !== 'approved') continue;
    membersById[u.id] = {
      displayName: u.displayName, groupPoints: u.groupPoints,
      knockoutPoints: u.knockoutPoints, bonusPoints: u.bonusPoints,
    };
  }
  const qByLeague = new Map();
  for (const q of lbQ) {
    if (!q.leagueId) continue;
    if (!qByLeague.has(q.leagueId)) qByLeague.set(q.leagueId, []);
    qByLeague.get(q.leagueId).push(q);
  }
  const ansByLeague = new Map();
  for (const a of lbA) {
    if (!a.leagueId) continue;
    if (!ansByLeague.has(a.leagueId)) ansByLeague.set(a.leagueId, []);
    ansByLeague.get(a.leagueId).push(a);
  }
  const out = [];
  for (const lg of leagues) {
    if (lg.status !== 'approved') continue;
    const lbByUid = leagueBonusPointsByUid(qByLeague.get(lg.id) || [], ansByLeague.get(lg.id) || []);
    const st = vmLeagueStandings(lg, membersById, lbByUid);
    if (st.rows.length < 2) continue;
    out.push({ source: 'vm', sourceLabel: 'VM', leagueId: lg.id, name: st.name, memberCount: st.memberCount, top: topRows(st.rows) });
  }
  return out;
}

async function main() {
  const DRY_RUN = process.env.DRY_RUN === 'true';
  const paths = { TOUR_SA: process.env.TOUR_SA, VM_SA: process.env.VM_SA, SPIL_SA: process.env.SPIL_SA };
  for (const [k, v] of Object.entries(paths)) {
    if (!v) { console.error(`❌ Mangler ${k} (sti til service-account-JSON).`); process.exit(1); }
  }
  const admin = (await import('firebase-admin')).default;
  const app = (name, p) => admin.initializeApp(
    { credential: admin.credential.cert(JSON.parse(readFileSync(p, 'utf8'))) }, name,
  );
  const tourApp = app('tour', paths.TOUR_SA);
  const vmApp = app('vm', paths.VM_SA);
  const spilApp = app('spil', paths.SPIL_SA);

  try {
    const [tour, vm] = await Promise.all([exportTour(tourApp.firestore()), exportVm(vmApp.firestore())]);
    const all = [...tour, ...vm];
    console.log(`Fandt ${tour.length} Tour-liga(er) + ${vm.length} VM-liga(er):`);
    for (const r of all) {
      console.log(`\n— ${r.sourceLabel}: ${r.name} (${r.memberCount} medlemmer)`);
      for (const t of r.top) console.log(`   ${t.rank}. ${t.name} — ${t.points} point`);
    }
    if (DRY_RUN) { console.log('\nDRY_RUN — intet skrevet.'); return; }

    const spilDb = spilApp.firestore();
    const batch = spilDb.batch();
    for (const r of all) {
      batch.set(spilDb.collection('legacyLeagueResults').doc(`${r.source}-${r.leagueId}`), {
        ...r, exportedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`\n✅ Skrev ${all.length} liga-slutstillinger til legacyLeagueResults i spil-89af9.`);
  } finally {
    await Promise.all([tourApp.delete(), vmApp.delete(), spilApp.delete()]);
  }
}

// Kør kun når scriptet startes direkte (så tests kan importere hjælperne).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => { console.error('❌', e); process.exit(1); });
}
