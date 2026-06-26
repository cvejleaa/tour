import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase/firestore før import af modulet
const addDocMock = vi.fn(async () => ({ id: 'new-id' }));
const deleteDocMock = vi.fn(async () => {});
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, name, id) => ({ name, id })),
  addDoc: (...a) => addDocMock(...a),
  deleteDoc: (...a) => deleteDocMock(...a),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

import {
  conversationId,
  postLeagueComment,
  sendMessage,
  deleteLeagueComment,
} from './commentActions';

describe('conversationId', () => {
  it('er uafhængig af rækkefølge', () => {
    expect(conversationId('a', 'b')).toBe(conversationId('b', 'a'));
  });
  it('joiner sorterede uids med dobbelt-underscore', () => {
    expect(conversationId('zeb', 'amy')).toBe('amy__zeb');
  });
});

describe('postLeagueComment', () => {
  beforeEach(() => { addDocMock.mockClear(); });

  it('afviser tom tekst', async () => {
    await expect(postLeagueComment({ leagueId: 'l', uid: 'u', text: '   ' }))
      .rejects.toThrow(/Skriv en besked/);
  });

  it('afviser for lang tekst', async () => {
    await expect(postLeagueComment({ leagueId: 'l', uid: 'u', text: 'x'.repeat(1001) }))
      .rejects.toThrow(/for lang/);
  });

  it('kræver liga og bruger', async () => {
    await expect(postLeagueComment({ uid: 'u', text: 'hej' })).rejects.toThrow(/Mangler liga/);
    await expect(postLeagueComment({ leagueId: 'l', text: 'hej' })).rejects.toThrow(/logget ind/);
  });

  it('gemmer trimmet tekst og forfatter', async () => {
    await postLeagueComment({ leagueId: 'l1', uid: 'u1', displayName: 'Per', text: '  hej  ' });
    expect(addDocMock).toHaveBeenCalledTimes(1);
    const payload = addDocMock.mock.calls[0][1];
    expect(payload).toMatchObject({ leagueId: 'l1', uid: 'u1', displayName: 'Per', text: 'hej' });
  });

  it('falder tilbage til "Spiller" uden displayName', async () => {
    await postLeagueComment({ leagueId: 'l1', uid: 'u1', text: 'hej' });
    expect(addDocMock.mock.calls[0][1].displayName).toBe('Spiller');
  });
});

describe('sendMessage', () => {
  beforeEach(() => { addDocMock.mockClear(); });

  it('afviser besked til sig selv', async () => {
    await expect(sendMessage({ from: 'a', to: 'a', text: 'hej' }))
      .rejects.toThrow(/dig selv/);
  });

  it('kræver modtager', async () => {
    await expect(sendMessage({ from: 'a', text: 'hej' })).rejects.toThrow(/modtager/);
  });

  it('kræver en delt liga (leagueId)', async () => {
    await expect(sendMessage({ from: 'a', to: 'b', text: 'hej' }))
      .rejects.toThrow(/deler en liga/);
  });

  it('sætter sorterede participants, conversationId og leagueId', async () => {
    await sendMessage({ from: 'zeb', to: 'amy', text: 'hej', leagueId: 'lg1' });
    const payload = addDocMock.mock.calls[0][1];
    expect(payload.participants).toEqual(['amy', 'zeb']);
    expect(payload.conversationId).toBe('amy__zeb');
    expect(payload.from).toBe('zeb');
    expect(payload.to).toBe('amy');
    expect(payload.leagueId).toBe('lg1');
  });
});

describe('deleteLeagueComment', () => {
  beforeEach(() => { deleteDocMock.mockClear(); });
  it('kræver id', async () => {
    await expect(deleteLeagueComment()).rejects.toThrow(/Mangler/);
  });
  it('kalder deleteDoc', async () => {
    await deleteLeagueComment('c1');
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });
});
