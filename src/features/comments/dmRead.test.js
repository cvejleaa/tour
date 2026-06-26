import { describe, it, expect, beforeEach } from 'vitest';
import { computeUnread, markConversationSeen, getSeenMap } from './dmRead';

const ts = (ms) => ({ toMillis: () => ms });

describe('computeUnread', () => {
  const me = 'me';
  const messages = [
    { id: '1', from: 'A', to: 'me', participants: ['A', 'me'], createdAt: ts(100) },
    { id: '2', from: 'A', to: 'me', participants: ['A', 'me'], createdAt: ts(200) },
    { id: '3', from: 'B', to: 'me', participants: ['B', 'me'], createdAt: ts(50) },
    { id: '4', from: 'me', to: 'A', participants: ['A', 'me'], createdAt: ts(300) }, // fra mig → ignoreres
  ];

  it('tæller kun beskeder til mig, der er nyere end sidst set', () => {
    const { total, byUser } = computeUnread(messages, me, { A: 150 });
    expect(byUser.A).toBe(1);   // kun t=200
    expect(byUser.B).toBe(1);   // t=50 > 0
    expect(total).toBe(2);
  });

  it('returnerer 0 når alt er set', () => {
    const { total } = computeUnread(messages, me, { A: 999, B: 999 });
    expect(total).toBe(0);
  });

  it('ignorerer beskeder sendt af mig selv', () => {
    const { byUser } = computeUnread(messages, me, {});
    // 'me'→A tæller ikke som ulæst for mig
    expect(byUser.me).toBeUndefined();
  });
});

describe('markConversationSeen', () => {
  beforeEach(() => localStorage.clear());

  it('gemmer seneste set-tidspunkt for en samtale', () => {
    markConversationSeen('A', 500);
    expect(getSeenMap().A).toBe(500);
  });

  it('overskriver ikke med et ældre tidspunkt', () => {
    markConversationSeen('A', 500);
    markConversationSeen('A', 200);
    expect(getSeenMap().A).toBe(500);
  });

  it('opdaterer til et nyere tidspunkt', () => {
    markConversationSeen('A', 200);
    markConversationSeen('A', 800);
    expect(getSeenMap().A).toBe(800);
  });
});
