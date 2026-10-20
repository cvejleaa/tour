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
} from './ligaFelter.mjs';
import { LQ_TYPES } from '../../src/features/games/leagueQuestionScoring.js';

const her = dirname(fileURLToPath(import.meta.url));
const regler = readFileSync(resolve(her, '../../firestore.rules'), 'utf8');
const tal = (re) => {
  const m = regler.match(re);
  expect(m, `mønstret ${re} findes i firestore.rules`).not.toBeNull();
  return Number(m[1]);
};
const ts = { toMillis: () => 1 };

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
  });
  it('deadline, der ikke er et tal, meldes som «muret inde»', () => {
    expect(spoergsmaalFejl({ ...sund, deadline: 'abc' }).join()).toMatch(/deadline er string — spørgsmålet er muret inde/);
    expect(spoergsmaalFejl({ ...sund, deadline: { a: 1 } })).toHaveLength(1);
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
    expect(spoergsmaalFejl({ ...sund, points: '5' })).toHaveLength(1);
  });
  it('flere fejl i samme dokument tælles hver for sig', () => {
    expect(spoergsmaalFejl({ label: { a: 1 }, facit: { b: 2 }, acceptedAnswers: 'x', deadline: 'abc', points: 5 })).toHaveLength(4);
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
});

describe('beskedFejl — spejler messages-reglen', () => {
  it('klientens form er sund, og bottens egen form springes over', () => {
    expect(beskedFejl({ uid: 'u', text: 'Hej', createdAt: ts })).toEqual([]);
    expect(beskedFejl({ uid: 'runde-bot', displayName: 'Runde-Botten', avatarEmoji: '🤖', system: true, text: 'Opslag', createdAt: ts })).toEqual([]);
  });
  it('ekstra felter uden system, map som tekst eller tidsstempel, og for lang tekst er gift', () => {
    expect(beskedFejl({ uid: 'u', displayName: 'Runde-Botten', text: 'Falsk', createdAt: ts }).join()).toMatch(/ekstra felter: displayName/);
    expect(beskedFejl({ uid: 'u', system: false, text: 'Falsk', createdAt: ts })).toHaveLength(1);
    expect(beskedFejl({ uid: 'u', text: { a: 1 }, createdAt: ts })).toHaveLength(1);
    expect(beskedFejl({ uid: 'u', text: 'Hej', createdAt: { seconds: { a: 1 } } })).toHaveLength(1);
    expect(beskedFejl({ uid: 'u', text: 'x'.repeat(BESKED_MAKS + 1), createdAt: ts })).toHaveLength(1);
  });
});

describe('grænserne er reglens — læst ud af firestore.rules', () => {
  it('questions: label 3..120, facit ≤ 200, acceptedAnswers ≤ 20; questionAnswers: answer ≤ 200; messages: text ≤ 280 og felterne', () => {
    expect(LABEL_MIN).toBe(tal(/request\.resource\.data\.label\.size\(\) >= (\d+)/));
    expect(LABEL_MAKS).toBe(tal(/request\.resource\.data\.label\.size\(\) <= (\d+)/));
    expect(FACIT_MAKS).toBe(tal(/request\.resource\.data\.facit\.size\(\) <= (\d+)/));
    expect(ALTERNATIVER_MAKS).toBe(tal(/request\.resource\.data\.acceptedAnswers\.size\(\) <= (\d+)/));
    expect(SVAR_MAKS).toBe(tal(/request\.resource\.data\.answer\.size\(\) <= (\d+)/));
    const q = regler.slice(regler.indexOf('match /messages/{msgId}'), regler.indexOf('match /questions/{qId}'));
    expect(q).toContain(`request.resource.data.text.size() <= ${BESKED_MAKS}`);
    expect(q).toContain(`hasOnly([${BESKED_FELTER.map((f) => `'${f}'`).join(', ')}])`);
  });
  it('typelisten er klientens LQ_TYPES og reglens create-liste', () => {
    expect(SPOERGSMAAL_TYPER).toEqual(LQ_TYPES);
    const m = regler.match(/get\('type', 'text'\) in \[([^\]]+)\]/);
    expect(m).not.toBeNull();
    expect(m[1].split(',').map((t) => t.trim().replace(/^'|'$/g, ''))).toEqual(LQ_TYPES);
  });
});
