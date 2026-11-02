// ---------------------------------------------------------------------------
// scripts/lib/fuldtSeed.mjs — FORLØBET i et fuldt seed, uden Firebase.
//
// Trukket ud af seed-football.mjs af samme grund som teamsOnly.mjs: scriptet
// kræver en rigtig database og har ingen tests, så selve skrivningen af
// spil-dokumentet stod uden dækning. Det var dér, fejlen lå — `teams` og
// `eloCurrent` blev skrevet ubetinget ved hvert gen-seed. Her kan en fake
// Firestore tælle, hvad der faktisk skrives.
//
// Beslutningen (hvilke felter må skrives) bor i `spilDokPlan` i
// src/lib/seedFootball.js. ÉN vagt — forløbet spørger dér og skriver ikke selv
// reglen af.
// ---------------------------------------------------------------------------

import {
  seedPlan, spilDokPlan, teamsPlan, ukendteHold, kickoffMs,
} from '../../src/lib/seedFootball.js';
import { seedKampe, sportLinje } from './seedKampe.mjs';

/**
 * Kør et fuldt seed mod ét spil.
 *
 * @param {object} o
 * @param {{id?:string, get:Function, set:Function}} o.gameRef
 * @param {{doc:Function}} o.matchesRef
 * @param {{set:Function, commit:Function}} o.batch
 * @param {Array<object>} o.fixtures                  kampprogrammet (efter --runder)
 * @param {Map<string, object>} o.eksisterende        kampene, der står i forvejen
 * @param {Array<object>} o.teams                     holdlisten fra filen
 * @param {boolean} o.skriv                           --skriv
 * @param {boolean} [o.overskrivHold]                 --overskriv-hold
 * @param {*} o.serverTimestamp                       FieldValue.serverTimestamp()
 * @param {(ms:number)=>*} o.tilTimestamp             Timestamp.fromMillis
 * @param {(s:string)=>void} [o.log]
 * @returns {Promise<{skrevet:boolean, nye:number, medOdds:number, dok:object}>}
 * @throws hvis spillet ikke findes, sporten er ukendt, eller (under --skriv)
 *   kampprogrammet nævner hold, holdlisten ikke kender
 */
export async function koerFuldtSeed({
  gameRef, matchesRef, batch, fixtures, eksisterende, teams, skriv,
  overskrivHold = false, serverTimestamp, tilTimestamp, log = () => {},
}) {
  const navn = gameRef.id ?? 'spillet';
  const snap = await gameRef.get();
  // ET SPIL UDEN DOKUMENT AFVISES — også i tør-kørslen. Sporten og
  // fasekalenderen står på dokumentet (seedGames skriver dem); uden det ville
  // et håndboldspil blive prissat med fodboldens profil, og tør-kørslen ville
  // vise de forkerte odds som rigtige.
  if (!snap.exists) {
    throw new Error(
      `games/${navn} findes ikke. Kør seedGames først (Deploy platform med seedGames) — `
      + 'uden spil-dokumentet kender seedet hverken sporten eller holdlisten. Der er IKKE skrevet noget.',
    );
  }
  const game = snap.data() || {};

  // En kamp, der ALLEREDE har odds, må ikke få dem skrevet om — det var den
  // fælde, det gamle script havde. Seedes et program igen (fx fordi to runder
  // mangler), skal de eksisterende kampes odds stå urørt.
  const plan = seedPlan(fixtures, eksisterende);
  const medOdds = plan.springOver.length;
  if (medOdds) {
    log(`\n⚠️  ${medOdds} af kampene har allerede frosne odds. De springes over.`);
    log('   Skal odds genberegnes, sker det af recomputeSeasonElo på ULÅSTE kampe.');
  }

  const dok = spilDokPlan(game, teams, { overskrivHold });
  logSpilDok({ dok, game, teams, log });

  // Et SAT, men ukendt game.sport kaster i seedKampe (også i tør-kørslen) —
  // run().catch giver exit 1 med beskeden. Linjen viser det RÅ felt.
  const { sportRaa, profil, matches } = await seedKampe({ gameRef, fixtures: plan.skriv, teams: dok.prisHold });
  log(sportLinje({ sportRaa, profil }));

  // Den TAVSE fælde: teamElo giver sportens neutrale rating for et navn, den
  // ikke kender. Tjekkes mod den liste, kampene FAKTISK prises af — bevares
  // spillets holdliste, er et hold, der kun står i filen, ukendt for spillet.
  const ukendte = ukendteHold(fixtures, dok.prisHold);
  if (ukendte.length) {
    const hvor = dok.skrivTeams ? 'holdlisten' : `spillets holdliste (games/${navn}.teams)`;
    log(`\n⚠️  ${ukendte.length} holdnavne i kampprogrammet findes IKKE i ${hvor}:`);
    log(`   ${ukendte.join(', ')}`);
    log(`   De ville få neutral Elo (${profil.elo.START}) uden en eneste fejlbesked.`);
    if (skriv) throw new Error('Ukendte holdnavne — ret holdlisten eller kampprogrammet først.');
  }

  let nye = 0;
  for (const m of matches) {
    if (skriv) {
      const ms = kickoffMs(m.kickoff);
      batch.set(matchesRef.doc(m.id), {
        round: m.round,
        home: m.home,
        away: m.away,
        // kickoffMs — IKKE new Date(). Det fulde seed SKABER deadlines, så en
        // tidszone-løs streng her ville give tre forskellige tip-deadliner
        // afhængigt af, hvor scriptet blev kørt (UTC, dansk laptop, CI).
        kickoff: ms == null ? null : tilTimestamp(ms),
        eloHome: m.eloHome,
        eloAway: m.eloAway,
        odds: m.odds,
        updatedAt: serverTimestamp,
      }, { merge: true });
    }
    nye += 1;
  }

  log(`\n  kampe i filen : ${fixtures.length}`);
  log(`  springes over : ${medOdds} (har allerede odds)`);
  log(`  skrives       : ${nye}`);
  const p = matches[0];
  if (p) log(`\n  eksempel: R${p.round} ${p.home}–${p.away}  odds ${p.odds['1']}/${p.odds.X}/${p.odds['2']}`);

  if (!skriv) {
    log('\nTør-kørsel — der er IKKE skrevet noget. Kør igen med --skriv.\n');
    return { skrevet: false, nye, medOdds, dok };
  }

  // Pulje-/bonus-deadline sættes IKKE her — den styres af admin i
  // "Spil-tidsplan" (game.puljeLockAt).
  const felter = {};
  if (dok.skrivTeams) felter.teams = dok.prisHold;
  if (dok.skrivElo) {
    const eloCurrent = {};
    for (const t of dok.prisHold) eloCurrent[t.name] = t.elo;
    felter.eloCurrent = eloCurrent;
  }
  // Intet at skrive på spillet → spil-dokumentet røres slet ikke, heller ikke
  // `updatedAt`. Et gen-seed er dermed en skrivning af kampe og intet andet.
  if (Object.keys(felter).length) await gameRef.set({ ...felter, updatedAt: serverTimestamp }, { merge: true });
  if (nye) await batch.commit();
  log(`\n✅ ${nye} kampe seedet til games/${navn}/matches.\n`);
  return { skrevet: true, nye, medOdds, dok };
}

/**
 * Tør-kørslen skal vise forskellen på første seed, gen-seed og overskrivning
 * — det er netop det, operatøren skal tage stilling til, før `--skriv`.
 */
function logSpilDok({ dok, game, teams, log }) {
  const antalElo = (e) => (e && typeof e === 'object' ? Object.keys(e).length : 0);
  log('\nSpil-dokumentet (teams og eloCurrent):');
  if (dok.grund === 'overskriv') {
    log(`  ⚠️  --overskriv-hold: teams (${teams.length} hold) og eloCurrent OVERSKRIVES fra holdlisten.`);
    log('     teams[].elo er seed for den levende Elo — næste facit omskriver sæsonens');
    log('     Elo-historik og prisen på hver ulåst kamp. eloCurrent sættes tilbage til');
    log('     startværdierne, indtil 💰 Ompris kampene eller næste facit kører.');
  } else if (dok.grund === 'foerste') {
    log(`  første seed — teams (${teams.length} hold) og eloCurrent skrives fra holdlisten.`);
  } else {
    if (dok.skrivTeams) log(`  teams mangler på spillet — skrives fra holdlisten (${teams.length} hold).`);
    else log(`  teams BEVARES (spillet har ${game.teams.length} hold).`);
    if (dok.skrivElo) log(`  eloCurrent mangler på spillet — skrives fra ${dok.skrivTeams ? 'holdlisten' : 'spillets holdliste'}.`);
    else log(`  eloCurrent BEVARES (levende Elo for ${antalElo(game.eloCurrent)} hold).`);
    if (!dok.skrivTeams && !dok.skrivElo) log('  Kun kampe skrives. Kampene prises af spillets egen holdliste.');
  }

  // Afviger filen fra spillet, skal operatøren se det — også når spillets
  // liste bevares. Det var den forhåndsvisning, det gamle seed manglede.
  if (Array.isArray(game.teams) && game.teams.length) {
    const tp = teamsPlan(teams, game.teams);
    const afvig = tp.aendringer.length + tp.tilfoejede.length + tp.forsvundne.length;
    if (afvig) {
      log(`  holdlisten i filen afviger fra spillets: ${tp.aendringer.length} feltændringer, `
        + `${tp.tilfoejede.length} hold kommer til, ${tp.forsvundne.length} forsvinder.`);
      if (dok.grund === 'overskriv') {
        // ALLE ændringer vises — samme regel som --teams-only. Det er netop
        // gennemlæsningen, der er vagten, når teamsVagt ikke spørges.
        const vis = (v) => (v === undefined ? '—' : JSON.stringify(v));
        for (const a of tp.aendringer) log(`    ${a.name}  ${a.felt}: ${vis(a.fra)} → ${vis(a.til)}`);
        if (tp.tilfoejede.length) log(`    hold der kommer til : ${tp.tilfoejede.join(', ')}`);
        if (tp.forsvundne.length) log(`    hold der forsvinder : ${tp.forsvundne.join(', ')}`);
      } else {
        log('  Farver og kortkoder rettes med --teams-only. Skal elo eller antallet af hold');
        log('  ændres, så kør med --overskriv-hold (og læs tør-kørslen først).');
      }
    }
  }
}
