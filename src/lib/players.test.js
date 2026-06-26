import { describe, it, expect } from 'vitest';
import { playerAge, positionDa } from './players';

describe('playerAge', () => {
  const now = new Date('2026-06-09');
  it('beregner hele år', () => {
    expect(playerAge('2000-01-01', now)).toBe(26);
    expect(playerAge('2000-12-31', now)).toBe(25); // fødselsdag ikke nået endnu
  });
  it('håndterer manglende/ugyldig dato', () => {
    expect(playerAge(null)).toBeNull();
    expect(playerAge('ikke-en-dato')).toBeNull();
  });
});

describe('positionDa', () => {
  it('oversætter kendte positioner', () => {
    expect(positionDa('Goalkeeper')).toBe('Målmand');
    expect(positionDa('Centre-Forward')).toBe('Angriber');
    expect(positionDa('Right Winger')).toBe('Kant');
  });
  it('falder tilbage til rå navn og håndterer tomt', () => {
    expect(positionDa('Sweeper')).toBe('Sweeper');
    expect(positionDa(null)).toBeNull();
  });
});
