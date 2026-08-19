// Tests for leagueQuestionRecap — Runde-Bottens afsløring af et liga-spørgsmål
// (opgave #39). Kernerne er rene: skalAfsloere (hvornår udløser en skrivning
// et opslag) og byggSpoergsmaalRecapFakta (hvad må modellen se). runLeague-
// QuestionRecap testes mod en fake-db med fjendtlige data.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  LQ_RECAP_SYSTEM, skalAfsloere, byggSpoergsmaalRecapFakta, runLeagueQuestionRecap,
} = require('./leagueQuestionRecap.js');

const FieldValue = { serverTimestamp: () => ({ __ts: true }) };

describe('skalAfsloere — kun overgangen ikke-afgjort → afgjort', () => {
  const aabent = { label: 'x', facit: null, deadline: null };
  const afgjort = { label: 'x', facit: 'Haaland', deadline: null };

  it('facit sættes: JA', () => {
    expect(skalAfsloere(aabent, afgjort)).toBe(true);
  });
  it('facit RETTES (afgjort → afgjort): NEJ — et rettet facit må ikke give dobbeltopslag', () => {
    expect(skalAfsloere(afgjort, { ...afgjort, facit: 'Isak' })).toBe(false);
  });
  it('bottens egen markør-skrivning (facit uændret): NEJ — ingen løkke', () => {
    expect(skalAfsloere(afgjort, { ...afgjort, botFacitAt: { __ts: true } })).toBe(false);
  });
  it('facit sat til tom streng: NEJ (ikke afgjort)', () => {
    expect(skalAfsloere(aabent, { ...aabent, facit: '  ' })).toBe(false);
  });
  it('dokumentet slettes: NEJ', () => {
    expect(skalAfsloere(afgjort, undefined)).toBe(false);
  });
  it('oprettes DIREKTE med facit (before undefined): JA', () => {
    expect(skalAfsloere(undefined, afgjort)).toBe(true);
  });
});

describe('byggSpoergsmaalRecapFakta', () => {
  const brugere = new Map([
    ['a', { displayName: 'Anna' }],
    ['b', { displayName: 'Bo' }],
    ['c', { displayName: 'Carla' }],
  ]);
  const q = { label: 'Hvem topscorer?', type: 'text', facit: 'Haaland', points: 10 };

  it('færdigregnede point, vindere og sovende — modellen må aldrig selv regne', () => {
    const fakta = byggSpoergsmaalRecapFakta({
      ligaNavn: 'Buddy',
      spoergsmaal: q,
      svar: [{ uid: 'a', answer: 'Haaland' }, { uid: 'b', answer: 'Isak' }],
      memberUids: ['a', 'b', 'c'],
      brugere,
    });
    expect(fakta.svar).toEqual([
      { navn: 'Anna', svar: 'Haaland', point: 10 },
      { navn: 'Bo', svar: 'Isak', point: 0 },
    ]);
    expect(fakta.vindere).toEqual(['Anna']);
    expect(fakta.ingenRamte).toBe(false);
    expect(fakta.sov).toEqual(['Carla']); // svarede ikke — spilfører-forslaget
    expect(fakta.point).toBe(10);
    expect(fakta.facit).toBe('Haaland');
  });

  // QC-fund: 'number' er sæt-afhængig — et eks-medlems svar SKAL med i
  // konkurrencen (ellers kårer serveren en anden vinder end fladen), men
  // navngives 'et tidligere medlem' og tæller ikke i 2-svars-vagten.
  it('eks-medlems svar konkurrerer med — men uden navn', () => {
    const fakta = byggSpoergsmaalRecapFakta({
      ligaNavn: 'Buddy',
      spoergsmaal: { label: 'Antal mål?', type: 'number', facit: '10', points: 5 },
      svar: [
        { uid: 'a', answer: '14' }, { uid: 'b', answer: '20' },
        { uid: 'vaek', answer: '11' }, // har forladt ligaen
      ],
      memberUids: ['a', 'b'],
      brugere,
    });
    expect(fakta.vindere).toEqual(['et tidligere medlem']);
    expect(fakta.svar.find((s) => s.navn === 'Anna').point).toBe(0);
    expect(JSON.stringify(fakta)).not.toContain('vaek'); // uid'et lækker ikke
  });

  it('under 2 svar fra NUVÆRENDE medlemmer → null (eks-medlemmer tæller ikke med i vagten)', () => {
    const base = { ligaNavn: 'B', spoergsmaal: q, memberUids: ['a', 'b'], brugere };
    expect(byggSpoergsmaalRecapFakta({ ...base, svar: [{ uid: 'a', answer: 'x' }] })).toBeNull();
    expect(byggSpoergsmaalRecapFakta({
      ...base, svar: [{ uid: 'a', answer: 'x' }, { uid: 'vaek', answer: 'y' }],
    })).toBeNull();
  });

  it('uden facit → null', () => {
    expect(byggSpoergsmaalRecapFakta({
      ligaNavn: 'B', spoergsmaal: { ...q, facit: null },
      svar: [{ uid: 'a', answer: 'x' }, { uid: 'b', answer: 'y' }],
      memberUids: ['a', 'b'], brugere,
    })).toBeNull();
  });

  it('ALT brugerskrevet renses — navne, svar, label og facit', () => {
    const fakta = byggSpoergsmaalRecapFakta({
      ligaNavn: 'Liga <script>',
      spoergsmaal: { label: 'Spørgsmål {ondt}', type: 'text', facit: 'facit `x`', points: 5 },
      svar: [
        { uid: 'a', answer: 'svar [med] <tags>' },
        { uid: 'b', answer: 'facit `x`' },
      ],
      memberUids: ['a', 'b'],
      brugere: new Map([['a', { displayName: 'Anna<injektion>' }], ['b', { displayName: 'Bo' }]]),
    });
    const json = JSON.stringify(fakta);
    for (const farligt of ['<', '>', '{', '}', '[', ']', '`']) {
      // JSON'ens egne {} [] er struktur — tjek felterne, ikke wrapper'en.
      expect(fakta.liga).not.toContain(farligt);
      expect(fakta.spoergsmaal).not.toContain(farligt);
      expect(fakta.facit).not.toContain(farligt);
      for (const s of fakta.svar) {
        expect(s.navn).not.toContain(farligt);
        expect(s.svar).not.toContain(farligt);
      }
    }
    expect(json).toContain('Anna');
  });

  it('prompten forbyder egen regning og kræver dansk + liga-kontekst', () => {
    expect(LQ_RECAP_SYSTEM).toContain('ALDRIG selv regne');
    expect(LQ_RECAP_SYSTEM).toContain('LIGAENS EGNE spørgsmål');
    expect(LQ_RECAP_SYSTEM).toContain('Dansk');
  });
});

// ---------------------------------------------------------------------------
// runLeagueQuestionRecap mod fake-db.
// ---------------------------------------------------------------------------
function makeDb({
  game = { name: 'PL' },
  league = { name: 'Buddy', memberUids: ['a', 'b'], ownerUid: 'a' },
  question = { label: 'Topscorer?', type: 'text', facit: 'Haaland', points: 10 },
  answers = [
    { uid: 'a', answer: 'Haaland', questionId: 'q1' },
    { uid: 'b', answer: 'Isak', questionId: 'q1' },
  ],
} = {}) {
  const state = { beskeder: [], qUpdates: [] };
  const qRef = {
    get: async () => ({ exists: question != null, data: () => question }),
    update: async (u) => { state.qUpdates.push(u); Object.assign(question, u); },
  };
  const leagueRef = {
    get: async () => ({ exists: league != null, data: () => league }),
    collection: (navn) => {
      if (navn === 'questions') return { doc: () => qRef };
      if (navn === 'questionAnswers') {
        return {
          where: (felt, _op, vaerdi) => ({
            get: async () => ({
              docs: answers.filter((a) => a[felt] === vaerdi).map((a) => ({ data: () => a })),
            }),
          }),
        };
      }
      if (navn === 'messages') return { add: async (m) => { state.beskeder.push(m); } };
      throw new Error(`uventet subcollection ${navn}`);
    },
  };
  return {
    _state: state,
    collection: (navn) => ({
      doc: (id) => {
        if (navn === 'users') {
          return { get: async () => ({ id, exists: true, data: () => ({ displayName: `Navn-${id}` }) }) };
        }
        return {
          get: async () => ({ exists: game != null, data: () => game }),
          collection: () => ({ doc: () => leagueRef }),
        };
      },
    }),
    getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
  };
}

const okAnthropic = () => ({
  messages: { create: vi.fn(async () => ({ content: [{ type: 'text', text: 'Afsløringen! 🤖' }] })) },
});

const IDS = { gameId: 'g', leagueId: 'l', questionId: 'q1' };

describe('runLeagueQuestionRecap', () => {
  it('poster ÉN gang og sætter markøren EFTER posten', async () => {
    const db = makeDb();
    const ud = await runLeagueQuestionRecap(db, FieldValue, okAnthropic(), IDS, { dryRun: false });
    expect(ud).toEqual({ posted: 1 });
    expect(db._state.beskeder).toHaveLength(1);
    const m = db._state.beskeder[0];
    expect(m.uid).toBe('runde-bot');
    expect(m.questionId).toBe('q1'); // opslaget kan findes igen (nedtagning)
    expect(m.system).toBe(true);
    expect(db._state.qUpdates).toEqual([{ botFacitAt: { __ts: true } }]);

    // Andet kald: markøren stopper det.
    const ud2 = await runLeagueQuestionRecap(db, FieldValue, okAnthropic(), IDS, { dryRun: false });
    expect(ud2).toEqual({ posted: 0, reason: 'already' });
    expect(db._state.beskeder).toHaveLength(1);
  });

  it('fejlende AI-kald efterlader INGEN markør — afsløringen kan forsøges igen', async () => {
    const db = makeDb();
    const anthropic = { messages: { create: vi.fn(async () => { const e = new Error('boom'); e.status = 400; throw e; }) } };
    await expect(runLeagueQuestionRecap(db, FieldValue, anthropic, IDS, { dryRun: false })).rejects.toThrow('boom');
    expect(db._state.beskeder).toHaveLength(0);
    expect(db._state.qUpdates).toHaveLength(0);
  });

  it('dryRun returnerer teksten uden at poste eller markere', async () => {
    const db = makeDb();
    const ud = await runLeagueQuestionRecap(db, FieldValue, okAnthropic(), IDS, { dryRun: true });
    expect(ud).toEqual({ posted: 0, dryRun: true, text: 'Afsløringen! 🤖' });
    expect(db._state.beskeder).toHaveLength(0);
    expect(db._state.qUpdates).toHaveLength(0);
  });

  it('tvingNy poster igen trods markør (recovery — gammelt opslag slettes manuelt)', async () => {
    const db = makeDb({ question: { label: 'x', type: 'text', facit: 'y', points: 5, botFacitAt: { __ts: true } } });
    const ud = await runLeagueQuestionRecap(db, FieldValue, okAnthropic(), IDS, { dryRun: false, tvingNy: true });
    expect(ud).toEqual({ posted: 1 });
    expect(db._state.beskeder).toHaveLength(1);
  });

  it('aiRecaps=false, manglende facit og for få svar giver hver sin nej-grund', async () => {
    expect(await runLeagueQuestionRecap(makeDb({ game: { aiRecaps: false } }), FieldValue, okAnthropic(), IDS, { dryRun: false }))
      .toEqual({ posted: 0, reason: 'disabled' });
    expect(await runLeagueQuestionRecap(
      makeDb({ question: { label: 'x', type: 'text', facit: null, points: 5 } }),
      FieldValue, okAnthropic(), IDS, { dryRun: false },
    )).toEqual({ posted: 0, reason: 'not-settled' });
    expect(await runLeagueQuestionRecap(
      makeDb({ answers: [{ uid: 'a', answer: 'Haaland', questionId: 'q1' }] }),
      FieldValue, okAnthropic(), IDS, { dryRun: false },
    )).toEqual({ posted: 0, reason: 'too-few-answers' });
  });

  it('modellen får FÆRDIGREGNEDE tal og rensede navne — aldrig rå uids', async () => {
    const db = makeDb();
    const anthropic = okAnthropic();
    await runLeagueQuestionRecap(db, FieldValue, anthropic, IDS, { dryRun: true });
    const kald = anthropic.messages.create.mock.calls[0][0];
    expect(kald.system).toBe(LQ_RECAP_SYSTEM);
    const fakta = JSON.parse(kald.messages[0].content);
    expect(fakta.svar).toEqual([
      { navn: 'Navn-a', svar: 'Haaland', point: 10 },
      { navn: 'Navn-b', svar: 'Isak', point: 0 },
    ]);
  });
});
