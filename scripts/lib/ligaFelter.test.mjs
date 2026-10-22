// Vagterne i ligaFelter.mjs skal sige det samme som firestore.rules — ellers
// finder scanningen enten for meget (støj) eller for lidt (et muret spørgsmål
// overses). Grænserne læses derfor ud af reglen her, så de ikke kan drive.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ligaFejl, spoergsmaalFejl, svarFejl, beskedFejl,
  SPOERGSMAAL_TYPER, LABEL_MIN, LABEL_MAKS, FACIT_MAKS, SVAR_MAKS, ALTERNATIVER_MAKS, BESKED_MAKS, BESKED_FELTER,
  POINTS_MIN, POINTS_MAKS, BOT_UID,
} from './ligaFelter.mjs';
import { LQ_TYPES } from '../../src/features/games/leagueQuestionScoring.js';

const her = dirname(fileURLToPath(import.meta.url));
// RULES_FILE: samme konvention som functions/rules.test.js og gameLeagueActions.regler.test.js —
// mutationstest kører mod en KOPI af reglerne, så ingen behøver at skrive i selve firestore.rules.
const regler = readFileSync(process.env.RULES_FILE || resolve(her, '../../firestore.rules'), 'utf8');

/** Kun KODE: en kommentar, der nævner «size() <= 200», må hverken give en falsk match eller lade en slettet vagt se ud som om den stadig står der. */
const kode = (tekst) => tekst.replace(/\/\/.*$/gm, '');
/** Skær reglerne ud mellem to ankre, så et tal i en ANDEN collection ikke kan snyde en match. */
function blok(fra, til) {
  const a = regler.indexOf(fra);
  const b = regler.indexOf(til, a + 1);
  expect(a, `anker «${fra}» findes i firestore.rules`).toBeGreaterThan(-1);
  expect(b, `anker «${til}» findes efter «${fra}»`).toBeGreaterThan(a);
  return kode(regler.slice(a, b));
}
/** ALLE tal, et mønster finder — hele listen sammenlignes (toEqual), så en regex uden match ikke giver en tom liste, der tilfældigvis ikke modsiger noget. */
const tal = (tekst, moenster) => [...tekst.matchAll(moenster)].map((m) => Number(m[1]));
const antal = (tekst, moenster) => [...tekst.matchAll(moenster)].length;
/** En liste-literal fra reglen («'a', 'b'») som sorteret array — rækkefølgen i `in [...]`/`hasOnly([...])` er ligegyldig for reglen. */
const liste = (indhold) => indhold.split(',').map((t) => t.trim().replace(/^'|'$/g, '')).sort();

const vaeg = blok('match /messages/{msgId} {', 'match /questions/{qId} {');
const spoergsmaal = blok('match /questions/{qId} {', 'match /questionAnswers/{answerId} {');
const svar = blok('match /questionAnswers/{answerId} {', 'match /config/{docId} {');

const ts = { toMillis: () => 1 };
/** Dokumentet uden ét felt — «fraværende» er noget andet end `undefined`/`null` som værdi. */
const uden = (dok, felt) => { const k = { ...dok }; delete k[felt]; return k; };
/** Selve diagnosen i en meddelelse — det foran « — » — uden handlings-teksten bagefter (den må omformuleres frit). */
const diagnose = (fejl) => fejl.map((f) => f.split(' — ')[0]);

describe('ligaFejl (uændret)', () => {
  it('id-felt og ikke-streng-navn', () => {
    expect(ligaFejl({ name: 'Ligaen' })).toEqual([]);
    expect(ligaFejl({ id: 'x', name: 'Ligaen' })).toHaveLength(1);
    expect(ligaFejl({ name: { a: 1 } })).toHaveLength(1);
  });
});

describe('spoergsmaalFejl — spejler questions-reglen', () => {
  const sund = { label: 'Hvem bliver topscorer?', type: 'text', points: 5, facit: null, deadline: null };
  it('et sundt spørgsmål — også afgjort, med alternative svar og deadline som tal', () => {
    expect(spoergsmaalFejl(sund)).toEqual([]);
    expect(spoergsmaalFejl({ ...sund, facit: 'Isaksen', acceptedAnswers: ['Isak'], deadline: 1760000000000, type: 'number' })).toEqual([]);
    expect(spoergsmaalFejl({ label: 'Uden type og deadline', points: 5 })).toEqual([]);
    expect(spoergsmaalFejl({ ...sund, label: { a: 1 } }).join()).toMatch(/ejeren kan rette den i fladen/);
    expect(spoergsmaalFejl({ ...sund, facit: { a: 1 } }).join()).toMatch(/ret til en streng i konsollen/);
  });
  it('deadline, der ikke er et tal, meldes som MURET INDE med en handling', () => {
    expect(spoergsmaalFejl({ ...sund, deadline: 'abc' }).join()).toMatch(/deadline er string — MURET INDE: sæt et tal/);
    expect(spoergsmaalFejl({ ...sund, deadline: { a: 1 } })).toHaveLength(1);
  });
  it('points uden for 1-100, som streng eller fraværende, meldes som MURET INDE (reglen kræver 1-100 ved HVER rettelse, også facit)', () => {
    expect(spoergsmaalFejl({ ...sund, points: POINTS_MAKS + 1 }).join()).toMatch(/points er 101 — MURET INDE/);
    expect(spoergsmaalFejl({ ...sund, points: POINTS_MIN - 1 })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, points: '5' })).toHaveLength(1);
    expect(spoergsmaalFejl({ label: 'Uden points', type: 'text' })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, points: POINTS_MAKS })).toEqual([]);
    expect(spoergsmaalFejl({ ...sund, points: POINTS_MIN })).toEqual([]);
  });
  it('label, facit, acceptedAnswers, type og points — typer og grænser', () => {
    expect(spoergsmaalFejl({ ...sund, label: { a: 1 } })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, label: 'x'.repeat(LABEL_MIN - 1) })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, label: 'x'.repeat(LABEL_MAKS + 1) })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, label: 'x'.repeat(LABEL_MAKS) })).toEqual([]);
    expect(spoergsmaalFejl({ ...sund, facit: { a: 1 } })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, facit: 42 })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, facit: '' })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, facit: 'x'.repeat(FACIT_MAKS + 1) })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, acceptedAnswers: 'Isak' })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, acceptedAnswers: Array(ALTERNATIVER_MAKS + 1).fill('x') })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, type: 'x' })).toHaveLength(1);
    expect(spoergsmaalFejl({ ...sund, type: { toString: null } })).toHaveLength(1);
  });
  it('flere fejl i samme dokument tælles hver for sig', () => {
    expect(spoergsmaalFejl({ label: { a: 1 }, facit: { b: 2 }, acceptedAnswers: 'x', deadline: 'abc', points: 5 })).toHaveLength(4);
  });
  // size() i reglen tæller UTF-16-ENHEDER — det samme som JS' .length, hverken kodepunkter eller bytes. Målt i
  // emulator v1.22.0 (20/10 2026): «ab😀d» (4 kodepunkter, 5 enheder) blev afvist af `size() <= 4`, og «😀😀»
  // (2 kodepunkter, 4 enheder) accepteret af `size() >= 3`. Skrives vagten om til [...tekst].length, melder
  // scanningen sunde labels med emojis nær grænsen som forgiftede — og overser forgiftede.
  it('tegn tælles som UTF-16-enheder, som reglens size(): en emoji er to', () => {
    expect(spoergsmaalFejl({ ...sund, label: '😀'.repeat(LABEL_MAKS / 2) })).toEqual([]);
    expect(diagnose(spoergsmaalFejl({ ...sund, label: '😀'.repeat(LABEL_MAKS / 2 + 1) }))).toEqual([`label på ${LABEL_MAKS + 2} tegn`]);
    expect(spoergsmaalFejl({ ...sund, label: '😀😀' })).toEqual([]); // 4 enheder ≥ LABEL_MIN, selv om det kun er 2 kodepunkter
    expect(diagnose(spoergsmaalFejl({ ...sund, label: '😀' }))).toEqual(['label på 2 tegn']);
  });
  // Grænserne er INKLUSIVE (reglen: size() >= 3, <= 120, <= 200, <= 20). Uden et testtilfælde PRÆCIS på grænsen
  // kan `<` blive `<=` (og `>` blive `>=`) uden at nogen test ser det — et sundt, lige-på-grænsen-spørgsmål
  // ville så stå som «forgiftet» i scanningen. LABEL_MAKS er allerede dækket ovenfor.
  it('præcis på grænsen er sundt: LABEL_MIN tegn, FACIT_MAKS tegn, 1 tegn facit og ALTERNATIVER_MAKS alternativer', () => {
    expect(spoergsmaalFejl({ ...sund, label: 'x'.repeat(LABEL_MIN) })).toEqual([]);
    expect(spoergsmaalFejl({ ...sund, facit: 'x' })).toEqual([]);
    expect(spoergsmaalFejl({ ...sund, facit: 'x'.repeat(FACIT_MAKS) })).toEqual([]);
    expect(spoergsmaalFejl({ ...sund, acceptedAnswers: [] })).toEqual([]);
    expect(spoergsmaalFejl({ ...sund, acceptedAnswers: Array(ALTERNATIVER_MAKS).fill('x') })).toEqual([]);
  });
  // Reglen skelner mellem «feltet findes ikke» (sundt) og «feltet findes som null» (create afviser det:
  // `'acceptedAnswers' in data` → `is list`; `get('type','text') in [...]`). Vagten gør det samme.
  // facit og deadline er omvendt: null ER det sunde (et spørgsmål fødes uden facit, uden deadline).
  it('null og fraværende: null som acceptedAnswers/type er gift, fraværende points er gift, null som facit/deadline er sundt', () => {
    expect(spoergsmaalFejl({ ...sund, acceptedAnswers: null })).toEqual(['acceptedAnswers er null']);
    expect(spoergsmaalFejl({ ...sund, type: null })).toEqual(['type er null']);
    expect(diagnose(spoergsmaalFejl(uden(sund, 'points')))).toEqual(['points er fraværende']);
    expect(spoergsmaalFejl({ ...sund, facit: null, deadline: null })).toEqual([]);
  });
});

// Meddelelsen er scanningens eneste output: den, der rydder op, læser FELTNAVNET og tallet. Testene ovenfor tæller
// kun ANTAL fejl (toHaveLength) — så `label er` kunne stå som `facit er` uden at nogen så det. Her pinnes DIAGNOSEN
// (det foran « — ») for hver gren; handlings-teksten efter den er ejerens at omformulere og har sine egne tests ovenfor.
describe('meddelelserne — hver gren melder sit eget felt og sin egen fejl', () => {
  const sund = { label: 'Hvem bliver topscorer?', type: 'text', points: 5, facit: null, deadline: null };
  const lang = (n) => 'x'.repeat(n);
  // [navn, vagt, dokument, forventede diagnoser]
  it.each([
    ['label: map', spoergsmaalFejl, { ...sund, label: { a: 1 } }, ['label er object']],
    ['label: fraværende', spoergsmaalFejl, uden(sund, 'label'), ['label er fraværende']],
    ['label: null', spoergsmaalFejl, { ...sund, label: null }, ['label er null']],
    ['label: for kort', spoergsmaalFejl, { ...sund, label: lang(LABEL_MIN - 1) }, [`label på ${LABEL_MIN - 1} tegn`]],
    ['label: for lang', spoergsmaalFejl, { ...sund, label: lang(LABEL_MAKS + 1) }, [`label på ${LABEL_MAKS + 1} tegn`]],
    ['facit: map', spoergsmaalFejl, { ...sund, facit: { a: 1 } }, ['facit er object']],
    ['facit: tal', spoergsmaalFejl, { ...sund, facit: 42 }, ['facit er number']],
    ['facit: tom', spoergsmaalFejl, { ...sund, facit: '' }, ['facit på 0 tegn']],
    ['facit: for lang', spoergsmaalFejl, { ...sund, facit: lang(FACIT_MAKS + 1) }, [`facit på ${FACIT_MAKS + 1} tegn`]],
    ['acceptedAnswers: streng', spoergsmaalFejl, { ...sund, acceptedAnswers: 'Isak' }, ['acceptedAnswers er string']],
    ['acceptedAnswers: map', spoergsmaalFejl, { ...sund, acceptedAnswers: { a: 1 } }, ['acceptedAnswers er object']],
    ['acceptedAnswers: for mange', spoergsmaalFejl, { ...sund, acceptedAnswers: Array(ALTERNATIVER_MAKS + 1).fill('x') }, [`acceptedAnswers med ${ALTERNATIVER_MAKS + 1} elementer`]],
    ['type: ukendt streng', spoergsmaalFejl, { ...sund, type: 'x' }, ['type er "x"']],
    ['type: gift-objekt', spoergsmaalFejl, { ...sund, type: { toString: null } }, ['type er {"toString":null}']],
    ['deadline: streng', spoergsmaalFejl, { ...sund, deadline: 'abc' }, ['deadline er string']],
    ['deadline: map', spoergsmaalFejl, { ...sund, deadline: { a: 1 } }, ['deadline er object']],
    ['deadline: liste', spoergsmaalFejl, { ...sund, deadline: [1] }, ['deadline er liste']],
    ['points: streng', spoergsmaalFejl, { ...sund, points: '5' }, ['points er string']],
    ['points: null', spoergsmaalFejl, { ...sund, points: null }, ['points er null']],
    ['points: fraværende', spoergsmaalFejl, uden(sund, 'points'), ['points er fraværende']],
    ['points: for lav', spoergsmaalFejl, { ...sund, points: POINTS_MIN - 1 }, [`points er ${POINTS_MIN - 1}`]],
    ['points: for høj', spoergsmaalFejl, { ...sund, points: POINTS_MAKS + 1 }, [`points er ${POINTS_MAKS + 1}`]],
    ['svar: map', svarFejl, { answer: { a: 1 } }, ['answer er object']],
    ['svar: tal', svarFejl, { answer: 42 }, ['answer er number']],
    ['svar: fraværende', svarFejl, {}, ['answer er fraværende']],
    ['svar: tomt', svarFejl, { answer: '' }, ['answer på 0 tegn']],
    ['svar: for langt', svarFejl, { answer: lang(SVAR_MAKS + 1) }, [`answer på ${SVAR_MAKS + 1} tegn`]],
    ['besked: ét ekstra felt', beskedFejl, { uid: 'u', displayName: 'Runde-Botten', text: 'Falsk', createdAt: ts }, ['ekstra felter: displayName']],
    ['besked: flere ekstra felter, i nøglens rækkefølge', beskedFejl, { uid: 'u', displayName: 'X', avatarEmoji: '🤖', text: 'Falsk', createdAt: ts }, ['ekstra felter: displayName, avatarEmoji']],
    ['besked: text map', beskedFejl, { uid: 'u', text: { a: 1 }, createdAt: ts }, ['text er object']],
    ['besked: text fraværende', beskedFejl, { uid: 'u', createdAt: ts }, ['text er fraværende']],
    ['besked: text tom', beskedFejl, { uid: 'u', text: '', createdAt: ts }, ['text på 0 tegn']],
    ['besked: text for lang', beskedFejl, { uid: 'u', text: lang(BESKED_MAKS + 1), createdAt: ts }, [`text på ${BESKED_MAKS + 1} tegn`]],
    ['besked: createdAt map', beskedFejl, { uid: 'u', text: 'Hej', createdAt: { seconds: { a: 1 } } }, ['createdAt er object']],
    ['besked: createdAt null', beskedFejl, { uid: 'u', text: 'Hej', createdAt: null }, ['createdAt er null']],
    ['besked: createdAt fraværende', beskedFejl, { uid: 'u', text: 'Hej' }, ['createdAt er fraværende']],
    ['besked: createdAt som tal (ikke et tidsstempel)', beskedFejl, { uid: 'u', text: 'Hej', createdAt: 1760000000000 }, ['createdAt er number']],
    // `system: false` / `'true'` / `1` er IKKE bottens kendetegn (kun `=== true`), så de ekstra felter tæller — også
    // med bottens uid (den ene halvdel af undtagelsen er opfyldt; flaget skal være PRÆCIS `true`).
    ['besked: bottens uid + system:false fritages ikke', beskedFejl, { uid: BOT_UID, system: false, text: 'Falsk', createdAt: ts }, ['ekstra felter: system']],
    ['besked: bottens uid + system:"true" (streng) fritages ikke', beskedFejl, { uid: BOT_UID, system: 'true', text: 'Falsk', createdAt: ts }, ['ekstra felter: system']],
    ['besked: bottens uid + system:1 fritages ikke', beskedFejl, { uid: BOT_UID, system: 1, text: 'Falsk', createdAt: ts }, ['ekstra felter: system']],
    // Flaget alene fritager ikke, og uid alene gør det heller ikke: begge dele skal være der.
    ['besked: bottens uid uden system-flaget fritages ikke', beskedFejl, { uid: BOT_UID, displayName: 'Runde-Botten', text: 'Falsk', createdAt: ts }, ['ekstra felter: displayName']],
  ])('%s', (_navn, vagt, dokument, forventet) => {
    expect(diagnose(vagt(dokument))).toEqual(forventet);
  });
});

describe('svarFejl — spejler questionAnswers-reglen', () => {
  it('streng på 1..SVAR_MAKS tegn er sund; map, tom og for lang er gift', () => {
    expect(svarFejl({ answer: 'Isaksen' })).toEqual([]);
    expect(svarFejl({ answer: 'x'.repeat(SVAR_MAKS) })).toEqual([]);
    expect(svarFejl({ answer: { a: 1 } })).toHaveLength(1);
    expect(svarFejl({ answer: 42 })).toHaveLength(1);
    expect(svarFejl({ answer: '' })).toHaveLength(1);
    expect(svarFejl({ answer: 'x'.repeat(SVAR_MAKS + 1) })).toHaveLength(1);
    expect(svarFejl({})).toHaveLength(1);
  });
  it('præcis på den nedre grænse: ét tegn er sundt', () => {
    expect(svarFejl({ answer: 'x' })).toEqual([]);
  });
});

describe('beskedFejl — spejler messages-reglen', () => {
  it('klientens form er sund, og bottens egen form (system:true MED bottens uid) springes over', () => {
    expect(beskedFejl({ uid: 'u', text: 'Hej', createdAt: ts })).toEqual([]);
    expect(beskedFejl({ uid: BOT_UID, displayName: 'Runde-Botten', avatarEmoji: '🤖', system: true, text: 'Opslag', createdAt: ts })).toEqual([]);
  });
  it('et FORFALSKET opslag med system:true og et medlems egen uid findes — flaget alene fritager ikke (QC-fund)', () => {
    // Før #39 kunne et medlem selv skrive system:true. Undtog scanningen på flaget
    // alene, skjulte den præcis de opslag, den findes for.
    const falsk = beskedFejl({ uid: 'u1', system: true, displayName: 'Runde-Botten', avatarEmoji: '🤖', text: 'Falsk', createdAt: ts });
    expect(falsk.join()).toMatch(/ekstra felter: system, displayName, avatarEmoji/);
  });
  it('bottens uid er den, BEGGE serverens skriveveje bruger', () => {
    for (const fil of ['../../functions-platform/gameRecap.js', '../../functions-platform/leagueQuestionRecap.js']) {
      expect(readFileSync(resolve(her, fil), 'utf8')).toContain(`uid: '${BOT_UID}'`);
    }
  });
  it('ekstra felter uden system, map som tekst eller tidsstempel, og for lang tekst er gift', () => {
    expect(beskedFejl({ uid: 'u', displayName: 'Runde-Botten', text: 'Falsk', createdAt: ts }).join()).toMatch(/ekstra felter: displayName/);
    expect(beskedFejl({ uid: 'u', system: false, text: 'Falsk', createdAt: ts })).toHaveLength(1);
    expect(beskedFejl({ uid: 'u', text: { a: 1 }, createdAt: ts })).toHaveLength(1);
    expect(beskedFejl({ uid: 'u', text: 'Hej', createdAt: { seconds: { a: 1 } } })).toHaveLength(1);
    expect(beskedFejl({ uid: 'u', text: 'x'.repeat(BESKED_MAKS + 1), createdAt: ts })).toHaveLength(1);
  });
  // Reglen: text.size() > 0 og <= 280, så 1 og 280 tegn er sunde, 0 og 281 er gift. Uden et tilfælde PRÆCIS på
  // grænsen kan `>` blive `>=`, og en tom besked kan slippe igennem som «sund».
  it('præcis på grænserne: 1 tegn og BESKED_MAKS tegn er sunde, en tom besked er gift', () => {
    expect(beskedFejl({ uid: 'u', text: 'x', createdAt: ts })).toEqual([]);
    expect(beskedFejl({ uid: 'u', text: 'x'.repeat(BESKED_MAKS), createdAt: ts })).toEqual([]);
    expect(beskedFejl({ uid: 'u', text: '', createdAt: ts })).toHaveLength(1);
  });
  // `createdAt: null` er et plausibelt ældre tilfælde (reglen kræver først nu `== request.time`). Uden null-vagten i
  // erTimestamp kaster `null.toMillis` — og så dør HELE scanningen med exit 1 midt i en kørsel i stedet for at melde
  // fundet og gå videre.
  it('en besked uden brugbart tidsstempel kaster ikke — den meldes', () => {
    expect(() => beskedFejl({ uid: 'u', text: 'Hej', createdAt: null })).not.toThrow();
    expect(() => beskedFejl({})).not.toThrow();
    expect(beskedFejl({})).toEqual(['text er fraværende', 'createdAt er fraværende']);
  });
});

describe('grænserne er reglens — læst ud af firestore.rules', () => {
  // Create OG update har hver sin kopi af label-, alternativ- og points-grænsen — og det er UPDATE-reglen, der fryser et
  // ældre spørgsmål. Hele listen sammenlignes (som i gameLeagueActions.regler.test.js): læses kun den første match, kan
  // den anden kopi drive uden at nogen test ser det (målt: «label ≥ 3» → 4 i create blev fanget, i update ikke).
  it('questions: label ≥ LABEL_MIN og ≤ LABEL_MAKS — i create OG update', () => {
    expect(tal(spoergsmaal, /data\.label\.size\(\) >= (\d+)/g)).toEqual([LABEL_MIN, LABEL_MIN]);
    expect(tal(spoergsmaal, /data\.label\.size\(\) <= (\d+)/g)).toEqual([LABEL_MAKS, LABEL_MAKS]);
  });
  it('questions: facit ≤ FACIT_MAKS (kun update; create kræver facit = null) og acceptedAnswers ≤ ALTERNATIVER_MAKS i create OG update', () => {
    expect(tal(spoergsmaal, /data\.facit\.size\(\) <= (\d+)/g)).toEqual([FACIT_MAKS]);
    expect(tal(spoergsmaal, /data\.acceptedAnswers\.size\(\) <= (\d+)/g)).toEqual([ALTERNATIVER_MAKS, ALTERNATIVER_MAKS]);
  });
  // Hele tallet læses ud, ikke en tekst-`toContain`: «points <= 100» er en delstreng af «points <= 1000», og
  // «text.size() <= 280» af «… <= 2800». ([\d.]+, så en nedre grænse på 0.5 ikke læses som 0.)
  it('questions: points > POINTS_MIN − 1 og ≤ POINTS_MAKS — i create OG update (reglen kræver det af det RESULTERENDE dokument, også ved facit)', () => {
    expect(tal(spoergsmaal, /data\.points > ([\d.]+)/g)).toEqual([POINTS_MIN - 1, POINTS_MIN - 1]);
    expect(tal(spoergsmaal, /data\.points <= ([\d.]+)/g)).toEqual([POINTS_MAKS, POINTS_MAKS]);
  });
  it('questionAnswers: answer ≤ SVAR_MAKS', () => {
    expect(tal(svar, /data\.answer\.size\(\) <= (\d+)/g)).toEqual([SVAR_MAKS]);
  });
  it('messages: text ≤ BESKED_MAKS, og feltlisten er PRÆCIS BESKED_FELTER', () => {
    expect(tal(vaeg, /data\.text\.size\(\) <= (\d+)/g)).toEqual([BESKED_MAKS]);
    const lister = [...vaeg.matchAll(/keys\(\)\.hasOnly\(\[([^\]]+)\]\)/g)].map((m) => liste(m[1]));
    expect(lister).toEqual([[...BESKED_FELTER].sort()]);
  });
  it('nedre grænse: en tom facit, et tomt svar og en tom besked afvises af reglen (size() > 0) — det, vagterne kalder gift', () => {
    expect(tal(spoergsmaal, /data\.facit\.size\(\) > (\d+)/g)).toEqual([0]);
    expect(tal(svar, /data\.answer\.size\(\) > (\d+)/g)).toEqual([0]);
    expect(tal(vaeg, /data\.text\.size\(\) > (\d+)/g)).toEqual([0]);
  });
  // Vagterne kalder et felt gift ud fra TYPEN. Skifter reglen type (fx deadline til timestamp), melder scanningen
  // hvert sundt dokument som forgiftet — eller overser det forgiftede. Antallene er create + update.
  it('typerne: reglen kræver samme type af hvert felt, som vagterne tjekker', () => {
    const krav = [
      [spoergsmaal, /data\.label is string\b/g, 2],
      [spoergsmaal, /data\.facit is string\b/g, 1],
      [spoergsmaal, /data\.acceptedAnswers is list\b/g, 2],
      [spoergsmaal, /data\.points is number\b/g, 2],
      [spoergsmaal, /data\.deadline is number\b/g, 1],
      [svar, /data\.answer is string\b/g, 1],
      [vaeg, /data\.text is string\b/g, 1],
      [vaeg, /data\.createdAt == request\.time\b/g, 1],
    ];
    for (const [tekst, moenster, forventet] of krav) expect(antal(tekst, moenster), String(moenster)).toBe(forventet);
  });
  it('typelisten er klientens LQ_TYPES, vagtens SPOERGSMAAL_TYPER og reglens create-liste', () => {
    expect(SPOERGSMAAL_TYPER).toEqual(LQ_TYPES);
    const lister = [...spoergsmaal.matchAll(/get\('type', 'text'\) in \[([^\]]+)\]/g)].map((m) => liste(m[1]));
    expect(lister).toEqual([[...LQ_TYPES].sort()]);
  });
});
