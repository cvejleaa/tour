import { describe, it, expect } from 'vitest';
import { buildContactLeagues } from './contactLeagues';

describe('buildContactLeagues', () => {
  const leagues = [
    { id: 'A', memberUids: ['me', 'x', 'y'] },
    { id: 'B', memberUids: ['me', 'y', 'z'] },
    { id: 'C', memberUids: ['x', 'z'] }, // me er ikke med → ignoreres
  ];

  it('mapper liga-fæller til en delt liga-id', () => {
    const map = buildContactLeagues(leagues, 'me');
    expect(map).toEqual({ x: 'A', y: 'A', z: 'B' });
  });

  it('tager IKKE folk med fra ligaer man ikke selv er i', () => {
    const map = buildContactLeagues([{ id: 'C', memberUids: ['x', 'z'] }], 'me');
    expect(map).toEqual({});
  });

  it('udelader én selv og håndterer tomt input', () => {
    expect(buildContactLeagues([{ id: 'A', memberUids: ['me'] }], 'me')).toEqual({});
    expect(buildContactLeagues(null, 'me')).toEqual({});
    expect(buildContactLeagues(leagues, null)).toEqual({});
  });
});
