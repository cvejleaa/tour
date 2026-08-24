// ---------------------------------------------------------------------------
// scripts/lib/teamsOnly.mjs — FORLØBET i --teams-only, uden Firebase.
//
// HVORFOR DEN LIGGER HER OG IKKE I SCRIPTET. `teamsVagt` var grundigt
// unit-testet, og alligevel kunne selve linjen `if (!vagt.ok) throw` slettes
// fra scriptet med hele suiten grøn — den ene linje, der bærer forskellen
// mellem "advarer" og "afviser". En vagt, hvis KALD er udækket, er ikke en
// vagt; den er en kommentar med en if-sætning omkring.
//
// Derfor bor forløbet her, hvor det kan køres med en fake `gameRef`, og
// scriptet gør ikke andet end at hente data og skrive dem ud.
// Samme mønster som scripts/lib/doubleChance.mjs.
// ---------------------------------------------------------------------------

import { teamsPlan, teamsVagt, overrideAfvig } from '../../src/lib/seedFootball.js';

/**
 * Kør --teams-only mod et spil.
 *
 * @param {object} o
 * @param {{get:Function, set:Function}} o.gameRef  Firestore-dokumentet
 * @param {Array<object>} o.teams                   holdlisten fra filen
 * @param {boolean} o.skriv                         --skriv
 * @param {*} o.serverTimestamp                     FieldValue.serverTimestamp()
 * @param {(s:string)=>void} [o.log]
 * @returns {Promise<{skrevet:boolean, plan:object, vagt:object, ov:object, grund:string}>}
 *   `grund` er maskinlæsbar: 'skrevet' | 'toerkoersel' | 'blokeret' | 'uaendret'
 * @throws hvis spillet ikke findes, eller hvis vagten afviser under --skriv
 */
export async function koerTeamsOnly({
  gameRef, teams, skriv, serverTimestamp, log = () => {},
}) {
  const snap = await gameRef.get();
  if (!snap.exists) throw new Error(`${gameRef.id ?? 'spillet'} findes ikke — seed spillet først.`);
  const nuvaerende = snap.data().teams;
  if (!Array.isArray(nuvaerende) || !nuvaerende.length) {
    log('\n⚠️  Spillet har ingen holdliste i forvejen.');
    log('   Et spil uden hold skal seedes fuldt, ikke lappes her.');
  }
  log(`Spillet har ${nuvaerende?.length ?? 0} hold i forvejen.`);

  const plan = teamsPlan(teams, nuvaerende);

  // GEMTE OVERRIDES. De vinder over holdlisten i `badgeFor` og er usynlige i
  // fladen, indtil man står på præcis det felt — Randers stod i marine på
  // kampkortet, fordi en override fra før farverne blev MÅLT stadig lå og
  // vandt, mens holdlisten var korrekt hele tiden. Rapporten står her, fordi
  // det er HER holdlisten flytter sig under dem. Den dømmer ikke: datafilen
  // beder selv ejeren sætte Leeds' og Spurs' tredjetrøjer i admin.
  const ov = overrideAfvig(snap.data().teamStyles, teams);
  if (ov.afvig.length || ov.ukendte.length) {
    log(`\n  ${ov.afvig.length} felter er rettet i hånden (games/${gameRef.id}.teamStyles):`);
    for (const a of ov.afvig) {
      const liste = a.liste ? String(a.liste).toUpperCase() : '— (holdlisten har ingen)';
      log(`    ${a.name}  ${a.etiket}: ${String(a.override).toUpperCase()}  ← holdlisten siger ${liste}`);
    }
    if (ov.afvig.length) {
      log('    Overrides VINDER over holdlisten på kampkortet. Er en af dem forældet,');
      log('    tegnes holdet i den gamle farve, uanset hvad holdlisten siger.');
      log('    Nulstil i Admin → 🎨 Hold-farver med ↺ ud for feltet.');
    }
    if (ov.ukendte.length) {
      log(`    ${ov.ukendte.length} override(s) er på hold, der ikke er i spillet: ${ov.ukendte.join(', ')}.`);
      log('    De ryddes, næste gang nogen gemmer i Hold-farver.');
    }
  } else {
    log('\n  ingen farver er rettet i hånden — kampkortene bruger spillets holdliste.');
  }

  // ALLE ændringer vises. Et loft ville bede operatøren tro på resten — og det
  // er netop gennemlæsningen, tør-kørslen findes for.
  if (plan.aendringer.length) {
    log(`\n  ${plan.aendringer.length} feltændringer:`);
    for (const a of plan.aendringer) {
      const vis = (v) => (v === undefined ? '—' : JSON.stringify(v));
      log(`    ${a.name}  ${a.felt}: ${vis(a.fra)} → ${vis(a.til)}`);
    }
  }
  if (plan.tilfoejede.length) log(`\n  hold der kommer til : ${plan.tilfoejede.join(', ')}`);
  if (plan.forsvundne.length) log(`\n  hold der forsvinder : ${plan.forsvundne.join(', ')}`);
  if (plan.dubletter.length) log(`\n  navn to gange i filen: ${plan.dubletter.join(', ')}`);
  if (plan.omrokeret) {
    log('\n  ⚠️  rækkefølgen er en anden. PuljeTip tegner pulje-gitteret i');
    log('      array-orden, så holdknapperne flytter sig for alle spillere.');
  }
  log(`\n  uændrede hold : ${plan.uaendrede}`);

  const vagt = teamsVagt(plan);
  const uaendret = !plan.aendringer.length && !plan.tilfoejede.length
    && !plan.forsvundne.length && !plan.dubletter.length && !plan.omrokeret;

  if (!vagt.ok) {
    log('\n⛔ Denne ændring rører POINT og skrives ikke:');
    for (const g of vagt.grunde) log(`   • ${g}`);
    // KASTER OGSÅ I EN TØR-KØRSEL. Her stod før et råd om at "køre igen med
    // --skriv", og det var forkert i præcis den tilstand, hvor kørslen aldrig
    // ville få lov. Operatøren skal rette holdlisten, ikke prøve igen.
    throw new Error('holdlisten rører point — se begrundelserne ovenfor');
  }

  if (uaendret) {
    log('\nHoldlisten er allerede den, filen beskriver. Intet at gøre.\n');
    return { skrevet: false, plan, vagt, ov, grund: 'uaendret' };
  }
  if (!skriv) {
    log('\nTør-kørsel — der er IKKE skrevet noget. Kør igen med --skriv.\n');
    return { skrevet: false, plan, vagt, ov, grund: 'toerkoersel' };
  }

  await gameRef.set({ teams, updatedAt: serverTimestamp }, { merge: true });
  log(`\n✅ Holdlisten opdateret (${teams.length} hold).\n`);
  return { skrevet: true, plan, vagt, ov, grund: 'skrevet' };
}
