// ---------------------------------------------------------------------------
// scripts/lib/seedGames.mjs — FORLØBET i seedGames, uden Firebase.
//
// HVORFOR DEN FINDES. seed-games.mjs havde ingen tør-kørsel: hver kørsel
// skrev ALLE spil med merge, og det eneste spor var én linje pr. spil
// («findes; status/joinable urørt»). Det var den eneste produktionsskrivning i
// spil-oprettelsen, der ikke kunne læses igennem først — og den skriver de
// felter, en fejl er dyrest i (sync, pulje, faser), som merge aldrig fjerner
// igen. Nu viser kørslen pr. spil, om dokumentet OPRETTES, hvilke felter der
// ÆNDRES (fra → til), hvilke admin-ejede felter der BEVARES, og hvilke felter
// i databasen listen ikke nævner (de bliver stående). Uden `skriv` skrives
// intet.
//
// Trukket ud af scriptet af samme grund som fuldtSeed.mjs og teamsOnly.mjs:
// scriptet initialiserer firebase-admin på øverste niveau og kan ikke testes.
// Her kan en fake Firestore tælle skrivningerne (seedGames.test.mjs).
//
// ÉN VAGT pr. regel: pulje-vagten står øverst (før første læsning), og
// skrivningen står bag ÉN `if (!skriv) return`. Hvad seedet MÅ skrive på et
// spil, afgøres af seedPayload (scripts/seed-payload.mjs) — ikke her.
// ---------------------------------------------------------------------------

import { seedPayload, ADMIN_OWNED } from '../seed-payload.mjs';

// Tidsstemplerne skrives altid og er ikke en ændring, nogen skal læse.
const TIDSFELTER = ['updatedAt', 'createdAt'];

function erMap(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    && Object.getPrototypeOf(v) === Object.prototype;
}

/**
 * Er to værdier ens, som Firestore gemmer dem? Maps og lister sammenlignes
 * dybt; et Timestamp (har toMillis) mod et andet på millisekundet. Alt andet
 * med ===, så 1 og '1' er forskellige — en tal-streng i et sync-id er netop
 * den fejl, der skal ses.
 */
export function ens(a, b) {
  if (a === b) return true;
  if (typeof a?.toMillis === 'function' && typeof b?.toMillis === 'function') {
    return a.toMillis() === b.toMillis();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => ens(x, b[i]));
  }
  if (erMap(a) && erMap(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => Object.hasOwn(b, k) && ens(a[k], b[k]));
  }
  return false;
}

/**
 * De felter, en merge-skrivning af `payload` ÆNDRER på `nu`, som bladstier.
 *
 * MERGE-SEMANTIK: set(..., {merge: true}) fletter maps ned i dybden (kun de
 * nævnte blade overskrives), mens en liste erstattes HELT. Derfor går
 * sammenligningen ned i maps og stopper ved lister.
 *
 * @returns {Array<{felt:string, fra:*, til:*}>}  fra er undefined, når feltet
 *   ikke findes i databasen
 */
export function feltAendringer(payload, nu, sti = '') {
  const ud = [];
  for (const [k, til] of Object.entries(payload)) {
    if (!sti && TIDSFELTER.includes(k)) continue;
    const fra = erMap(nu) ? nu[k] : undefined;
    if (erMap(til) && erMap(fra)) {
      ud.push(...feltAendringer(til, fra, `${sti}${k}.`));
    } else if (!ens(fra, til)) {
      ud.push({ felt: `${sti}${k}`, fra, til });
    }
  }
  return ud;
}

/**
 * Felter i databasen, som skrivningen IKKE rører — merge fjerner aldrig et
 * felt. Også inde i maps, skrivningen fletter i: en nøgle, der er slettet fra
 * `pulje` i games.mjs, står stadig på spillet bagefter, og det skal stå i
 * tør-kørslen, ikke opdages ved afregningen.
 * @returns {string[]} bladstier (en map, payload slet ikke nævner, står som ét navn)
 */
export function staarTilbage(nu, payload, sti = '') {
  if (!erMap(nu)) return [];
  const ud = [];
  for (const [k, v] of Object.entries(nu)) {
    if (!sti && (TIDSFELTER.includes(k) || ADMIN_OWNED.includes(k))) continue;
    if (!Object.hasOwn(payload, k)) ud.push(`${sti}${k}`);
    else if (erMap(v) && erMap(payload[k])) ud.push(...staarTilbage(v, payload[k], `${sti}${k}.`));
  }
  return ud;
}

/**
 * Hvad seedet ville gøre ved ÉT spil.
 *
 * @param {{id:string}} spil           posten fra GAMES
 * @param {{exists:boolean, data:object|null}} dok  spillets dokument nu
 * @param {*} now                      tidsstemplet (FieldValue.serverTimestamp())
 * @returns {{id:string, navn:string, handling:'opret'|'opdater'|'uaendret',
 *   payload:object, aendringer:Array, adminBevaret:Array, staar:string[]}}
 */
export function spilPlan(spil, dok, now) {
  const { id, ...data } = spil;
  const exists = Boolean(dok?.exists);
  const nu = exists ? (dok.data || {}) : null;
  const payload = seedPayload(data, { exists, now });
  const aendringer = exists ? feltAendringer(payload, nu) : [];
  const handling = !exists ? 'opret' : (aendringer.length ? 'opdater' : 'uaendret');
  // Kun på et spil, der findes: ved oprettelsen skrives status/joinable FRA
  // listen (seedPayload), og så er der intet admin-valg at bevare endnu.
  const adminBevaret = exists
    ? ADMIN_OWNED.map((felt) => ({ felt, db: nu[felt], liste: data[felt] }))
    : [];
  return {
    id, navn: data.name, handling, payload, aendringer, adminBevaret,
    staar: exists ? staarTilbage(nu, payload) : [],
  };
}

const vis = (v) => (v === undefined ? '(findes ikke)' : JSON.stringify(v));

/** Tør-kørslens linjer for ét spil — ALLE felter, intet loft. */
export function planLinjer(p) {
  const l = [];
  if (p.handling === 'opret') {
    l.push(`  • ${p.id} — ${p.navn}: OPRETTES`);
    for (const [k, v] of Object.entries(p.payload)) {
      if (TIDSFELTER.includes(k)) continue;
      // En liste af objekter (faser) står én post pr. linje, så kalenderen
      // kan læses dag for dag.
      if (Array.isArray(v) && v.some(erMap)) {
        l.push(`      ${k}:`);
        for (const x of v) l.push(`        ${vis(x)}`);
      } else {
        l.push(`      ${k}: ${vis(v)}`);
      }
    }
    l.push(`      (${ADMIN_OWNED.join(' og ')} skrives fra listen nu — derefter ejer admin dem)`);
    return l;
  }
  l.push(p.handling === 'uaendret'
    ? `  • ${p.id} — ${p.navn}: uændret — skrives ikke`
    : `  • ${p.id} — ${p.navn}: ${p.aendringer.length} ${p.aendringer.length === 1 ? 'felt ændres' : 'felter ændres'}`);
  for (const a of p.aendringer) l.push(`      ${a.felt}: ${vis(a.fra)} → ${vis(a.til)}`);
  for (const b of p.adminBevaret) {
    const forskel = ens(b.db, b.liste) ? '' : ` (listen siger ${vis(b.liste)})`;
    l.push(`      admin-ejet, bevares: ${b.felt} = ${vis(b.db)}${forskel}`);
  }
  if (p.staar.length) {
    l.push(`      står i databasen, listen nævner det ikke — bliver stående (merge fjerner aldrig et felt): ${p.staar.join(', ')}`);
  }
  return l;
}

/**
 * Kør seedGames.
 *
 * @param {object} o
 * @param {Array<object>} o.games             GAMES fra scripts/games.mjs
 * @param {{collection:Function, batch:Function}} o.db
 * @param {boolean} o.skriv                   --skriv. Uden: tør-kørsel.
 * @param {*} o.now                           FieldValue.serverTimestamp()
 * @param {(game:object)=>string[]} o.puljeSeedFejl  vagten (serverens spejl)
 * @param {(s:string)=>void} [o.log]
 * @returns {Promise<{skrevet:boolean, planer:Array}>}
 * @throws hvis én post har en pulje-fejl — FØR der læses eller skrives noget
 */
export async function koerSeedGames({ games, db, skriv, now, puljeSeedFejl, log = () => {} }) {
  // AFVIS HELE KØRSLEN før den første skrivning: et halvt seedet katalog er
  // værre end intet. Også i tør-kørslen — dens plan ville vise en pulje, der
  // aldrig kan afgøres, som om den var i orden.
  const puljeFejl = games.flatMap((g) => puljeSeedFejl(g).map((f) => `${g.id}: ${f}`));
  if (puljeFejl.length) {
    throw new Error(`Puljen kan ikke seedes — intet er skrevet:\n  ${puljeFejl.join('\n  ')}`);
  }

  const col = db.collection('games');
  const planer = [];
  for (const g of games) {
    const snap = await col.doc(g.id).get();
    planer.push(spilPlan(g, { exists: snap.exists, data: snap.exists ? snap.data() : null }, now));
  }

  const skrives = planer.filter((p) => p.handling !== 'uaendret');
  log(`\n${skriv ? 'SKRIVER' : 'TØR-KØRSEL'} — ${games.length} spil i scripts/games.mjs: `
    + `${planer.filter((p) => p.handling === 'opret').length} oprettes, `
    + `${planer.filter((p) => p.handling === 'opdater').length} ændres, `
    + `${planer.filter((p) => p.handling === 'uaendret').length} uændrede.`);
  for (const p of planer) for (const linje of planLinjer(p)) log(linje);

  if (!skriv) {
    log('\nTør-kørsel — der er IKKE skrevet noget. Kør igen med --skriv (workflowet: seedGamesSkriv).');
    return { skrevet: false, planer };
  }
  if (!skrives.length) {
    log('\nIntet at skrive — alle spil står allerede som i listen.');
    return { skrevet: false, planer };
  }
  const batch = db.batch();
  for (const p of skrives) batch.set(col.doc(p.id), p.payload, { merge: true });
  await batch.commit();
  log(`\n✅ ${skrives.length} spil skrevet: ${skrives.map((p) => p.id).join(', ')}.`);
  return { skrevet: true, planer };
}
