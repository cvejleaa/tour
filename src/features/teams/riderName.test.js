import { describe, it, expect } from 'vitest';
import { splitRiderName } from './riderName';

describe('splitRiderName', () => {
  it('trækker et afsluttende (Land) ud af navnet', () => {
    expect(splitRiderName('Ben Healy (Irland)')).toEqual({ name: 'Ben Healy', country: 'Irland' });
    expect(splitRiderName('Michael Valgren (Danmark)')).toEqual({ name: 'Michael Valgren', country: 'Danmark' });
  });

  it('lader et allerede adskilt country stå (parentes vinder ikke over eksisterende)', () => {
    expect(splitRiderName('Jonas Vingegaard', 'Danmark')).toEqual({ name: 'Jonas Vingegaard', country: 'Danmark' });
    // Hvis begge findes, bevares det eksisterende country-felt.
    expect(splitRiderName('Ben Healy (IRL)', 'Irland')).toEqual({ name: 'Ben Healy', country: 'Irland' });
  });

  it('rører ikke navne uden parentes', () => {
    expect(splitRiderName('Sepp Kuss')).toEqual({ name: 'Sepp Kuss', country: '' });
  });

  it('ignorerer en parentes uden navn foran', () => {
    expect(splitRiderName('(Irland)')).toEqual({ name: '(Irland)', country: '' });
  });

  it('tåler tomt/ugyldigt input', () => {
    expect(splitRiderName(null)).toEqual({ name: '', country: '' });
    expect(splitRiderName(undefined, null)).toEqual({ name: '', country: '' });
  });
});
