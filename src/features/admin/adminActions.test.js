// Tests for adminActions — verificerer Firestore-kald med korrekte argumenter.
// Ingen netværk — Firebase mockes fuldstændigt.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../../firebase', () => ({
  db: { _db: true },
  functions: { _functions: true },
}));

const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }));
const mockArrayUnion = vi.fn((v) => ({ _union: v }));
const mockArrayRemove = vi.fn((v) => ({ _remove: v }));

vi.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
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
  callRepriceGameOdds,
  callGenerateStageTip,
  saveStageTip,
  callSendTipRemindersNow,
  callSendTestReminderToMe,
  callSendBroadcastEmail,
  createBonusQuestion,
  updateBonusQuestion,
  deleteBonusQuestion,
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
    mockDeleteDoc.mockResolvedValue(undefined);
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

  // Den eneste callable, der skriver UIGENKALDELIGT i produktionsdata, var den
  // eneste uden test. GameScheduleTab-testen mocker hele modulet væk, så den
  // dækker det ikke: default'en `dryRun = true` kunne vendes til false, og
  // hele kroppen kunne udskiftes, uden at én test sagde fra.
  describe('callRepriceGameOdds', () => {
    it('kalder repriceGameOdds og sender dryRun med', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { updated: 3, dryRun: false, aendringer: [] } });
      mockHttpsCallable.mockReturnValue(mockFn);
      const res = await callRepriceGameOdds({ gameId: 'sl2627', dryRun: false });
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'repriceGameOdds', expect.anything());
      expect(mockFn).toHaveBeenCalledWith({ gameId: 'sl2627', dryRun: false });
      expect(res).toEqual({ ok: true, data: { updated: 3, dryRun: false, aendringer: [] } });
    });

    // Default'en er hele sikkerheden: et kald uden flag må ALDRIG skrive.
    it('tørkører som standard, når dryRun udelades', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { updated: 0, dryRun: true, aendringer: [] } });
      mockHttpsCallable.mockReturnValue(mockFn);
      await callRepriceGameOdds({ gameId: 'sl2627' });
      expect(mockFn).toHaveBeenCalledWith({ gameId: 'sl2627', dryRun: true });
    });

    it('giver fejlen videre i stedet for at kaste', async () => {
      mockHttpsCallable.mockReturnValue(vi.fn().mockRejectedValue(new Error('Du har ikke adgang.')));
      const res = await callRepriceGameOdds({ gameId: 'sl2627', dryRun: false });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/ikke adgang/);
    });
  });

  describe('callGenerateStageTip', () => {
    it('kalder generateStageTip for én etape (stageId)', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { results: [{ stageId: 's3', expertTip: 'Tip' }], errors: [] } });
      mockHttpsCallable.mockReturnValue(mockFn);
      const res = await callGenerateStageTip({ stageId: 's3' });
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'generateStageTip', expect.anything());
      expect(mockFn).toHaveBeenCalledWith({ stageId: 's3', all: false, force: false, season: undefined });
      expect(res).toEqual({ ok: true, data: { results: [{ stageId: 's3', expertTip: 'Tip' }], errors: [] } });
    });

    it('kalder generateStageTip med all + season', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { results: [], errors: [] } });
      mockHttpsCallable.mockReturnValue(mockFn);
      await callGenerateStageTip({ all: true, season: 2026 });
      expect(mockFn).toHaveBeenCalledWith({ stageId: undefined, all: true, force: false, season: 2026 });
    });

    it('returnerer ok:false ved fejl', async () => {
      const mockFn = vi.fn().mockRejectedValue({ message: 'ANTHROPIC_API_KEY er ikke sat.' });
      mockHttpsCallable.mockReturnValue(mockFn);
      const res = await callGenerateStageTip({ stageId: 's1' });
      expect(res.ok).toBe(false);
      expect(res.error).toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('saveStageTip', () => {
    it('kalder updateDoc med trimmet expertTip på etape-dokumentet', async () => {
      const { db } = await import('../../firebase');
      await saveStageTip('2026-stage-4', '  Manuel tekst.  ');
      expect(mockDoc).toHaveBeenCalledWith(db, 'stages', '2026-stage-4');
      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { expertTip: 'Manuel tekst.' });
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

  // ─── callSendBroadcastEmail ───────────────────────────────────────────────

  describe('callSendBroadcastEmail', () => {
    it('kalder httpsCallable med sendBroadcastEmail og videresender payload', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { sent: 2, total: 2, failed: [] } });
      mockHttpsCallable.mockReturnValue(mockFn);

      const payload = { subject: 'Hej', body: 'Tekst', recipients: ['a@b.dk', 'c@d.dk'] };
      const result = await callSendBroadcastEmail(payload);
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'sendBroadcastEmail');
      expect(mockFn).toHaveBeenCalledWith(payload);
      expect(result.ok).toBe(true);
      expect(result.data.sent).toBe(2);
    });

    it('returnerer ok:false ved fejl', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('boom'));
      mockHttpsCallable.mockReturnValue(mockFn);
      const result = await callSendBroadcastEmail({ subject: 's', body: 'b', recipients: [] });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/boom/);
    });
  });

  // ─── createBonusQuestion ──────────────────────────────────────────────────

  describe('createBonusQuestion', () => {
    it('kalder addDoc med bonusQuestions collection', async () => {
      const { db } = await import('../../firebase');
      await createBonusQuestion({ text: 'Hvem vinder?', points: 5 });
      expect(mockCollection).toHaveBeenCalledWith(db, 'bonusQuestions');
      expect(mockAddDoc).toHaveBeenCalled();
    });

    it('gemmer text, points, facit:null og createdAt', async () => {
      await createBonusQuestion({ text: '  Hvem vinder?  ', points: '7' });
      const call = mockAddDoc.mock.calls[0][1];
      expect(call.text).toBe('Hvem vinder?');
      expect(call.points).toBe(7);
      expect(call.facit).toBeNull();
      expect(call.createdAt).toEqual({ _serverTimestamp: true });
    });

    it('udelader deadline når den ikke er sat', async () => {
      await createBonusQuestion({ text: 'x', points: 3 });
      const call = mockAddDoc.mock.calls[0][1];
      expect(call.deadline).toBeUndefined();
    });

    it('sætter deadline som Timestamp når angivet', async () => {
      await createBonusQuestion({ text: 'x', points: 3, deadline: '2026-07-01T12:00' });
      const call = mockAddDoc.mock.calls[0][1];
      expect(call.deadline).toBeDefined();
    });

    it('inkluderer trimmede options når angivet', async () => {
      await createBonusQuestion({ text: 'x', points: 3, options: [' A ', 'B', ''] });
      const call = mockAddDoc.mock.calls[0][1];
      expect(call.options).toEqual(['A', 'B']);
    });

    it('default-type er text når type ikke angives', async () => {
      await createBonusQuestion({ text: 'x', points: 3 });
      const call = mockAddDoc.mock.calls[0][1];
      expect(call.type).toBe('text');
    });

    it('gemmer en gyldig type', async () => {
      for (const t of ['team', 'teams', 'number', 'time', 'boolean']) {
        mockAddDoc.mockClear();
        await createBonusQuestion({ text: 'x', points: 3, type: t });
        expect(mockAddDoc.mock.calls[0][1].type).toBe(t);
      }
    });

    it('falder tilbage til text ved ukendt type', async () => {
      await createBonusQuestion({ text: 'x', points: 3, type: 'football' });
      expect(mockAddDoc.mock.calls[0][1].type).toBe('text');
    });

    it('gemmer facit som streng for skalar-typer', async () => {
      await createBonusQuestion({ text: 'x', points: 3, type: 'boolean', facit: 'ja' });
      expect(mockAddDoc.mock.calls[0][1].facit).toBe('ja');
    });

    it('gemmer facit som array for teams', async () => {
      await createBonusQuestion({ text: 'x', points: 3, type: 'teams', facit: ['UAD', 'TVL'] });
      expect(mockAddDoc.mock.calls[0][1].facit).toEqual(['UAD', 'TVL']);
    });

    it('facit defaulter til null når ikke angivet', async () => {
      await createBonusQuestion({ text: 'x', points: 3, type: 'number' });
      expect(mockAddDoc.mock.calls[0][1].facit).toBeNull();
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

  // ─── updateBonusQuestion ──────────────────────────────────────────────────

  describe('updateBonusQuestion', () => {
    it('kalder doc med bonusQuestions collection og korrekt id', async () => {
      const { db } = await import('../../firebase');
      await updateBonusQuestion('q-9', { text: 'x', points: 3, type: 'text' });
      expect(mockDoc).toHaveBeenCalledWith(db, 'bonusQuestions', 'q-9');
    });

    it('skriver text, points, type, facit og deadline', async () => {
      await updateBonusQuestion('q-9', { text: '  Hvem?  ', points: '7', type: 'boolean', facit: 'ja' });
      const call = mockUpdateDoc.mock.calls[0][1];
      expect(call.text).toBe('Hvem?');
      expect(call.points).toBe(7);
      expect(call.type).toBe('boolean');
      expect(call.facit).toBe('ja');
      expect(call.deadline).toBeNull();
    });

    it('skriver IKKE point på bonusBets — kun spørgsmåls-doc opdateres', async () => {
      await updateBonusQuestion('q-9', { text: 'x', points: 5 });
      // Kun ét updateDoc-kald, mod bonusQuestions-dokumentet.
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'bonusQuestions', 'q-9');
    });

    it('sætter deadline som Timestamp når angivet', async () => {
      await updateBonusQuestion('q-9', { text: 'x', points: 3, deadline: '2026-07-01T12:00' });
      const call = mockUpdateDoc.mock.calls[0][1];
      expect(call.deadline).toBeDefined();
      expect(call.deadline).not.toBeNull();
    });

    it('beholder facit som array for teams', async () => {
      await updateBonusQuestion('q-9', { text: 'x', points: 3, type: 'teams', facit: ['UAD', 'TVL'] });
      expect(mockUpdateDoc.mock.calls[0][1].facit).toEqual(['UAD', 'TVL']);
    });

    it('normaliserer tomt facit til null', async () => {
      await updateBonusQuestion('q-9', { text: 'x', points: 3, type: 'text', facit: '   ' });
      expect(mockUpdateDoc.mock.calls[0][1].facit).toBeNull();
    });

    it('falder tilbage til text ved ukendt type', async () => {
      await updateBonusQuestion('q-9', { text: 'x', points: 3, type: 'football' });
      expect(mockUpdateDoc.mock.calls[0][1].type).toBe('text');
    });

    it('kaster fejl ved tom tekst og kalder ikke updateDoc', async () => {
      await expect(updateBonusQuestion('q-9', { text: '   ', points: 3 })).rejects.toThrow(/tom/i);
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('kaster fejl ved ikke-positivt point og kalder ikke updateDoc', async () => {
      await expect(updateBonusQuestion('q-9', { text: 'x', points: 0 })).rejects.toThrow(/positivt tal/i);
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });
  });

  // ─── deleteBonusQuestion ──────────────────────────────────────────────────

  describe('deleteBonusQuestion', () => {
    it('kalder deleteDoc', async () => {
      await deleteBonusQuestion('q-del');
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    });

    it('kalder doc med bonusQuestions collection og korrekt id', async () => {
      const { db } = await import('../../firebase');
      await deleteBonusQuestion('q-del');
      expect(mockDoc).toHaveBeenCalledWith(db, 'bonusQuestions', 'q-del');
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
