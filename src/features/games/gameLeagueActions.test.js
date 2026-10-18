// Tests for gameLeagueActions — især fejlbeskederne fra joinLeagueByCode.
//
// Serveren formulerer sig allerede på dansk (LEAGUE_ERR i
// functions-platform/gameLeagues.js). Oversatte klienten koden ÉN gang til,
// blev "Din adgang er afvist. Kontakt en administrator." til det intetsigende
// "Du har ikke adgang til denne handling." — og en bortvist bruger fik intet
// at vide om hvorfor.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));

const mockKald = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: () => (...args) => mockKald(...args),
}));

const mockAddDoc = vi.fn().mockResolvedValue({ id: 'q1' });
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: (...a) => mockAddDoc(...a),
  arrayRemove: vi.fn(),
  serverTimestamp: () => ({ __ts: true }),
}));

import { setDoc, updateDoc } from 'firebase/firestore';
import {
  joinLeagueByCode, setLeagueStartRound, createLeagueQuestion,
  saveLeagueQuestionAnswer, setLeagueQuestionFacit, postLeagueMessage,
} from './gameLeagueActions';

/** Fejl som Cloud Functions-SDK'et kaster dem: kode med 'functions/'-præfiks. */
function callableFejl(code, message) {
  const e = new Error(message);
  e.code = `functions/${code}`;
  return e;
}

beforeEach(() => vi.clearAllMocks());

describe('joinLeagueByCode — fejlbeskeder', () => {
  it('viser serverens egen begrundelse, når adgangen er afvist', async () => {
    mockKald.mockRejectedValue(
      callableFejl('permission-denied', 'Din adgang er afvist. Kontakt en administrator.'),
    );
    const res = await joinLeagueByCode({ gameId: 'sl', code: 'X4KR2M' });
    expect(res).toEqual({
      ok: false, error: 'Din adgang er afvist. Kontakt en administrator.',
    });
  });

  it('viser serverens besked ved ukendt kode', async () => {
    mockKald.mockRejectedValue(callableFejl('not-found', 'Ingen liga fundet med den kode.'));
    const res = await joinLeagueByCode({ gameId: 'sl', code: 'ZZZZZZ' });
    expect(res.error).toBe('Ingen liga fundet med den kode.');
  });

  // 'unavailable' kommer fra SDK'et, ikke fra vores kode — teksten er engelsk.
  it('oversætter netværksfejl selv i stedet for at vise SDK-teksten', async () => {
    mockKald.mockRejectedValue(callableFejl('unavailable', 'The service is currently unavailable.'));
    const res = await joinLeagueByCode({ gameId: 'sl', code: 'X4KR2M' });
    expect(res.error).toBe('Kunne ikke få forbindelse. Prøv igen.');
  });

  it('lader en gyldig kode gå igennem', async () => {
    mockKald.mockResolvedValue({ data: { leagueId: 'L1', name: 'Vennerne', already: false } });
    const res = await joinLeagueByCode({ gameId: 'sl', code: ' x4kr2m ' });
    expect(res).toEqual({ ok: true, leagueId: 'L1', name: 'Vennerne', already: false });
    // Koden normaliseres, før den sendes.
    expect(mockKald).toHaveBeenCalledWith({ gameId: 'sl', code: 'X4KR2M' });
  });

  it('kalder slet ikke serveren på en for kort kode', async () => {
    const res = await joinLeagueByCode({ gameId: 'sl', code: 'ab' });
    expect(res).toEqual({ ok: false, error: 'Indtast en gyldig kode.' });
    expect(mockKald).not.toHaveBeenCalled();
  });
});

// Rules er autoriteten og afviser det samme (rules.test.js). Det, DENNE test
// beviser, er den danske fejlbesked: uden valideringen fik ejeren Firebase-
// SDK'ets engelske "permission denied" i stedet for at få at vide hvorfor.
describe('setLeagueStartRound — klientens validering', () => {
  it('afviser decimaler, nul og vrøvl med dansk besked — uden at røre serveren', async () => {
    for (const ugyldig of [2.5, 0, -3, 'abc']) {
      const res = await setLeagueStartRound({ gameId: 'sl', leagueId: 'l1', startRound: ugyldig });
      expect(res.ok).toBe(false);
      expect(res.error).toContain('helt tal');
    }
  });
});

// Whitelisten IMPORTERER LQ_TYPES — men at listen er rigtig, beviser ikke, at
// den BRUGES. Mutationen "sæt den gamle literal uden 'team' tilbage" overlevede
// hele suiten, fordi actions-modulet er mocket i UI-testene: et hold-spørgsmål
// ville tavst blive oprettet som fritekst, og formularen så ud til at virke.
describe('createLeagueQuestion — typen når databasen', () => {
  it("gemmer 'team' som 'team' — og en ukendt type falder til 'text'", async () => {
    const fælles = { uid: 'me', gameId: 'pl', leagueId: 'l1', label: 'Hvem vinder ligaen?', points: 10 };
    await createLeagueQuestion({ ...fælles, type: 'team' });
    expect(mockAddDoc).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ type: 'team' }));
    await createLeagueQuestion({ ...fælles, type: 'findes-ikke' });
    expect(mockAddDoc).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ type: 'text' }));
  });
});

// Lofterne er SPEJLET i firestore.rules (answer/facit ≤ 200, acceptedAnswers ≤ 20). Uden den lokale
// vagt oversætter klienten reglens permission-denied til «Deadline er passeret» — en løgn om årsagen.
// Funktionerne var kun mocket i komponenttesten; ingen test rørte dem (fjernes alle tre vagter, er hele
// suiten grøn). Tallene står som LITTERALER med vilje: de skal følge reglen, ikke konstanten, og
// `gameLeagueActions.regler.test.js` binder konstanterne til reglerne.
describe('saveLeagueQuestionAnswer — svaret må højst være 200 tegn', () => {
  const gem = (answer) => saveLeagueQuestionAnswer({ uid: 'u1', gameId: 'sl', leagueId: 'L1', questionId: 'q1', answer });

  it('201 tegn afvises som "for langt" — og databasen røres ikke', async () => {
    const res = await gem('x'.repeat(201));
    expect(res).toEqual({ ok: false, error: 'Svaret må højst være 200 tegn.' });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('præcis 200 tegn gemmes, trimmet — længden måles efter trim', async () => {
    const res = await gem(`  ${'x'.repeat(200)}  `);
    expect(res).toEqual({ ok: true });
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ answer: 'x'.repeat(200), uid: 'u1', questionId: 'q1' });
  });

  it('kontrol af begrundelsen: reglens permission-denied hedder «Deadline er passeret» — derfor skal loftet fanges FØR', async () => {
    setDoc.mockRejectedValueOnce(Object.assign(new Error('afvist'), { code: 'permission-denied' }));
    const res = await gem('Isaksen');
    expect(res).toEqual({ ok: false, error: 'Deadline er passeret — svaret kan ikke ændres.' });
  });
});

describe('setLeagueQuestionFacit — facit højst 200 tegn og højst 20 alternative svar', () => {
  const sæt = (facit, acceptedAnswers) => setLeagueQuestionFacit({
    gameId: 'sl', leagueId: 'L1', questionId: 'q1', facit, acceptedAnswers,
  });

  it('et facit på 201 tegn afvises som "for langt" — og databasen røres ikke', async () => {
    const res = await sæt('x'.repeat(201), []);
    expect(res).toEqual({ ok: false, error: 'Facit må højst være 200 tegn.' });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('præcis 200 tegn gemmes, trimmet, sammen med de rensede alternativer', async () => {
    const res = await sæt(`  ${'x'.repeat(200)}  `, [' Isak ', '', '   ']);
    expect(res).toEqual({ ok: true });
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toEqual({ facit: 'x'.repeat(200), acceptedAnswers: ['Isak'] });
  });

  it('21 alternative svar afvises; 20 gemmes', async () => {
    const res = await sæt('Isaksen', Array.from({ length: 21 }, (_, i) => `alt${i}`));
    expect(res).toEqual({ ok: false, error: 'Højst 20 alternative svar.' });
    expect(updateDoc).not.toHaveBeenCalled();
    const ok = await sæt('Isaksen', Array.from({ length: 20 }, (_, i) => `alt${i}`));
    expect(ok).toEqual({ ok: true });
    expect(updateDoc.mock.calls[0][1].acceptedAnswers).toHaveLength(20);
  });

  it('alternativerne tælles EFTER oprydning — tomme felter fra «a,,b» fylder ikke', async () => {
    const tyve = Array.from({ length: 20 }, (_, i) => `alt${i}`);
    const res = await sæt('Isaksen', [...tyve, '', '  ', '']);
    expect(res).toEqual({ ok: true });
    expect(updateDoc.mock.calls[0][1].acceptedAnswers).toEqual(tyve);
  });
});

// Reglen på liga-væggen er `keys().hasOnly(['uid','text','createdAt'])` — og postLeagueMessage er den
// ENESTE klient-skribent. Ændrer nogen funktionen til at sende et ekstra felt (fx displayName), afvises
// HVER besked af reglerne; ingen test sagde det, før reglen slog til i produktion.
describe('postLeagueMessage — skriver præcis de tre felter, reglen tillader', () => {
  it('uid, text og createdAt — og intet andet', async () => {
    mockAddDoc.mockClear();
    const res = await postLeagueMessage({ uid: 'u1', gameId: 'sl', leagueId: 'L1', text: '  Hej liga!  ' });
    expect(res).toEqual({ ok: true });
    expect(Object.keys(mockAddDoc.mock.calls[0][1]).sort()).toEqual(['createdAt', 'text', 'uid']);
    expect(mockAddDoc.mock.calls[0][1]).toMatchObject({ uid: 'u1', text: 'Hej liga!' });
  });
});
