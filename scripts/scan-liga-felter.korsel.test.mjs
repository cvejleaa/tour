// Beviset for SELVE scriptet (scan-liga-felter.mjs) — ikke kun for vagterne i lib/ligaFelter.mjs.
//
// Scriptet taler med Admin SDK og kalder process.exit, så det kan ikke importeres i en test. Det KØRES derfor i en
// rigtig node-proces, hvor en resolve-hook (module.register) erstatter `firebase-admin/app` og
// `firebase-admin/firestore` med en stub — Security Reviewers mønster for et LÆS-ONLY script. Stubben er en
// ALLOWLIST: db har kun collection(n).get() og collectionGroup(n).get(). Ethvert andet kald (set, update, delete,
// batch, doc(...), runTransaction) er en TypeError → scriptet dør med exit 1 og stderr → testen bliver rød. Netværk
// er lukket: fetch er kastet af, og hooken afviser http/https/net/tls/child_process og al anden firebase-/@google-cloud-
// import. Intet i testen kan ramme et ægte projekt (SA er en tom stub-fil uden nøgler).
//
// Det binder det, vagternes enhedstest ikke kan: hvilke collection-grupper der læses, at KUN dokumenter under games/
// tælles (top-niveau `messages` er private 1:1-beskeder og ville ellers stå som væg-gift), at hver vagt sidder på SIN
// samling, summerne, exit-koden (2 = noget skal ryddes → workflowet bliver rødt) — og at hele modulgrafen, inkl.
// LQ_TYPES fra src/, kan indlæses af RÅ node (Vitest tåler ekstensionsløse imports i src/, node gør ikke).
// Kræver Node ≥ 20.6 (module.register) — alle CI-jobs kører Node 22.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const her = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(her, 'scan-liga-felter.mjs');
// Hver test starter en node-proces (~150 ms lokalt); en travl CI-maskine må ikke ramme standardens 5 s.
vi.setConfig({ testTimeout: 30000 });

// ─── Stubben (skrives til en temp-mappe, så repoet ikke får hjælpefiler) ────────────────────────────────────────
const REGISTER = String.raw`import { register } from 'node:module';
globalThis.fetch = () => { throw new Error('fetch er forbudt i et læs-only script'); };
register('./hooks.mjs', import.meta.url);
`;
const HOOKS = String.raw`const STUBS = { 'firebase-admin/app': './app.mjs', 'firebase-admin/firestore': './firestore.mjs' };
const FORBUDT = /^(node:)?(https?|http2|net|tls|dgram|child_process|cluster|worker_threads)$/;
export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) return { url: new URL(STUBS[specifier], import.meta.url).href, shortCircuit: true };
  if (/^(firebase|@google-cloud)/.test(specifier) || FORBUDT.test(specifier)) {
    throw new Error('et læs-only script har ikke brug for: ' + specifier);
  }
  return nextResolve(specifier, context);
}
`;
const APP = String.raw`export const cert = (sa) => ({ projectId: sa.project_id });
export const initializeApp = (opts) => {
  if (!opts || !opts.credential) throw new Error('initializeApp uden credential');
  return {};
};
`;
const FIRESTORE = String.raw`import { appendFileSync } from 'node:fs';
const fx = JSON.parse(process.env.SCAN_FIXTURE || '{}', (_nogle, v) => (v && typeof v === 'object' && '$ts' in v ? { toMillis: () => v.$ts } : v));
const log = (linje) => appendFileSync(process.env.SCAN_LOG, linje + '\n');
const snap = (docs = []) => ({ size: docs.length, docs: docs.map((d) => ({ ref: { path: d.path }, data: () => d.data })) });
export function getFirestore() {
  return {
    collection: (navn) => ({ get: async () => { log('collection:' + navn); return snap(fx.collection?.[navn]); } }),
    collectionGroup: (navn) => ({ get: async () => { log('collectionGroup:' + navn); return snap(fx.collectionGroup?.[navn]); } }),
  };
}
`;

let dir;
let taeller = 0;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'scan-liga-felter-'));
  writeFileSync(join(dir, 'register.mjs'), REGISTER);
  writeFileSync(join(dir, 'hooks.mjs'), HOOKS);
  writeFileSync(join(dir, 'app.mjs'), APP);
  writeFileSync(join(dir, 'firestore.mjs'), FIRESTORE);
  writeFileSync(join(dir, 'sa.json'), JSON.stringify({ project_id: 'demo-scan' }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Kør scriptet i en rigtig node-proces. `laest` = de læsninger stubben så, i rækkefølge. */
function koer({ fixture = {}, sa = true } = {}) {
  taeller += 1;
  const logFil = join(dir, `laest-${taeller}.log`);
  const env = { ...process.env, SCAN_FIXTURE: JSON.stringify(fixture), SCAN_LOG: logFil };
  if (sa) env.SA = join(dir, 'sa.json');
  else delete env.SA;
  delete env.NODE_V8_COVERAGE; // en `vitest --coverage`-kørsel må ikke få barneprocessen til at skrive dækningsfiler
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'register.mjs')).href, SCRIPT], {
    env, encoding: 'utf8', timeout: 30000,
  });
  return {
    kode: r.status,
    linjer: (r.stdout || '').split('\n'),
    // fundlinjer = «  <sti>  ejer=<uid>  → <fejl>» — slutlinjerne er også indrykket, men har ingen «ejer=»
    fund: (r.stdout || '').split('\n').filter((l) => / {2}ejer=/.test(l)),
    stderr: r.stderr || '',
    laest: existsSync(logFil) ? readFileSync(logFil, 'utf8').split('\n').filter(Boolean) : [],
  };
}

// ─── Fixtures: realistiske former (som klienten og botten skriver dem) ─────────────────────────────────────────
const ts = { $ts: 1760000000000 };
const dok = (path, data) => ({ path, data });
const SUND = {
  topLiga: dok('leagues/L0', { name: 'Gammel Tour-liga', ownerUid: 'o0', memberUids: ['o0'] }),
  spilLiga: dok('games/g1/leagues/L1', { name: 'Kontoret', ownerUid: 'o1', memberUids: ['o1', 'u1'] }),
  spoergsmaal: dok('games/g1/leagues/L1/questions/q1', { label: 'Hvem bliver topscorer?', type: 'text', points: 5, deadline: null, facit: null, createdBy: 'o1', createdAt: ts }),
  svar: dok('games/g1/leagues/L1/questionAnswers/q1_u1', { questionId: 'q1', uid: 'u1', answer: 'Isaksen', updatedAt: ts }),
  besked: dok('games/g1/leagues/L1/messages/m1', { uid: 'u1', text: 'Hej', createdAt: ts }),
  // Botten skriver via Admin SDK med flere felter end klienten — og skal IKKE meldes.
  bot: dok('games/g1/leagues/L1/messages/m2', { uid: 'runde-bot', displayName: 'Runde-Botten', avatarEmoji: '🤖', system: true, round: 3, text: 'Runde 3 er slut', createdAt: ts }),
  // Top-niveau `messages` = PRIVATE 1:1-beskeder (participants/from/to). Ville stå som væg-gift, hvis filteret mangler.
  privat: dok('messages/dm1', { participants: ['u1', 'u2'], from: 'u1', to: 'u2', text: 'Hej', createdAt: ts }),
};
/** collectionGroup('leagues') returnerer OGSÅ top-niveau-ligaerne — præcis som Firestore gør. */
function fixture({ top = [SUND.topLiga], spil = [SUND.spilLiga], sp = [SUND.spoergsmaal], sv = [SUND.svar], be = [SUND.besked, SUND.bot, SUND.privat] } = {}) {
  return {
    collection: { leagues: top },
    collectionGroup: { leagues: [...top, ...spil], questions: sp, questionAnswers: sv, messages: be },
  };
}

describe('scan-liga-felter.mjs — selve scriptet, kørt i en rigtig node-proces mod en stubbet firebase-admin', () => {
  it('et sundt datasæt: exit 0, intet fund, kun de fem læsninger — og private 1:1-beskeder og top-niveau-ligaer tælles ikke med under games/', () => {
    const k = koer({ fixture: fixture() });
    expect(k.stderr).toBe('');
    expect(k.kode).toBe(0);
    expect(k.linjer).toEqual([
      'leagues (top-niveau): 1 dokumenter, 0 ville blive frosset',
      'games/*/leagues: 1 dokumenter, 0 ville blive frosset',
      'games/*/leagues/*/questions: 1 dokumenter, 0 er forgiftede',
      'games/*/leagues/*/questionAnswers: 1 dokumenter, 0 er forgiftede',
      'games/*/leagues/*/messages: 2 dokumenter, 0 er forgiftede',
      '',
      'Projekt demo-scan:',
      expect.stringMatching(/^ {2}Ligaer: 0 dokument\(er\) ville blive frosset/),
      expect.stringMatching(/^ {2}Spørgsmål\/svar\/beskeder: 0 dokument\(er\)/),
      '',
    ]);
    // Læsningerne som MÆNGDE: præcis disse fem, intet andet — og rækkefølgen er ligegyldig.
    expect([...k.laest].sort()).toEqual([
      'collection:leagues', 'collectionGroup:leagues', 'collectionGroup:messages', 'collectionGroup:questionAnswers', 'collectionGroup:questions',
    ]);
  });

  // Én klasse ad gangen: fjernes én samling fra summen (`top + spil + gift`), eller sidder en vagt på den forkerte
  // samling, bliver PRÆCIS den række rød — ikke en tilfældig. Fundlinjen skal bære sti, ejer og diagnose, for det er dét,
  // der ryddes efter. Handlings-teksten efter diagnosen (« — MURET INDE: sæt et tal …») er fri at omformulere: fundlinjen
  // sammenlignes kun til og med diagnosen.
  const GIFT = [
    ['en top-niveau-liga med id-felt', { top: [SUND.topLiga, dok('leagues/L9', { id: 'X', name: 'N', ownerUid: 'o9' })] },
      '  leagues/L9  ejer=o9  → id-felt ("X")',
      ['leagues (top-niveau): 2 dokumenter, 1 ville blive frosset', 'games/*/leagues: 1 dokumenter, 0 ville blive frosset']],
    ['en spil-liga uden streng-navn', { spil: [SUND.spilLiga, dok('games/g1/leagues/L8', { name: { a: 1 }, ownerUid: 'o8' })] },
      '  games/g1/leagues/L8  ejer=o8  → name er object',
      ['games/*/leagues: 2 dokumenter, 1 ville blive frosset']],
    ['et spørgsmål med deadline "abc" (muret inde)', { sp: [SUND.spoergsmaal, dok('games/g1/leagues/L1/questions/q9', { label: 'Hvem vinder?', type: 'text', points: 5, deadline: 'abc', facit: null, createdBy: 'o1' })] },
      // ejer = createdBy (liga-ejeren): et muret spørgsmål skal kunne føres tilbage til den, der kan rydde det.
      '  games/g1/leagues/L1/questions/q9  ejer=o1  → deadline er string — MURET INDE',
      ['games/*/leagues/*/questions: 2 dokumenter, 1 er forgiftede']],
    ['et spørgsmål med points 150 (reglen kræver 1-100 ved hver rettelse, også facit)', { sp: [SUND.spoergsmaal, dok('games/g1/leagues/L1/questions/q8', { label: 'Hvem vinder?', type: 'text', points: 150, deadline: null, facit: null, createdBy: 'o1' })] },
      '  games/g1/leagues/L1/questions/q8  ejer=o1  → points er 150 — MURET INDE',
      ['games/*/leagues/*/questions: 2 dokumenter, 1 er forgiftede']],
    ['et svar med et map som answer', { sv: [SUND.svar, dok('games/g1/leagues/L1/questionAnswers/q1_u2', { questionId: 'q1', uid: 'u2', answer: { a: 1 } })] },
      '  games/g1/leagues/L1/questionAnswers/q1_u2  ejer=u2  → answer er object',
      ['games/*/leagues/*/questionAnswers: 2 dokumenter, 1 er forgiftede']],
    ['en besked med ekstra felter og uden system', { be: [SUND.besked, dok('games/g1/leagues/L1/messages/m9', { uid: 'u3', displayName: 'Runde-Botten', text: 'Falsk', createdAt: ts })] },
      '  games/g1/leagues/L1/messages/m9  ejer=u3  → ekstra felter: displayName',
      ['games/*/leagues/*/messages: 2 dokumenter, 1 er forgiftede']],
  ];
  it.each(GIFT)('%s → exit 2, og fundet står med sti, ejer og diagnose', (_navn, dele, forventetFund, optaelling) => {
    const k = koer({ fixture: fixture(dele) });
    expect(k.stderr).toBe('');
    expect(k.kode).toBe(2);
    expect(k.fund).toHaveLength(1);
    expect(k.fund[0].slice(0, forventetFund.length)).toBe(forventetFund);
    for (const linje of optaelling) expect(k.linjer).toContain(linje);
  });

  it('ejer i fundlinjen: ownerUid, ellers createdBy (spørgsmål), ellers uid (svar, besked), ellers «?»', () => {
    const k = koer({ fixture: fixture({
      spil: [SUND.spilLiga, dok('games/g1/leagues/La', { name: 5, ownerUid: 'ejer-a', createdBy: 'ikke-denne', uid: 'ikke-denne-heller' })],
      sp: [SUND.spoergsmaal, dok('games/g1/leagues/L1/questions/qd', { label: 5, points: 5, createdBy: 'c-d', uid: 'ikke-denne' })],
      sv: [SUND.svar, dok('games/g1/leagues/L1/questionAnswers/qb', { uid: 'u-b', answer: 5 }), dok('games/g1/leagues/L1/questionAnswers/qc', { answer: 5 })],
    }) });
    expect(k.fund.map((l) => l.split(' — ')[0])).toEqual([
      '  games/g1/leagues/La  ejer=ejer-a  → name er number',
      '  games/g1/leagues/L1/questions/qd  ejer=c-d  → label er number',
      '  games/g1/leagues/L1/questionAnswers/qb  ejer=u-b  → answer er number',
      '  games/g1/leagues/L1/questionAnswers/qc  ejer=?  → answer er number',
    ]);
  });

  it('slutlinjen lægger tallene rigtigt sammen: liga-dokumenter for sig, forgiftede spørgsmål/svar/beskeder for sig', () => {
    const k = koer({ fixture: fixture({
      top: [SUND.topLiga, dok('leagues/L9', { id: 'X', name: 'N', ownerUid: 'o9' })],
      spil: [SUND.spilLiga, dok('games/g1/leagues/L8', { name: 7, ownerUid: 'o8' })],
      sp: [dok('games/g1/leagues/L1/questions/qa', { label: 'ab', points: 5 })],
      sv: [dok('games/g1/leagues/L1/questionAnswers/qa_u1', { uid: 'u1', answer: '' })],
      be: [
        dok('games/g1/leagues/L1/messages/m8', { uid: 'u1', text: '', createdAt: ts }),
        dok('games/g1/leagues/L1/messages/m9', { uid: 'u2', displayName: 'X', text: 'Falsk', createdAt: ts }),
      ],
    }) });
    expect(k.kode).toBe(2);
    expect(k.fund).toHaveLength(6);
    expect(k.linjer).toContain('Projekt demo-scan:');
    expect(k.linjer.find((l) => l.startsWith('  Ligaer: '))).toMatch(/^ {2}Ligaer: 2 dokument\(er\) ville blive frosset/);
    expect(k.linjer.find((l) => l.startsWith('  Spørgsmål/svar/beskeder: '))).toMatch(/^ {2}Spørgsmål\/svar\/beskeder: 4 dokument\(er\)/);
  });

  it('dokumenter uden for games/ springes over: private 1:1-beskeder, brugerundersamlinger, en samling med lignende rod — og de tælles ikke', () => {
    const giftform = { participants: ['u1', 'u2'], from: 'u1', to: 'u2', text: { a: 1 }, createdAt: 'i går' };
    const k = koer({ fixture: fixture({
      sp: [dok('arkiv/g1/leagues/L1/questions/q1', { label: 'ab', deadline: 'abc' })],
      sv: [dok('arkiv/g1/leagues/L1/questionAnswers/a1', { answer: { a: 1 } })],
      be: [
        SUND.besked,
        dok('messages/dm1', giftform),
        dok('users/u1/messages/m1', giftform),
        dok('gamesArkiv/g1/leagues/L1/messages/m1', giftform), // starter med «games», men IKKE med «games/»
      ],
    }) });
    expect(k.stderr).toBe('');
    expect(k.kode).toBe(0);
    expect(k.linjer).toContain('games/*/leagues: 1 dokumenter, 0 ville blive frosset');
    expect(k.linjer).toContain('games/*/leagues/*/questions: 0 dokumenter, 0 er forgiftede');
    expect(k.linjer).toContain('games/*/leagues/*/questionAnswers: 0 dokumenter, 0 er forgiftede');
    expect(k.linjer).toContain('games/*/leagues/*/messages: 1 dokumenter, 0 er forgiftede');
  });

  // Reglens hasOnly lukker netop dette: et medlem, der gemmer bottens kendetegn (system:true + displayName) under eget uid.
  // Botten selv (uid 'runde-bot') skal fortsat springes over — begge opslag står i samme væg.
  it('en forfalsket bot-besked (system:true, medlems-uid) meldes, mens botten selv ikke gør', () => {
    const forfalsket = dok('games/g1/leagues/L1/messages/m7', { uid: 'u-medlem', displayName: 'Runde-Botten', avatarEmoji: '🤖', system: true, text: 'Falsk opslag', createdAt: ts });
    const k = koer({ fixture: fixture({ be: [SUND.bot, forfalsket] }) });
    expect(k.stderr).toBe('');
    expect(k.kode).toBe(2);
    expect(k.fund).toEqual(['  games/g1/leagues/L1/messages/m7  ejer=u-medlem  → ekstra felter: displayName, avatarEmoji, system']);
    expect(k.linjer).toContain('games/*/leagues/*/messages: 2 dokumenter, 1 er forgiftede');
  });

  it('tomme og null-dokumenter vælter ikke scanningen: hvert meldes, exit 2 og ingen stderr', () => {
    const k = koer({ fixture: fixture({
      sp: [
        dok('games/g1/leagues/L1/questions/q0', {}),
        dok('games/g1/leagues/L1/questions/q1', { label: null, points: null, deadline: [], type: null, acceptedAnswers: null }),
      ],
      sv: [dok('games/g1/leagues/L1/questionAnswers/a0', {})],
      be: [
        dok('games/g1/leagues/L1/messages/m0', {}),
        dok('games/g1/leagues/L1/messages/m1', { uid: 'u1', text: 'Hej', createdAt: null }),
      ],
    }) });
    expect(k.stderr).toBe('');
    expect(k.kode).toBe(2);
    expect(k.fund).toHaveLength(5);
    // Flere fejl på ÉT dokument står på ÉN linje, adskilt af komma — ikke kun den første.
    expect(k.fund).toContain('  games/g1/leagues/L1/messages/m0  ejer=?  → text er fraværende, createdAt er fraværende');
    expect(k.fund).toContain('  games/g1/leagues/L1/messages/m1  ejer=u1  → createdAt er null');
  });

  it('uden SA: exit 1, besked på stderr, og intet læses', () => {
    const k = koer({ sa: false });
    expect(k.kode).toBe(1);
    expect(k.stderr).toMatch(/Mangler SA/);
    expect(k.laest).toEqual([]);
  });
});

describe('scan-liga-felter.mjs er LÆS-ONLY', () => {
  // Den dynamiske del af beviset er stubben ovenfor (ingen skrive-metoder findes, så hver kørsel ovenfor er også et
  // bevis). Denne del dækker det, stubben ikke ser: fs-skrivninger og nye importer.
  it('importerer kun fs (readFileSync), firebase-admin/app, firebase-admin/firestore (getFirestore) og vagterne — ingen dynamisk import', () => {
    const kilde = readFileSync(SCRIPT, 'utf8');
    const importer = Object.fromEntries(
      [...kilde.matchAll(/^import\s+\{([^}]*)\}\s+from\s+'([^']+)';/gm)].map((m) => [m[2], m[1].split(',').map((s) => s.trim())]),
    );
    expect(Object.keys(importer)).toEqual(['fs', 'firebase-admin/app', 'firebase-admin/firestore', './lib/ligaFelter.mjs']);
    expect(importer.fs).toEqual(['readFileSync']);
    expect(importer['firebase-admin/firestore']).toEqual(['getFirestore']);
    expect(kilde.match(/^import\b/gm)).toHaveLength(4); // ingen anden import-form end de fire ovenfor
    expect(kilde).not.toMatch(/\bimport\(|\brequire\(/);
  });
});
