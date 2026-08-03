import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  normalizeInviteCode, checkRateLimit, redeemInviteCodeCore, MAX_ATTEMPTS, WINDOW_MS,
} = require('./invites');

describe('normalizeInviteCode', () => {
  it('trimmer og versaliserer', () => {
    expect(normalizeInviteCode('  ab12cd ')).toBe('AB12CD');
  });
  it('håndterer tomt/ugyldigt', () => {
    expect(normalizeInviteCode(null)).toBe('');
    expect(normalizeInviteCode(undefined)).toBe('');
    expect(normalizeInviteCode(42)).toBe('');
  });
});

describe('checkRateLimit', () => {
  const now = 1_000_000_000;
  it('tillader når der ikke er tidligere forsøg', () => {
    expect(checkRateLimit(null, now)).toEqual({ allowed: true, reset: true });
  });
  it('tillader og nulstiller når vinduet er udløbet', () => {
    const old = { count: MAX_ATTEMPTS, windowStart: now - WINDOW_MS - 1 };
    expect(checkRateLimit(old, now)).toEqual({ allowed: true, reset: true });
  });
  it('tillader under grænsen inden for vinduet', () => {
    expect(checkRateLimit({ count: MAX_ATTEMPTS - 1, windowStart: now }, now))
      .toEqual({ allowed: true, reset: false });
  });
  it('blokerer på/over grænsen inden for vinduet', () => {
    expect(checkRateLimit({ count: MAX_ATTEMPTS, windowStart: now }, now))
      .toEqual({ allowed: false, reset: false });
  });
});

// Hjælper: byg deps med fornuftige standarder + spies.
function makeDeps(overrides = {}) {
  return {
    uid: 'u1',
    rawCode: 'ABC123',
    now: 1_000_000_000,
    getAttempt: vi.fn().mockResolvedValue(null),
    saveAttempt: vi.fn().mockResolvedValue(undefined),
    findApprovedLeagueByCode: vi.fn().mockResolvedValue({ id: 'lg1', name: 'Vennernes liga' }),
    approveUserAndJoin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('redeemInviteCodeCore', () => {
  it('afviser for kort/ugyldig kode uden DB-opslag', async () => {
    const deps = makeDeps({ rawCode: 'ab' });
    const res = await redeemInviteCodeCore(deps);
    expect(res).toMatchObject({ ok: false, error: 'invalid-argument' });
    expect(deps.findApprovedLeagueByCode).not.toHaveBeenCalled();
  });

  it('afviser en AFVIST bruger (kan ikke gen-godkende sig selv)', async () => {
    const deps = makeDeps({ getUserStatus: vi.fn().mockResolvedValue('rejected') });
    const res = await redeemInviteCodeCore(deps);
    expect(res).toMatchObject({ ok: false, error: 'permission-denied' });
    expect(deps.findApprovedLeagueByCode).not.toHaveBeenCalled();
    expect(deps.approveUserAndJoin).not.toHaveBeenCalled();
  });

  it('tillader en pending bruger (getUserStatus=pending)', async () => {
    const deps = makeDeps({ getUserStatus: vi.fn().mockResolvedValue('pending') });
    const res = await redeemInviteCodeCore(deps);
    expect(res).toEqual({ ok: true, leagueId: 'lg1', leagueName: 'Vennernes liga' });
  });

  it('godkender + tilmelder ved gyldig kode og nulstiller forsøg', async () => {
    const deps = makeDeps();
    const res = await redeemInviteCodeCore(deps);
    expect(res).toEqual({ ok: true, leagueId: 'lg1', leagueName: 'Vennernes liga' });
    expect(deps.approveUserAndJoin).toHaveBeenCalledWith({ uid: 'u1', leagueId: 'lg1' });
    expect(deps.saveAttempt).toHaveBeenLastCalledWith('u1', { count: 0, windowStart: deps.now });
  });

  it('slår kode op i VERSALER (normaliseret)', async () => {
    const deps = makeDeps({ rawCode: ' abc123 ' });
    await redeemInviteCodeCore(deps);
    expect(deps.findApprovedLeagueByCode).toHaveBeenCalledWith('ABC123');
  });

  it('afviser ukendt kode og tæller forsøget op', async () => {
    const deps = makeDeps({ findApprovedLeagueByCode: vi.fn().mockResolvedValue(null) });
    const res = await redeemInviteCodeCore(deps);
    expect(res).toMatchObject({ ok: false, error: 'not-found' });
    expect(deps.approveUserAndJoin).not.toHaveBeenCalled();
    expect(deps.saveAttempt).toHaveBeenCalledWith('u1', { count: 1, windowStart: deps.now });
  });

  it('tæller videre på eksisterende forsøg inden for vinduet', async () => {
    const deps = makeDeps({
      findApprovedLeagueByCode: vi.fn().mockResolvedValue(null),
      getAttempt: vi.fn().mockResolvedValue({ count: 2, windowStart: 1_000_000_000 }),
    });
    await redeemInviteCodeCore(deps);
    expect(deps.saveAttempt).toHaveBeenCalledWith('u1', { count: 3, windowStart: 1_000_000_000 });
  });

  it('blokerer når forsøgsgrænsen er nået', async () => {
    const deps = makeDeps({
      getAttempt: vi.fn().mockResolvedValue({ count: MAX_ATTEMPTS, windowStart: 1_000_000_000 }),
    });
    const res = await redeemInviteCodeCore(deps);
    expect(res).toMatchObject({ ok: false, error: 'resource-exhausted' });
    expect(deps.findApprovedLeagueByCode).not.toHaveBeenCalled();
  });
});
