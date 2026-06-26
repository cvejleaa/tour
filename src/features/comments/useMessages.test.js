import { describe, it, expect } from 'vitest';
import { groupConversations } from './useMessages';

const ts = (ms) => ({ toMillis: () => ms });

describe('groupConversations', () => {
  const me = 'me';
  const messages = [
    { id: '1', participants: ['me', 'a'], from: 'me', to: 'a', text: 'hej a', createdAt: ts(100) },
    { id: '2', participants: ['me', 'a'], from: 'a', to: 'me', text: 'hej igen', createdAt: ts(200) },
    { id: '3', participants: ['me', 'b'], from: 'b', to: 'me', text: 'fra b', createdAt: ts(300) },
  ];

  it('grupperer pr. modpart', () => {
    const convos = groupConversations(messages, me);
    expect(convos).toHaveLength(2);
  });

  it('tæller beskeder pr. samtale', () => {
    const convos = groupConversations(messages, me);
    const a = convos.find((c) => c.otherUid === 'a');
    expect(a.count).toBe(2);
  });

  it('bruger seneste besked som "last"', () => {
    const convos = groupConversations(messages, me);
    const a = convos.find((c) => c.otherUid === 'a');
    expect(a.last.text).toBe('hej igen');
  });

  it('sorterer nyeste samtale øverst', () => {
    const convos = groupConversations(messages, me);
    expect(convos[0].otherUid).toBe('b'); // ts 300 er nyest
  });

  it('håndterer tom liste', () => {
    expect(groupConversations([], me)).toEqual([]);
  });
});
