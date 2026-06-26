// Tests for adminActions — verificerer Firestore-kald med korrekte argumenter.
// Ingen netværk — Firebase mockes fuldstændigt.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../../firebase', () => ({
  db: { _db: true },
  functions: { _functions: true },
}));

const mockUpdateDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }));
const mockArrayUnion = vi.fn((v) => ({ _union: v }));
const mockArrayRemove = vi.fn((v) => ({ _remove: v }));

vi.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  addDoc: (...args) => mockAddDoc(...args),
  collection: (...args) => mockCollection(...args),
  serverTimestamp: () => mockServerTimestamp(),
  arrayUnion: (...args) => mockArrayUnion(...args),
  arrayRemove: (...args) => mockArrayRemove(...args),
  Timestamp: {
    fromDate: vi.fn((d) => ({ _date: d, toDate: () => d })),
  },
}));

const mockHttpsCallable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));

import {
  setUserStatus,
  setGlobalAdminRole,
  sendAdminPasswordReset,
  callGenerateLeagueRecapNow,
  saveMatchResult,
  clearManualLock,
  callSyncResultsNow,
  callSyncFixtures,
  createMatch,
  callBuildKnockout,
  callSendTipRemindersNow,
  callSendTestReminderToMe,
  saveBonusFacit,
  approveBonusAnswer,
  removeBonusAnswer,
  formatTimestamp,
  datetimeToTimestamp,
} from './adminActions';

describe('adminActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue({ id: 'mock-doc-ref' });
    mockCollection.mockReturnValue({ id: 'mock-collection-ref' });
    mockUpdateDoc.mockResolvedValue(undefined);
    mockAddDoc.mockResolvedValue({ id: 'new-doc-id' });
  });

  // ─── setUserStatus ────────────────────────────────────────────────────────

  describe('setUserStatus', () => {
    it('kalder updateDoc med approved status', async () => {
      await setUserStatus('uid-123', 'approved');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { status: 'approved' }
      );
    });

    it('kalder updateDoc med rejected status', async () => {
      await setUserStatus('uid-123', 'rejected');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { status: 'rejected' }
      );
    });

    it('kalder doc med korrekt collection og uid', async () => {
      const { db } = await import('../../firebase');
      await setUserStatus('uid-abc', 'approved');
      expect(mockDoc).toHaveBeenCalledWith(db, 'users', 'uid-abc');
    });
  });

  // ─── setGlobalAdminRole ───────────────────────────────────────────────────

  describe('setGlobalAdminRole', () => {
    it('skifter player til globalAdmin', async () => {
      await setGlobalAdminRole('uid-1', 'player');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { role: 'globalAdmin' }
      );
    });

    it('skifter globalAdmin til player', async () => {
      await setGlobalAdminRole('uid-1', 'globalAdmin');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { role: 'player' }
      );
    });

    it('kaster fejl ved forsøg på at ændre owner-rollen', async () => {
      await expect(setGlobalAdminRole('uid-1', 'owner')).rejects.toThrow(
        /owner-rollen/i
      );
    });

    it('kalder IKKE updateDoc ved owner-fejl', async () => {
      try {
        await setGlobalAdminRole('uid-1', 'owner');
      } catch { /* forventet fejl */ }
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });
  });

  // ─── saveMatchResult ──────────────────────────────────────────────────────

  describe('saveMatchResult', () => {
    it('gemmer resultat med korrekte home/away og status finished', async () => {
      await saveMatchResult('match-1', { home: 2, away: 1 });
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          result: { home: 2, away: 1 },
          status: 'finished',
        })
      );
    });

    it('inkluderer advance-felt for knockout-kamp', async () => {
      await saveMatchResult('match-2', { home: 3, away: 2, advance: 'DNK' });
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          result: { home: 3, away: 2, advance: 'DNK' },
        })
      );
    });

    it('konverterer score til Number', async () => {
      await saveMatchResult('match-1', { home: '2', away: '0' });
      const call = mockUpdateDoc.mock.calls[0][1];
      expect(typeof call.result.home).toBe('number');
      expect(typeof call.result.away).toBe('number');
    });

    it('udelader advance-felt når det ikke er angivet', async () => {
      await saveMatchResult('match-1', { home: 1, away: 0 });
      const call = mockUpdateDoc.mock.calls[0][1];
      expect(call.result.advance).toBeUndefined();
    });

    it('kalder doc med matches collection og korrekt matchId', async () => {
      const { db } = await import('../../firebase');
      await saveMatchResult('match-xyz', { home: 0, away: 0 });
      expect(mockDoc).toHaveBeenCalledWith(db, 'matches', 'match-xyz');
    });

    it('markerer manuel rettelse som klæbende (manualLock)', async () => {
      await saveMatchResult('match-1', { home: 1, away: 1 });
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ resultSource: 'manual', manualLock: true, needsReview: false }),
      );
    });
  });

  describe('clearManualLock', () => {
    it('fjerner låsen og gendanner automatik', async () => {
      await clearManualLock('match-9');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { manualLock: false, resultSource: 'auto', needsReview: false },
      );
    });
  });

  describe('sendAdminPasswordReset', () => {
    it('kalder adminSendPasswordReset med uid og returnerer data', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { email: 'a@b.dk', sent: true, link: 'https://x/reset' } });
      mockHttpsCallable.mockReturnValue(mockFn);
      const res = await sendAdminPasswordReset('uid-9');
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'adminSendPasswordReset');
      expect(mockFn).toHaveBeenCalledWith({ uid: 'uid-9' });
      expect(res).toEqual({ email: 'a@b.dk', sent: true, link: 'https://x/reset' });
    });
  });

  describe('callGenerateLeagueRecapNow', () => {
    it('kalder generateLeagueRecapNow med leagueId og dryRun', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { leagues: 1, results: [{ text: 'God morgen!' }] } });
      mockHttpsCallable.mockReturnValue(mockFn);
      const res = await callGenerateLeagueRecapNow({ leagueId: 'lg1', dryRun: true });
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'generateLeagueRecapNow');
      expect(mockFn).toHaveBeenCalledWith({ leagueId: 'lg1', dryRun: true });
      expect(res).toEqual({ ok: true, data: { leagues: 1, results: [{ text: 'God morgen!' }] } });
    });
  });

  describe('callSyncResultsNow', () => {
    it('sender dryRun-flag og returnerer data', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { updated: 2 } });
      mockHttpsCallable.mockReturnValue(mockFn);
      const res = await callSyncResultsNow({ dryRun: true });
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'syncResultsNow');
      expect(mockFn).toHaveBeenCalledWith({ dryRun: true, full: false });
      expect(res).toEqual({ ok: true, data: { updated: 2 } });
    });
    it('returnerer pæn fejl hvis funktionen ikke er deployet', async () => {
      const mockFn = vi.fn().mockRejectedValue({ code: 'functions/not-found' });
      mockHttpsCallable.mockReturnValue(mockFn);
      const res = await callSyncResultsNow();
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/ikke deployet/);
    });
  });

  describe('callSyncFixtures', () => {
    it('sender season og returnerer data', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { mapped: 5 } });
      mockHttpsCallable.mockReturnValue(mockFn);
      const res = await callSyncFixtures({ season: 2026 });
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'syncFixtures');
      expect(mockFn).toHaveBeenCalledWith({ season: 2026 });
      expect(res.data).toEqual({ mapped: 5 });
    });
  });

  // ─── createMatch ──────────────────────────────────────────────────────────

  describe('createMatch', () => {
    it('kalder addDoc med matches collection', async () => {
      const { db } = await import('../../firebase');
      await createMatch({ round: 'group', homeTeam: 'DNK', awayTeam: 'NOR', status: 'scheduled' });
      expect(mockCollection).toHaveBeenCalledWith(db, 'matches');
      expect(mockAddDoc).toHaveBeenCalled();
    });

    it('inkluderer result:null og createdAt i addDoc-kald', async () => {
      await createMatch({ round: 'group', homeTeam: 'DNK', awayTeam: 'NOR', status: 'scheduled' });
      const call = mockAddDoc.mock.calls[0][1];
      expect(call.result).toBeNull();
      expect(call.createdAt).toEqual({ _serverTimestamp: true });
    });

    it('bruger angivet status', async () => {
      await createMatch({ round: 'r16', status: 'pendingTeams' });
      const call = mockAddDoc.mock.calls[0][1];
      expect(call.status).toBe('pendingTeams');
    });

    it('falder tilbage til scheduled-status hvis ingen angivet', async () => {
      await createMatch({ round: 'group' });
      const call = mockAddDoc.mock.calls[0][1];
      expect(call.status).toBe('scheduled');
    });
  });

  // ─── callBuildKnockout ────────────────────────────────────────────────────

  describe('callBuildKnockout', () => {
    it('returnerer ok:true ved succes', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { created: 5 } });
      mockHttpsCallable.mockReturnValue(mockFn);

      const result = await callBuildKnockout();
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ created: 5 });
    });

    it('returnerer ok:false ved fejl', async () => {
      const mockFn = vi.fn().mockRejectedValue({ message: 'Noget gik galt' });
      mockHttpsCallable.mockReturnValue(mockFn);

      const result = await callBuildKnockout();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Noget gik galt');
    });

    it('returnerer specifik besked ved functions/not-found', async () => {
      const mockFn = vi.fn().mockRejectedValue({ code: 'functions/not-found' });
      mockHttpsCallable.mockReturnValue(mockFn);

      const result = await callBuildKnockout();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('deployet');
    });

    it('kalder httpsCallable med buildKnockout', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: {} });
      mockHttpsCallable.mockReturnValue(mockFn);

      await callBuildKnockout();
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'buildKnockout');
    });
  });

  // ─── callSendTipRemindersNow ──────────────────────────────────────────────

  describe('callSendTipRemindersNow', () => {
    it('returnerer ok:true med antal sendte ved succes', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { success: true, sent: 3 } });
      mockHttpsCallable.mockReturnValue(mockFn);

      const result = await callSendTipRemindersNow();
      expect(result.ok).toBe(true);
      expect(result.data.sent).toBe(3);
    });

    it('returnerer ok:false ved fejl', async () => {
      const mockFn = vi.fn().mockRejectedValue({ message: 'SMTP_PASSWORD er ikke sat endnu.' });
      mockHttpsCallable.mockReturnValue(mockFn);

      const result = await callSendTipRemindersNow();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('SMTP_PASSWORD');
    });

    it('kalder httpsCallable med sendTipRemindersNow', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: {} });
      mockHttpsCallable.mockReturnValue(mockFn);

      await callSendTipRemindersNow();
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'sendTipRemindersNow');
    });
  });

  // ─── callSendTestReminderToMe ─────────────────────────────────────────────

  describe('callSendTestReminderToMe', () => {
    it('returnerer ok:true med modtager og antal', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { success: true, sentTo: 'a@b.dk', days: 3, matches: 12 } });
      mockHttpsCallable.mockReturnValue(mockFn);

      const result = await callSendTestReminderToMe();
      expect(result.ok).toBe(true);
      expect(result.data.sentTo).toBe('a@b.dk');
      expect(result.data.matches).toBe(12);
    });

    it('kalder httpsCallable med sendTestReminderToMe', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: {} });
      mockHttpsCallable.mockReturnValue(mockFn);

      await callSendTestReminderToMe();
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'sendTestReminderToMe');
    });
  });

  // ─── saveBonusFacit ───────────────────────────────────────────────────────

  describe('saveBonusFacit', () => {
    it('kalder updateDoc med facit-feltet', async () => {
      await saveBonusFacit('q-1', 'Haaland');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { facit: 'Haaland' }
      );
    });

    it('kalder doc med bonusQuestions collection og korrekt id', async () => {
      const { db } = await import('../../firebase');
      await saveBonusFacit('q-abc', 'Mbappe');
      expect(mockDoc).toHaveBeenCalledWith(db, 'bonusQuestions', 'q-abc');
    });
  });

  // ─── approveBonusAnswer ───────────────────────────────────────────────────

  describe('approveBonusAnswer', () => {
    it('kalder updateDoc med arrayUnion', async () => {
      await approveBonusAnswer('q-1', 'Erling Haaland');
      expect(mockArrayUnion).toHaveBeenCalledWith('Erling Haaland');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { acceptedAnswers: { _union: 'Erling Haaland' } }
      );
    });

    it('kalder doc med bonusQuestions collection', async () => {
      const { db } = await import('../../firebase');
      await approveBonusAnswer('q-xyz', 'Test');
      expect(mockDoc).toHaveBeenCalledWith(db, 'bonusQuestions', 'q-xyz');
    });
  });

  // ─── removeBonusAnswer ────────────────────────────────────────────────────

  describe('removeBonusAnswer', () => {
    it('kalder updateDoc med arrayRemove', async () => {
      await removeBonusAnswer('q-1', 'Erling Haaland');
      expect(mockArrayRemove).toHaveBeenCalledWith('Erling Haaland');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { acceptedAnswers: { _remove: 'Erling Haaland' } }
      );
    });

    it('kalder doc med bonusQuestions collection', async () => {
      const { db } = await import('../../firebase');
      await removeBonusAnswer('q-xyz', 'Test');
      expect(mockDoc).toHaveBeenCalledWith(db, 'bonusQuestions', 'q-xyz');
    });
  });

  // ─── formatTimestamp ──────────────────────────────────────────────────────

  describe('formatTimestamp', () => {
    it('returnerer "–" for null', () => {
      expect(formatTimestamp(null)).toBe('–');
    });

    it('returnerer "–" for undefined', () => {
      expect(formatTimestamp(undefined)).toBe('–');
    });

    it('formaterer Firestore Timestamp med toDate()', () => {
      const ts = { toDate: () => new Date('2026-06-11T18:00:00') };
      const result = formatTimestamp(ts);
      expect(result).toContain('2026');
      expect(result).toContain('06');
    });

    it('formaterer plain Date-objekt', () => {
      const date = new Date('2026-06-11T18:00:00');
      const result = formatTimestamp(date);
      expect(result).toContain('2026');
    });
  });

  // ─── datetimeToTimestamp ──────────────────────────────────────────────────

  describe('datetimeToTimestamp', () => {
    it('konverterer ISO-streng til Timestamp', () => {
      const result = datetimeToTimestamp('2026-06-11T18:00');
      expect(result).toBeDefined();
    });
  });
});
