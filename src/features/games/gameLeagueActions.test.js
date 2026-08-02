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

import { joinLeagueByCode } from './gameLeagueActions';

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
