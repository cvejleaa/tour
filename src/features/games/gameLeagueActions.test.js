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

import { joinLeagueByCode, setLeagueStartRound, createLeagueQuestion } from './gameLeagueActions';

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
