// Paritet: klientens lofter (gameLeagueActions.js) ⇄ tallene i firestore.rules.
//
// Klienten kan ikke importere reglerne, og reglerne kan ikke importere klienten — så to tal, der skal
// være ens, drev fra hinanden i det skjulte: hæves reglen til 500, afviser klienten stadig 201 tegn
// (harmløst, men en løgn); SÆNKES reglen, sender klienten 200 tegn, reglen siger permission-denied,
// og klienten oversætter det til «Deadline er passeret» (saveLeagueQuestionAnswer). Hver side har sin
// egen test med litteralen 200/20 (rules.test.js og gameLeagueActions.test.js) — denne binder
// KONSTANTERNE til reglen, så en ændring kun ét sted bliver rød her. Mønstret: en paritetstest, der
// læser modparten (som mailMarkdown).
//
// Hver match er tæl-vagtet (toEqual på hele listen): en regex, der ikke finder noget, ville ellers
// give en tom liste, der tilfældigvis ikke modsiger noget.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  addDoc: vi.fn(), arrayRemove: vi.fn(), serverTimestamp: vi.fn(),
}));

import {
  LEAGUE_Q_SVAR_MAX, LEAGUE_Q_ALT_MAX, LEAGUE_Q_LABEL_MAX, LEAGUE_MSG_MAX,
} from './gameLeagueActions';
import { LQ_TYPES } from './leagueQuestionScoring';

const her = dirname(fileURLToPath(import.meta.url));
// RULES_FILE: samme konvention som functions/rules.test.js — mutationstest kører mod en KOPI af reglerne,
// så ingen behøver at skrive i selve firestore.rules (emulatorens fil-vagt ville genindlæse den midt i en kørsel).
const regler = readFileSync(process.env.RULES_FILE || resolve(her, '../../../firestore.rules'), 'utf8');

/** Skær reglerne ud mellem to ankre, så et tal i en ANDEN collection ikke kan snyde en match. */
function blok(fra, til) {
  const a = regler.indexOf(fra);
  const b = regler.indexOf(til, a + 1);
  expect(a, `anker «${fra}» findes i firestore.rules`).toBeGreaterThan(-1);
  expect(b, `anker «${til}» findes efter «${fra}»`).toBeGreaterThan(a);
  return regler.slice(a, b);
}
const tal = (tekst, moenster) => [...tekst.matchAll(moenster)].map((m) => Number(m[1]));

const vaeg = blok('match /messages/{msgId} {', 'match /questions/{qId} {');
const spoergsmaal = blok('match /questions/{qId} {', 'match /questionAnswers/{answerId} {');
const svar = blok('match /questionAnswers/{answerId} {', 'match /config/{docId} {');

describe('klientens lofter ⇄ firestore.rules (liga-væg, liga-spørgsmål og svar)', () => {
  it('svar: reglens answer.size() ≤ LEAGUE_Q_SVAR_MAX (ét sted — create og update er samme regel)', () => {
    expect(tal(svar, /data\.answer\.size\(\) <= (\d+)/g)).toEqual([LEAGUE_Q_SVAR_MAX]);
  });

  it('facit: reglens facit.size() ≤ LEAGUE_Q_SVAR_MAX (update-reglen; create kræver facit = null)', () => {
    expect(tal(spoergsmaal, /data\.facit\.size\(\) <= (\d+)/g)).toEqual([LEAGUE_Q_SVAR_MAX]);
  });

  it('alternative svar: BÅDE create- og update-reglens acceptedAnswers.size() ≤ LEAGUE_Q_ALT_MAX', () => {
    expect(tal(spoergsmaal, /acceptedAnswers\.size\(\) <= (\d+)/g)).toEqual([LEAGUE_Q_ALT_MAX, LEAGUE_Q_ALT_MAX]);
  });

  it('spørgsmålstekst: create og update begge ≤ LEAGUE_Q_LABEL_MAX', () => {
    expect(tal(spoergsmaal, /data\.label\.size\(\) <= (\d+)/g)).toEqual([LEAGUE_Q_LABEL_MAX, LEAGUE_Q_LABEL_MAX]);
  });

  it('væg-besked: reglens text.size() ≤ LEAGUE_MSG_MAX', () => {
    expect(tal(vaeg, /data\.text\.size\(\) <= (\d+)/g)).toEqual([LEAGUE_MSG_MAX]);
  });

  it('spørgsmålstype: create-reglens liste er PRÆCIS klientens LQ_TYPES', () => {
    // En ny type i klienten uden reglen ville give permission-denied ved oprettelse;
    // en type i reglen uden klienten ville være en død gren.
    const q = blok('match /questions/{qId}', 'match /questionAnswers/{answerId}');
    const m = q.match(/get\('type', 'text'\) in \[([^\]]+)\]/);
    expect(m, 'type-listen findes i create-reglen').not.toBeNull();
    expect(m[1].split(',').map((t) => t.trim().replace(/^'|'$/g, ''))).toEqual(LQ_TYPES);
  });

  it('konstanterne selv: 200 / 20 — de tal, rules.test.js og gameLeagueActions.test.js tester på', () => {
    // Skifter nogen konstanten, skal de to testfiler med litteraler flytte med, og her står det i klar tekst.
    expect([LEAGUE_Q_SVAR_MAX, LEAGUE_Q_ALT_MAX]).toEqual([200, 20]);
  });
});

