/**
 * Tests for leagueActions.js – fuldstændig mock af Firebase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLeague,
  joinLeague,
  setLeagueStatus,
  adminAddMember,
  leaveLeague,
  deleteLeague,
  removeMember,
  setLeagueAdmin,
  setLeagueScoring,
  setLeagueAiRecaps,
} from './leagueActions';

// ── Mock firebase/firestore ───────────────────────────────────────────────────
const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockDoc = vi.fn((db, col, id) => ({ _col: col, _id: id }));
const mockCollection = vi.fn((db, col) => ({ _col: col }));
const mockQuery = vi.fn((...args) => ({ _query: args }));
const mockWhere = vi.fn((...args) => ({ _where: args }));
const mockArrayUnion = vi.fn((...args) => ({ _arrayUnion: args }));
const mockArrayRemove = vi.fn((...args) => ({ _arrayRemove: args }));
const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }));

// Ryd alle mock-kald mellem tests
beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  addDoc: (...args) => mockAddDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  doc: (...args) => mockDoc(...args),
  arrayUnion: (...args) => mockArrayUnion(...args),
  arrayRemove: (...args) => mockArrayRemove(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  getDocs: (...args) => mockGetDocs(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

vi.mock('../../firebase', () => ({ db: {} }));

// ── Hjælpefunktion til at lave et falsk snapshot ──────────────────────────────
function makeSnap(docs) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({
      id: d.id,
      ref: { _id: d.id },
      data: () => d.data,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('createLeague', () => {
  beforeEach(() => {
    mockAddDoc.mockResolvedValue({ id: 'ny-liga-id' });
    mockServerTimestamp.mockReturnValue({ _ts: true });
  });

  it('returnerer det nye dokuments id', async () => {
    const id = await createLeague('Min Liga', 'uid-ejer');
    expect(id).toBe('ny-liga-id');
  });

  it('kalder addDoc med status pending', async () => {
    await createLeague('Min Liga', 'uid-ejer');
    const [, payload] = mockAddDoc.mock.calls[0];
    expect(payload.status).toBe('pending');
  });

  it('sætter memberUids til [ownerUid]', async () => {
    await createLeague('Min Liga', 'uid-ejer');
    const [, payload] = mockAddDoc.mock.calls[0];
    expect(payload.memberUids).toEqual(['uid-ejer']);
  });

  it('genererer en joinCode (6 tegn)', async () => {
    await createLeague('Min Liga', 'uid-ejer');
    const [, payload] = mockAddDoc.mock.calls[0];
    expect(payload.joinCode).toHaveLength(6);
  });

  it('trimmer ligaens navn', async () => {
    await createLeague('  Trimmet  ', 'uid-ejer');
    const [, payload] = mockAddDoc.mock.calls[0];
    expect(payload.name).toBe('Trimmet');
  });

  it('sætter createdAt til serverTimestamp', async () => {
    await createLeague('Min Liga', 'uid-ejer');
    const [, payload] = mockAddDoc.mock.calls[0];
    expect(payload.createdAt).toEqual({ _ts: true });
  });

  it('kaster fejl ved tomt navn', async () => {
    await expect(createLeague('', 'uid-ejer')).rejects.toThrow('Ligaen skal have et navn.');
  });

  it('kaster fejl ved navn kun med mellemrum', async () => {
    await expect(createLeague('   ', 'uid-ejer')).rejects.toThrow('Ligaen skal have et navn.');
  });

  it('kaster fejl ved manglende ownerUid', async () => {
    await expect(createLeague('Min Liga', '')).rejects.toThrow('Mangler brugerId.');
  });

  it('kaster fejl ved null ownerUid', async () => {
    await expect(createLeague('Min Liga', null)).rejects.toThrow('Mangler brugerId.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('joinLeague', () => {
  beforeEach(() => {
    mockUpdateDoc.mockResolvedValue(undefined);
  });

  it('kaster fejl ved manglende kode', async () => {
    await expect(joinLeague('', 'uid-1')).rejects.toThrow('Angiv en gyldig kode.');
  });

  it('kaster fejl ved null kode', async () => {
    await expect(joinLeague(null, 'uid-1')).rejects.toThrow('Angiv en gyldig kode.');
  });

  it('kaster fejl ved manglende uid', async () => {
    await expect(joinLeague('ABC123', '')).rejects.toThrow('Mangler brugerId.');
  });

  it('kaster fejl hvis ingen liga fundet', async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]));
    await expect(joinLeague('UGYLDIG', 'uid-1')).rejects.toThrow('Ingen liga fundet med den kode.');
  });

  it('kaster fejl hvis liga ikke er godkendt (pending)', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnap([{ id: 'liga-1', data: { status: 'pending', memberUids: [], name: 'Test' } }]),
    );
    await expect(joinLeague('ABC123', 'uid-1')).rejects.toThrow(
      'Ligaen er endnu ikke godkendt af admin.',
    );
  });

  it('kaster fejl hvis liga er afvist (rejected)', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnap([{ id: 'liga-1', data: { status: 'rejected', memberUids: [], name: 'Test' } }]),
    );
    await expect(joinLeague('ABC123', 'uid-1')).rejects.toThrow(
      'Ligaen er endnu ikke godkendt af admin.',
    );
  });

  it('kaster fejl hvis bruger allerede er medlem', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnap([
        { id: 'liga-1', data: { status: 'approved', memberUids: ['uid-1'], name: 'Test' } },
      ]),
    );
    await expect(joinLeague('ABC123', 'uid-1')).rejects.toThrow(
      'Du er allerede medlem af denne liga.',
    );
  });

  it('kalder updateDoc med arrayUnion ved success', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnap([{ id: 'liga-1', data: { status: 'approved', memberUids: [], name: 'TestLiga' } }]),
    );
    mockArrayUnion.mockReturnValue({ _arrayUnion: ['uid-1'] });
    await joinLeague('ABC123', 'uid-1');
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ memberUids: expect.anything() }),
    );
    expect(mockArrayUnion).toHaveBeenCalledWith('uid-1');
  });

  it('returnerer id og name ved success', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnap([{ id: 'liga-1', data: { status: 'approved', memberUids: [], name: 'TestLiga' } }]),
    );
    const result = await joinLeague('ABC123', 'uid-1');
    expect(result).toEqual({ id: 'liga-1', name: 'TestLiga' });
  });

  it('søger med uppercase-trimmet kode', async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]));
    await expect(joinLeague(' abc123 ', 'uid-1')).rejects.toThrow();
    expect(mockWhere).toHaveBeenCalledWith('joinCode', '==', 'ABC123');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('setLeagueStatus', () => {
  beforeEach(() => {
    mockUpdateDoc.mockResolvedValue(undefined);
  });

  it('kalder updateDoc med den nye status', async () => {
    await setLeagueStatus('liga-1', 'approved');
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      { status: 'approved' },
    );
  });

  it('fungerer med pending-status', async () => {
    await setLeagueStatus('liga-1', 'pending');
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { status: 'pending' });
  });

  it('fungerer med rejected-status', async () => {
    await setLeagueStatus('liga-1', 'rejected');
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { status: 'rejected' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('adminAddMember', () => {
  beforeEach(() => {
    mockUpdateDoc.mockResolvedValue(undefined);
    mockArrayUnion.mockImplementation((...args) => ({ _arrayUnion: args }));
  });

  it('kaster fejl ved manglende memberUid', async () => {
    await expect(adminAddMember('liga-1', '')).rejects.toThrow('Vælg et medlem.');
  });

  it('kaster fejl ved null memberUid', async () => {
    await expect(adminAddMember('liga-1', null)).rejects.toThrow('Vælg et medlem.');
  });

  it('kalder updateDoc med arrayUnion', async () => {
    await adminAddMember('liga-1', 'uid-ny');
    expect(mockUpdateDoc).toHaveBeenCalled();
    expect(mockArrayUnion).toHaveBeenCalledWith('uid-ny');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('setLeagueScoring', () => {
  beforeEach(() => { mockUpdateDoc.mockResolvedValue(undefined); });

  it('afviser hvis ingen dele er valgt', async () => {
    await expect(setLeagueScoring('liga-1', {
      group: false, knockout: false, bonus: false, leagueBonus: false,
    })).rejects.toThrow('mindst én del');
  });

  it('gemmer et saniteret scoring-objekt', async () => {
    await setLeagueScoring('liga-1', { group: true, knockout: false, bonus: true, doubleKnockout: true });
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.scoring).toMatchObject({ group: true, knockout: false, bonus: true, doubleKnockout: true });
  });
});

describe('setLeagueAdmin', () => {
  beforeEach(() => {
    mockUpdateDoc.mockResolvedValue(undefined);
    mockArrayUnion.mockImplementation((...args) => ({ _arrayUnion: args }));
    mockArrayRemove.mockImplementation((...args) => ({ _arrayRemove: args }));
  });

  it('kaster fejl uden uid', async () => {
    await expect(setLeagueAdmin('liga-1', '', true)).rejects.toThrow('Vælg en bruger.');
  });

  it('tilføjer liga-admin med arrayUnion', async () => {
    await setLeagueAdmin('liga-1', 'uid-2', true);
    expect(mockArrayUnion).toHaveBeenCalledWith('uid-2');
    expect(mockUpdateDoc).toHaveBeenCalled();
  });

  it('fjerner liga-admin med arrayRemove', async () => {
    await setLeagueAdmin('liga-1', 'uid-2', false);
    expect(mockArrayRemove).toHaveBeenCalledWith('uid-2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('leaveLeague', () => {
  beforeEach(() => {
    mockUpdateDoc.mockResolvedValue(undefined);
    mockArrayRemove.mockImplementation((...args) => ({ _arrayRemove: args }));
  });

  it('kaster fejl hvis uid er ejeren', async () => {
    await expect(leaveLeague('liga-1', 'ejer-uid', 'ejer-uid')).rejects.toThrow(
      'Ejeren kan ikke forlade sin liga. Slet den i stedet.',
    );
  });

  it('kalder updateDoc med arrayRemove når ikke-ejer forlader', async () => {
    await leaveLeague('liga-1', 'medlem-uid', 'ejer-uid');
    expect(mockUpdateDoc).toHaveBeenCalled();
    expect(mockArrayRemove).toHaveBeenCalledWith('medlem-uid');
  });

  it('kalder ikke updateDoc når ejeren forsøger at forlade', async () => {
    await expect(leaveLeague('liga-1', 'ejer-uid', 'ejer-uid')).rejects.toThrow();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('deleteLeague', () => {
  beforeEach(() => {
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  it('kaster fejl hvis uid ikke er ejeren', async () => {
    await expect(deleteLeague('liga-1', 'ikke-ejer', 'ejer-uid')).rejects.toThrow(
      'Kun ejeren kan slette ligaen.',
    );
  });

  it('kalder deleteDoc når ejeren sletter', async () => {
    await deleteLeague('liga-1', 'ejer-uid', 'ejer-uid');
    expect(mockDeleteDoc).toHaveBeenCalled();
  });

  it('kalder ikke deleteDoc ved uautoriseret forsøg', async () => {
    await expect(deleteLeague('liga-1', 'anden-uid', 'ejer-uid')).rejects.toThrow();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('removeMember', () => {
  beforeEach(() => {
    mockUpdateDoc.mockResolvedValue(undefined);
    mockArrayRemove.mockImplementation((...args) => ({ _arrayRemove: args }));
  });

  it('kaster fejl hvis memberUid er ownerUid', async () => {
    await expect(removeMember('liga-1', 'ejer-uid', 'ejer-uid')).rejects.toThrow(
      'Du kan ikke fjerne dig selv som ejer.',
    );
  });

  it('kalder updateDoc med arrayRemove for ikke-ejer', async () => {
    await removeMember('liga-1', 'medlem-uid', 'ejer-uid');
    expect(mockUpdateDoc).toHaveBeenCalled();
    expect(mockArrayRemove).toHaveBeenCalledWith('medlem-uid');
  });

  it('kalder ikke updateDoc ved ugyldig operation', async () => {
    await expect(removeMember('liga-1', 'ejer-uid', 'ejer-uid')).rejects.toThrow();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});

describe('setLeagueAiRecaps', () => {
  beforeEach(() => mockUpdateDoc.mockClear());
  it('kalder updateDoc med aiRecaps-flag', async () => {
    await setLeagueAiRecaps('liga-1', false);
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { aiRecaps: false });
  });
  it('kræver liga-id', async () => {
    await expect(setLeagueAiRecaps()).rejects.toThrow(/liga-id/);
  });
});
