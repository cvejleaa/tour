// Tests for postbudet — det, der gør Driftstatus til PUSH. Mailen må aldrig
// lyve, aldrig sendes to gange for det samme, og aldrig udebliver tavst:
//   - et manglende mailetAt tæller som umailet (Firestore-fælden: == null
//     matcher ikke et felt, der mangler — derfor filtreres i kode)
//   - røde/forsinkede kort bliver alarmer og lukkes igen, når kortet er grønt
//   - mailetAt sættes KUN når mindst én modtager fik mailen — og så også, når
//     én af to bouncer
//   - SMTP/modtagere/afsendelse, der fejler, er FEJL på kortet + en alarm,
//     aldrig et tavst ok
//   - indholdet: grupperet, afkortet, escaped, uden links fra alarm-tekster,
//     uden uid'er — og KOERSEL_NAVN spejler DriftTab.jsx
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  koerPostbud, alarmMail, umailede, erRoedtKort, erForaeldreloest, koerselBesked, afkort, adminModtagere,
  testAlarmBesked, testAlarmTilladt, KOERSEL_NAVN, MAIL_TYPE, DRIFT_URL, MAKS_LINJER, SAMLE_GRAENSE, TEST_INTERVAL_MS,
} = require('./postbud');
const { meldAlarm } = require('./driftlog');

const FieldValue = { serverTimestamp: () => ({ __ts: true }) };

/**
 * En lille Firestore-attrap: samlinger af dokumenter, where med '==' og 'in',
 * doc().get/set(merge), batch og add (emailLog). Dokument-id'et SKAL ramme —
 * ellers kunne koden sætte mailetAt på et andet dokument uden rød test.
 */
function fakeDb(seed = {}) {
  const docs = new Map();
  for (const [col, rows] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(rows)) docs.set(`${col}/${id}`, { ...data });
  }
  const added = [];
  const docRef = (col, id) => ({
    __key: `${col}/${id}`,
    async get() {
      const d = docs.get(`${col}/${id}`);
      return { exists: d != null, data: () => d, id };
    },
    async set(data, opts) {
      if (opts?.merge !== true) throw new Error('set uden merge');
      docs.set(`${col}/${id}`, { ...(docs.get(`${col}/${id}`) || {}), ...data });
    },
  });
  // FIRESTORE-SEMANTIK: et felt, der MANGLER, matcher aldrig «== null» (QC:
  // attrappen behandlede før et manglende felt som null — det modsatte af
  // Firestore, og så kunne den ikke bevise «manglende felt»-fælden).
  const hits = (col, filtre) => [...docs.entries()]
    .filter(([k]) => k.startsWith(`${col}/`))
    .filter(([, d]) => filtre.every(([f, op, v]) => (op === 'in'
      ? v.includes(d[f])
      : (Object.prototype.hasOwnProperty.call(d, f) && d[f] === v))))
    .map(([k, d]) => ({ id: k.slice(col.length + 1), ref: docRef(col, k.slice(col.length + 1)), data: () => d }));
  const colObj = (col) => ({
    doc: (id) => docRef(col, id),
    async get() { return { docs: hits(col, []) }; },
    where(f, op, v) {
      const filtre = [[f, op, v]];
      const self = {
        where(f2, o2, v2) { filtre.push([f2, o2, v2]); return self; },
        async get() { return { docs: hits(col, filtre) }; },
      };
      return self;
    },
    async add(data) { added.push({ col, data }); return { id: `auto${added.length}` }; },
  });
  return {
    _docs: docs,
    _added: added,
    collection: colObj,
    batch() {
      const ops = [];
      return {
        set(ref, data, opts) {
          if (opts?.merge !== true) throw new Error('batch.set uden merge');
          ops.push({ ref, data });
        },
        async commit() { for (const o of ops) await o.ref.set(o.data, { merge: true }); },
      };
    },
  };
}

/** Transporter-attrap: husker modtagere; adresser i `fejler` kaster. */
function fakeTransport(fejler = []) {
  const sendt = [];
  return {
    sendt,
    async sendMail({ to, subject, html }) {
      if (fejler.includes(to)) throw new Error(`bounce ${to}`);
      sendt.push({ to, subject, html });
    },
  };
}

/** Auth-attrap: uid → e-mail; uid uden post kaster som Admin SDK gør. */
function fakeAuth(emails) {
  return {
    async getUser(uid) {
      if (!(uid in emails)) throw new Error(`no user ${uid}`);
      return { uid, email: emails[uid] };
    },
  };
}

const ADMINS = {
  users: {
    ejer: { role: 'owner', status: 'approved', displayName: 'Carsten' },
    adm: { role: 'globalAdmin', status: 'approved', displayName: 'Bo' },
    spiller: { role: 'player', status: 'approved', displayName: 'Per' },
    venter: { role: 'globalAdmin', status: 'pending', displayName: 'Ny' },
  },
};
const AUTH = fakeAuth({ ejer: 'ejer@x.dk', adm: 'adm@x.dk', spiller: 'per@x.dk', venter: 'ny@x.dk' });
/** Spillene, der synkes — tests med sweep/kickoff-kort skal nævne deres spil her. */
const SYNK = new Set(['sl', 'pl']);
const alarm = (over = {}) => ({
  type: 'strandet', gameId: 'sl', kampId: 'k1', besked: 'Kampen k1 mangler facit', titel: 'Kamp mangler facit',
  kraeverKvittering: false, antal: 1, foersteSetAt: 1000, sidstSetAt: 1000, loestAt: null, kvitteretAt: null, mailetAt: null,
  ...over,
});

describe('umailede — et manglende felt tæller som umailet', () => {
  it('tager åbne alarmer uden mailetAt (også dem, der mangler feltet helt) — ikke mailede, ikke løste', () => {
    const udenFelt = alarm({ id: 'a' });
    delete udenFelt.mailetAt;
    const ud = umailede([
      udenFelt,
      alarm({ id: 'b', mailetAt: null }),
      alarm({ id: 'c', mailetAt: 5 }),
      alarm({ id: 'd', loestAt: 7 }),
    ]);
    expect(ud.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('erRoedtKort — samme prædikat som StatusKort', () => {
  it('forsinket (serverens naesteForventetFoer passeret) eller niveau fejl; null-frist er aldrig forsinket', () => {
    expect(erRoedtKort({ naesteForventetFoer: 900, niveau: 'ok' }, 1000)).toBe(true);
    expect(erRoedtKort({ naesteForventetFoer: 1100, niveau: 'ok' }, 1000)).toBe(false);
    expect(erRoedtKort({ naesteForventetFoer: null, niveau: 'ok' }, 1000)).toBe(false);
    expect(erRoedtKort({ naesteForventetFoer: null, niveau: 'fejl' }, 1000)).toBe(true);
    expect(erRoedtKort({ naesteForventetFoer: 1100, niveau: 'advarsel' }, 1000)).toBe(false);
  });

  it('beskeden siger HVAD der er ramt — med kørslens danske navn og spillets navn, ikke rå id\'er', () => {
    const sen = koerselBesked({ type: 'sweep', gameId: 'sl', gameNavn: 'Superligaen', naesteForventetFoer: 900, koertAt: 100, niveau: 'ok' }, 1000);
    expect(sen).toMatch(/^Times-sweep \(facit \+ tabel\) for Superligaen har ikke kørt til tiden/);
    expect(sen).toContain('send denne mail til udvikleren');
    const roed = koerselBesked({ type: 'kickoff', gameId: 'pl', gameNavn: 'Premier League', naesteForventetFoer: 2000, niveau: 'fejl', besked: '✖ Kørslen fejlede: HTTP 500 https://api.x/y' }, 1000);
    expect(roed).toContain('Daglig kickoff-synk for Premier League fejlede: ✖ Kørslen fejlede: HTTP 500 [url]');
    expect(roed).not.toContain('https://');
  });
});

describe('koerPostbud — kørsels-vagten', () => {
  it('et forsinket kort bliver en koersel-alarm med kvitteringskrav — og lukkes, når kortet er grønt igen', async () => {
    const db = fakeDb({
      driftlog: { 'sweep-sl': { type: 'sweep', gameId: 'sl', gameNavn: 'Superligaen', niveau: 'ok', naesteForventetFoer: 900, koertAt: 100 } },
      ...ADMINS,
    });
    const t = fakeTransport();
    const r1 = await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000, synkedeSpil: SYNK });
    const a = db._docs.get('driftAlarmer/sl_sweep-sl_koersel');
    expect(a).toBeTruthy();
    expect(a.kraeverKvittering).toBe(true);
    expect(a.loestAt).toBeNull();
    expect(r1.tal.roedeKort).toBe(1);
    // Den nye alarm er umailet → mailen går ud i samme kørsel.
    expect(t.sendt).toHaveLength(2);
    expect(a.mailetAt).toBe(1000);
    // Kortet bliver grønt → alarmen lukkes.
    await db.collection('driftlog').doc('sweep-sl').set({ naesteForventetFoer: 9000, koertAt: 2000 }, { merge: true });
    const r2 = await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 2500, synkedeSpil: SYNK });
    expect(db._docs.get('driftAlarmer/sl_sweep-sl_koersel').loestAt).toBe(2500);
    expect(r2.tal.roedeKort).toBe(0);
    expect(t.sendt).toHaveLength(2); // ingen ny mail om en løst alarm
  });

  it('et rødt kort (niveau fejl) med null-frist er en koerselFejl-alarm UDEN kvitteringskrav; postbudets eget kort springes over', async () => {
    const db = fakeDb({
      driftlog: {
        'reminder-sl': { type: 'reminder', gameId: 'sl', gameNavn: 'Superligaen', niveau: 'fejl', besked: '✖ SMTP mangler', naesteForventetFoer: null },
        postbud: { type: 'postbud', gameId: null, gameNavn: 'Platformen', niveau: 'fejl', besked: '✖ x', naesteForventetFoer: 1 },
      },
      ...ADMINS,
    });
    await koerPostbud(db, FieldValue, { transporter: fakeTransport(), auth: AUTH, nowMs: 1000, synkedeSpil: SYNK });
    const a = db._docs.get('driftAlarmer/sl_reminder-sl_koerselFejl');
    expect(a).toMatchObject({ type: 'koerselFejl', kraeverKvittering: false, loestAt: null });
    expect(a.besked).toContain('Daglig tip-påmindelse for Superligaen fejlede: ✖ SMTP mangler');
    expect([...db._docs.keys()].filter((k) => k.includes('_koersel') && !k.includes('reminder-sl'))).toEqual([]);
  });

  it('et fejlet kort for et spil med en åben SPECIFIK alarm (strandet) dubleres IKKE — alarmen står ikke to gange i mailen', async () => {
    const db = fakeDb({
      driftlog: { 'sweep-sl': { type: 'sweep', gameId: 'sl', gameNavn: 'Superligaen', niveau: 'fejl', besked: '✖ 1 strandet', naesteForventetFoer: 9e9 } },
      driftAlarmer: { 'sl_k1_strandet': alarm() },
      ...ADMINS,
    });
    const t = fakeTransport();
    const r = await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000, synkedeSpil: SYNK });
    expect(db._docs.get('driftAlarmer/sl_sweep-sl_koerselFejl')).toBeUndefined();
    expect(r.tal.umailede).toBe(1);
    expect((t.sendt[0].html.match(/<li>/g) || []).length).toBe(1);
  });

  it('en VEDVARENDE rød tilstand giver ÉN mail — ikke en ny hvert 6. time (ingen kvittering, ingen genåbning)', async () => {
    const T6 = 6 * 3600 * 1000;
    const db = fakeDb({
      driftlog: { 'livemaal-sl': { type: 'livemaal', gameId: 'sl', gameNavn: 'Superligaen', niveau: 'fejl', besked: '✖ x', naesteForventetFoer: null } },
      ...ADMINS,
    });
    const t = fakeTransport();
    await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000, synkedeSpil: SYNK });
    await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000 + T6 + 1, synkedeSpil: SYNK });
    await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000 + 2 * T6 + 2, synkedeSpil: SYNK });
    expect(t.sendt).toHaveLength(2); // 2 modtagere × 1 mail
    expect(db._docs.get('driftAlarmer/sl_livemaal-sl_koerselFejl').mailetAt).toBe(1000);
  });

  it('et FORÆLDRELØST kort (spil taget ud af SYNCED_GAMES) giver ingen alarm — det ville aldrig lukke', async () => {
    expect(erForaeldreloest({ type: 'sweep', gameId: 'pl-gammel' }, SYNK)).toBe(true);
    expect(erForaeldreloest({ type: 'sweep', gameId: 'sl' }, SYNK)).toBe(false);
    expect(erForaeldreloest({ type: 'reminder', gameId: 'pl-gammel' }, SYNK)).toBe(false);
    expect(erForaeldreloest({ type: 'postbud', gameId: null }, SYNK)).toBe(false);
    const db = fakeDb({
      driftlog: { 'kickoff-pl-gammel': { type: 'kickoff', gameId: 'pl-gammel', gameNavn: 'PL efterår', niveau: 'ok', naesteForventetFoer: 1, koertAt: 0 } },
      ...ADMINS,
    });
    const t = fakeTransport();
    await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000, synkedeSpil: SYNK });
    expect([...db._docs.keys()].filter((k) => k.startsWith('driftAlarmer/'))).toEqual([]);
    expect(t.sendt).toHaveLength(0);
  });

  it('kaster kørsels-vagten, bliver det en ADVARSEL — og mailen om de eksisterende alarmer går ud alligevel', async () => {
    const db = fakeDb({ driftAlarmer: { a1: alarm() }, ...ADMINS });
    const origCollection = db.collection;
    db.collection = (name) => {
      if (name === 'driftlog') return { get: async () => { throw new Error('Firestore nede'); } };
      return origCollection(name);
    };
    const t = fakeTransport();
    const r = await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000, synkedeSpil: SYNK });
    expect(r.niveau).toBe('advarsel');
    expect(r.besked).toContain('Kørsels-vagten fejlede: Firestore nede');
    expect(t.sendt).toHaveLength(2);
  });
});

describe('koerPostbud — mailen', () => {
  it('ingen umailede alarmer: ok, intet sendes, og allerede mailede tælles som åbne', async () => {
    const db = fakeDb({ driftAlarmer: { a1: alarm({ mailetAt: 5 }) }, ...ADMINS });
    const t = fakeTransport();
    const r = await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000 });
    expect(r.niveau).toBe('ok');
    expect(r.besked).toBe('Ingen nye alarmer at maile (1 åben, alle mailet).');
    expect(t.sendt).toHaveLength(0);
  });

  it('sender ÉN mail pr. godkendt owner/globalAdmin (Auth-adressen), sætter mailetAt og logger typen drift-alarm', async () => {
    const db = fakeDb({ driftAlarmer: { a1: alarm() }, games: { sl: { name: 'Superligaen 2026/27' } }, ...ADMINS });
    const t = fakeTransport();
    const r = await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000 });
    expect(r.niveau).toBe('ok');
    expect(r.besked).toBe('Sendt til 2 modtagere (1 alarm).');
    expect(t.sendt.map((m) => m.to).sort()).toEqual(['adm@x.dk', 'ejer@x.dk']);
    expect(t.sendt[0].html).toContain('Superligaen 2026/27 — Kamp mangler facit');
    expect(db._docs.get('driftAlarmer/a1').mailetAt).toBe(1000);
    expect(db._added.filter((x) => x.col === 'emailLog').map((x) => x.data.type)).toEqual([MAIL_TYPE, MAIL_TYPE]);
  });

  it('en kvitteret, men umailet alarm mailes STADIG — én admin må ikke kunne kvittere en mail væk for de andre', async () => {
    const db = fakeDb({ driftAlarmer: { a1: alarm({ kraeverKvittering: true, kvitteretAt: 900 }) }, ...ADMINS });
    const t = fakeTransport();
    const r = await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000 });
    expect(r.tal.sendt).toBe(2);
    expect(t.sendt[0].html).toContain('allerede kvitteret');
  });

  it('uden SMTP: FEJL på kortet, en postbud-alarm, og mailetAt sættes IKKE (prøves igen)', async () => {
    const db = fakeDb({ driftAlarmer: { a1: alarm() }, ...ADMINS });
    const r = await koerPostbud(db, FieldValue, { transporter: null, auth: AUTH, nowMs: 1000 });
    expect(r.niveau).toBe('fejl');
    expect(r.besked).toBe('SMTP_PASSWORD mangler — 1 alarm kunne ikke mailes.');
    expect(db._docs.get('driftAlarmer/a1').mailetAt).toBeNull();
    expect(db._docs.get('driftAlarmer/smtp_postbud')).toMatchObject({ type: 'postbud', kraeverKvittering: true, loestAt: null });
  });

  it('ingen modtagere (kun spillere, ikke-godkendte eller uden Auth-adresse): FEJL + alarm', async () => {
    const db = fakeDb({
      driftAlarmer: { a1: alarm() },
      users: { ejer: { role: 'owner', status: 'approved' }, adm: { role: 'globalAdmin', status: 'pending' }, p: { role: 'player', status: 'approved' } },
    });
    const t = fakeTransport();
    const r = await koerPostbud(db, FieldValue, { transporter: t, auth: fakeAuth({ p: 'p@x.dk', adm: 'adm@x.dk' }), nowMs: 1000 });
    expect(r.niveau).toBe('fejl');
    expect(r.besked).toMatch(/^Ingen modtager med e-mail/);
    expect(t.sendt).toHaveLength(0);
    expect(db._docs.get('driftAlarmer/modtagere_postbud')).toMatchObject({ type: 'postbud', loestAt: null });
    expect(db._docs.get('driftAlarmer/a1').mailetAt).toBeNull();
  });

  it('én af to modtagere bouncer: ADVARSEL — men mailetAt sættes (ellers mailes den anden hvert kvarter for evigt)', async () => {
    const db = fakeDb({ driftAlarmer: { a1: alarm() }, ...ADMINS });
    const t = fakeTransport(['adm@x.dk']);
    const r = await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000 });
    expect(r.niveau).toBe('advarsel');
    expect(r.besked).toBe('Sendt til 1 modtager (1 alarm). 1 modtager fejlede — se Mail-log.');
    expect(db._docs.get('driftAlarmer/a1').mailetAt).toBe(1000);
  });

  it('ALLE modtagere bouncer: FEJL, afsendelses-alarm, og mailetAt sættes IKKE', async () => {
    const db = fakeDb({ driftAlarmer: { a1: alarm() }, ...ADMINS });
    const t = fakeTransport(['adm@x.dk', 'ejer@x.dk']);
    const r = await koerPostbud(db, FieldValue, { transporter: t, auth: AUTH, nowMs: 1000 });
    expect(r.niveau).toBe('fejl');
    expect(r.besked).toBe('Afsendelse fejlede til alle 2 modtagere — 1 alarm prøves igen.');
    expect(db._docs.get('driftAlarmer/a1').mailetAt).toBeNull();
    expect(db._docs.get('driftAlarmer/afsendelse_postbud')).toMatchObject({ type: 'postbud', loestAt: null });
  });

  it('en vellykket afsendelse LUKKER postbudets egne alarmer igen', async () => {
    const db = fakeDb({ driftAlarmer: { a1: alarm() }, ...ADMINS });
    await meldAlarm(db, FieldValue, { type: 'postbud', gameId: null, kampId: 'smtp', besked: 'x', kraeverKvittering: true, nowMs: 500 });
    await koerPostbud(db, FieldValue, { transporter: fakeTransport(), auth: AUTH, nowMs: 1000 });
    expect(db._docs.get('driftAlarmer/smtp_postbud').loestAt).toBe(1000);
  });
});

describe('alarmMail — indholdet', () => {
  const navne = { sl: 'Superligaen', pl: 'Premier League' };

  it('én alarm: emnet bærer HAST-ORDET forrest, titel og spil; kroppen titel, afkortet tekst, første-set og det faste link', () => {
    const { subject, html } = alarmMail([alarm({ kraeverKvittering: true })], { spilNavne: navne });
    expect(subject).toBe('Vejleaa Tip · I dag: Kamp mangler facit (Superligaen)');
    expect(html).toContain('<strong>Superligaen — Kamp mangler facit</strong>');
    expect(html).toContain('Kampen k1 mangler facit');
    expect(html).toContain('skal kvitteres');
    expect(html).toContain(`<a href="${DRIFT_URL}">Åbn Driftstatus</a> — er du ikke logget ind, så log ind og tryk på linket igen.`);
    expect(html).toContain('du får ingen mail om det');
    expect(html).toContain('Driftvagten har fundet 1 ting, du ikke har fået mail om før.');
    expect(html).not.toContain('siden sidste mail'); // forkert for baseline-mailen
    expect(html).not.toContain('sl —'); // spilnavn, ikke gameId
  });

  it('én alarm, der HASTER, får «Haster:» forrest — det er den, der skal kunne skilles ud i indbakken', () => {
    const { subject } = alarmMail([alarm({ type: 'kickoff48t', titel: 'Kamp flyttet til under 48 timer' })], { spilNavne: navne });
    expect(subject).toBe('Vejleaa Tip · Haster: Kamp flyttet til under 48 timer (Superligaen)');
    const udv = alarmMail([alarm({ type: 'detaljerAfvist', titel: 'Kilden har skiftet form', gameId: null })]);
    expect(udv.subject).toBe('Vejleaa Tip · Til udvikleren: Kilden har skiftet form');
  });

  it('flere alarmer: den mest hastende gruppe forrest i emnet, tæller, og haste-grupperne i rækkefølge', () => {
    const { subject, html } = alarmMail([
      alarm({ type: 'detaljerLukket', titel: 'Kilden har lukket os ude', besked: 'kør scripts/maal-livescore.mjs' }),
      alarm({ type: 'kickoff48t', titel: 'Kamp flyttet til under 48 timer', kampId: 'k2', besked: 'k2 er flyttet' }),
      alarm({ type: 'strandet', gameId: 'pl', besked: 'x' }),
    ], { spilNavne: navne });
    expect(subject).toBe('Vejleaa Tip · Haster: 3 driftalarmer (1 haster)');
    expect(html).toContain('Driftvagten har fundet 3 ting, du ikke har fået mail om før.');
    const iHaster = html.indexOf('Haster — før næste kampstart');
    const iIdag = html.indexOf('Kan vente til i dag');
    const iUdv = html.indexOf('Til udvikleren — intet du skal gøre');
    expect(iHaster).toBeGreaterThan(-1);
    expect(iHaster).toBeLessThan(iIdag);
    expect(iIdag).toBeLessThan(iUdv);
  });

  it('uden hastende alarmer: «I dag:» forrest og ingen haster-parentes', () => {
    const { subject } = alarmMail([alarm(), alarm({ kampId: 'k2' })], { spilNavne: navne });
    expect(subject).toBe('Vejleaa Tip · I dag: 2 driftalarmer');
    expect(subject).not.toMatch(/haster/i);
  });

  it('flere end SAMLE_GRAENSE ens alarmer i samme spil samles i ÉN linje med antal og første-set', () => {
    const mange = Array.from({ length: SAMLE_GRAENSE + 2 }, (_, i) => alarm({ kampId: `k${i}`, foersteSetAt: 1000 + i }));
    const { subject, html, linjer } = alarmMail(mange, { spilNavne: navne });
    expect(linjer).toBe(1);
    expect(subject).toBe(`Vejleaa Tip · I dag: ${SAMLE_GRAENSE + 2} × Kamp mangler facit (Superligaen)`);
    expect(html).toContain(`Superligaen — ${SAMLE_GRAENSE + 2} × Kamp mangler facit`);
    expect(html).toContain(`${SAMLE_GRAENSE + 2} alarmer — se Driftstatus for hver enkelt`);
    // HVILKE — ikke kun hvor mange (QC): de første fem id'er, resten som (+N).
    expect(html).toContain('Gælder: k0, k1, k2, k3, k4.');
    expect((html.match(/<li>/g) || []).length).toBe(1);
    const syv = Array.from({ length: 7 }, (_, i) => alarm({ kampId: `k${i}` }));
    expect(alarmMail(syv, { spilNavne: navne }).html).toContain('Gælder: k0, k1, k2, k3, k4 (+2).');
  });

  it(`højst ${MAKS_LINJER} linjer — resten står som «og N flere»`, () => {
    const mange = Array.from({ length: MAKS_LINJER + 5 }, (_, i) => alarm({ type: `t${i}`, titel: `Titel ${i}`, kampId: `k${i}` }));
    const { html } = alarmMail(mange, { spilNavne: navne });
    expect((html.match(/<li>/g) || []).length).toBe(MAKS_LINJER);
    expect(html).toContain('… og 5 flere — se Driftstatus.');
  });

  it('ESCAPER alt fra alarm-tekster, afkorter til 300 tegn, og gør aldrig en URL klikbar', () => {
    // URL'en står FØR afkortningen — ellers er det afkortningen, der fjerner
    // den, og testen beviser ikke, at [url]-erstatningen findes.
    const lang = `https://ond.dk/phish <b>fed</b> ${'x'.repeat(400)}`;
    const { html } = alarmMail([alarm({ besked: lang, titel: '<i>t</i>' })], { spilNavne: { sl: '<s>Spil</s>' } });
    expect(html).not.toContain('<b>fed</b>');
    expect(html).not.toContain('<i>t</i>');
    expect(html).not.toContain('<s>Spil</s>');
    expect(html).toContain('&lt;s&gt;Spil&lt;/s&gt;');
    expect(html).not.toContain('ond.dk');
    expect(html).toContain('[url]');
    // Eneste link i mailen er det faste til Driftstatus.
    expect((html.match(/<a /g) || []).length).toBe(1);
    expect(html.match(/x{300}/)).toBeNull();
  });

  it('kun test-alarmer: TEST-emne og teksten om, at intet skal gøres', () => {
    const { subject, html } = alarmMail([alarm({ type: 'test', titel: 'Test-alarm', gameId: null, kampId: 'u1', besked: testAlarmBesked('Carsten', 0), kraeverKvittering: true })]);
    expect(subject).toBe('Vejleaa Tip – TEST-alarm: alarm-mailen virker');
    expect(html).toContain('Dette er en test af alarm-mailen');
    expect(html).toContain('Platformen — Test-alarm');
    expect(html).toContain('Test-alarm udløst af Carsten');
  });

  it('en test-alarm SAMMEN med en ægte er ikke en test-mail', () => {
    const { subject } = alarmMail([alarm({ type: 'test', titel: 'Test-alarm', gameId: null }), alarm()], { spilNavne: navne });
    expect(subject).not.toContain('TEST');
    expect(subject).toBe('Vejleaa Tip · I dag: 2 driftalarmer');
  });

  it('ingen uid og ingen adresse i mailen — heller ikke test-alarmens kampId (uid) eller modtagerens adresse', () => {
    const uid = 'kX8Pg1Dr8qgyUnj0ZwBJTRoWTvx1';
    const { html, subject } = alarmMail([
      alarm({ type: 'test', titel: 'Test-alarm', gameId: null, kampId: uid, besked: testAlarmBesked('Carsten', 0), kraeverKvittering: true }),
      alarm({ kampId: 'k1', besked: 'Kampen k1 mangler facit' }),
    ], { spilNavne: navne });
    expect(html).not.toContain(uid);
    expect(subject).not.toContain(uid);
    expect(html).not.toContain('@');
  });

  it('en alarm uden titel-felt (gammelt dokument) får titlen fra typen', () => {
    const a = alarm();
    delete a.titel;
    const { html } = alarmMail([a], { spilNavne: navne });
    expect(html).toContain('Superligaen — Kamp mangler facit');
  });
});

describe('test-alarmens tekst', () => {
  it('nævner navnet, aldrig uid — og siger, at kvitteringen lukker den', () => {
    const t = testAlarmBesked('Carsten', Date.parse('2026-10-13T09:02:00Z'));
    expect(t).toMatch(/^Test-alarm udløst af Carsten .*— ingen handling nødvendig\. Kvittér den, når mailen er kommet; så forsvinder den\.$/);
    expect(testAlarmBesked(undefined, 0)).toContain('udløst af en administrator');
  });
});

describe('afkort', () => {
  it('URL → [url], whitespace → ét mellemrum, hård grænse med …', () => {
    expect(afkort('a  \n b https://x.dk/y?z=1 c')).toBe('a b [url] c');
    expect(afkort('abcdef', 4)).toBe('abc…');
    expect(afkort(null)).toBe('');
  });

  it('fjerner også det, en mail-klient selv gør klikbart: www., tre-leds-domæner og .dk/.com — men ikke filnavne og versioner', () => {
    expect(afkort('se www.evil.dk/x nu')).toBe('se [url] nu');
    expect(afkort('tip.vejleaa.dk.evil.com/admin')).toBe('[url]');
    expect(afkort('api.superliga.dk svarede 429')).toBe('[url] svarede 429');
    expect(afkort('evil.dk')).toBe('[url]');
    expect(afkort('ret kampDetaljer.js og v1.22.0')).toBe('ret kampDetaljer.js og v1.22.0');
    expect(afkort('kør scripts/maal-livescore.mjs')).toBe('kør scripts/maal-livescore.mjs');
  });
});

describe('testAlarmTilladt — 10 minutter mellem test-alarmer', () => {
  it('ingen tidligere test → tilladt; under 10 min siden → nej; præcis 10 min → ja; kvittering flytter ikke sidstSetAt', () => {
    expect(testAlarmTilladt(null, 1000)).toBe(true);
    expect(testAlarmTilladt({ sidstSetAt: 1000 }, 1000 + TEST_INTERVAL_MS - 1)).toBe(false);
    expect(testAlarmTilladt({ sidstSetAt: 1000 }, 1000 + TEST_INTERVAL_MS)).toBe(true);
    expect(testAlarmTilladt({ sidstSetAt: 1000, kvitteretAt: 2000, loestAt: 2000 }, 3000)).toBe(false);
  });
});

describe('adminModtagere', () => {
  it('kun godkendte owner/globalAdmin — adressen fra Auth; en uid uden Auth-konto springes over', async () => {
    const db = fakeDb(ADMINS);
    const ud = await adminModtagere(db, fakeAuth({ ejer: 'ejer@x.dk', spiller: 'per@x.dk', venter: 'ny@x.dk' }));
    expect(ud).toEqual([{ uid: 'ejer', email: 'ejer@x.dk', navn: 'Carsten' }]);
  });
});

describe('DRIFT_URL peger på den fane, AdminPage faktisk har — paritet', () => {
  it('?fane=<TAB_DRIFT> — omdøbes fanen, falder mailens link ellers tilbage til Brugere med grøn suite (QC)', () => {
    const kilde = readFileSync(new URL('../src/pages/AdminPage.jsx', import.meta.url), 'utf8');
    const m = kilde.match(/const TAB_DRIFT\s*=\s*'([^']+)'/);
    expect(m, 'fandt ikke TAB_DRIFT i AdminPage.jsx').not.toBeNull();
    expect(DRIFT_URL.endsWith(`/admin?fane=${m[1]}`)).toBe(true);
  });
});

describe('KOERSEL_NAVN spejler DriftTab.jsx — paritet (mønstret fra mailMarkdown)', () => {
  it('samme nøgler og samme danske navne som TYPE_NAVN i src/features/admin/DriftTab.jsx', () => {
    const kilde = readFileSync(new URL('../src/features/admin/DriftTab.jsx', import.meta.url), 'utf8');
    const blok = kilde.match(/const TYPE_NAVN = \{([\s\S]*?)\n\};/);
    expect(blok, 'fandt ikke TYPE_NAVN i DriftTab.jsx').not.toBeNull();
    const klient = Object.fromEntries([...blok[1].matchAll(/^\s*(\w+): '([^']*)'/gm)].map((m) => [m[1], m[2]]));
    expect(klient).toEqual(KOERSEL_NAVN);
  });
});
