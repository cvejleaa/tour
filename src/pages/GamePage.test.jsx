// Hvilke faner et spil har.
//
// FANEN VAR DEN FORKERTE PÅSTAND. `pulje`-feltet blev lagt på spil-dokumentet
// med kommentaren "mangler feltet, har spillet ingen pulje-fane" — men ingen
// kode læste feltet. Fanen blev valgt på spiltype alene, så et Premier
// League-spil fik en pulje-fane med tolv DANSKE hold og en Gem-knap, der altid
// fejlede: firestore.rules kræver en puljeLockAt, som aldrig sættes på et spil
// uden pulje.
//
// Testen her findes for, at feltet bærer sin egen begrundelse.
import { describe, it, expect } from 'vitest';
import { faneVises } from './GamePage.jsx';

const FODBOLD_MED_PULJE = { type: 'football', pulje: { poolSize: 6 } };
const FODBOLD_UDEN_PULJE = { type: 'football' };
const CYKEL = { type: 'cycling' };

const pulje = { key: 'pulje', football: true, kraever: 'pulje' };
const tabel = { key: 'tabel', football: true };
const tip = { key: 'tip' };

describe('faneVises', () => {
  it('viser pulje-fanen på et spil MED pulje', () => {
    expect(faneVises(pulje, FODBOLD_MED_PULJE)).toBe(true);
  });

  // Kernen. Uden denne gate ser en Premier League-spiller danske hold.
  it('skjuler pulje-fanen på et fodboldspil UDEN pulje', () => {
    expect(faneVises(pulje, FODBOLD_UDEN_PULJE)).toBe(false);
  });

  it('skjuler fodbold-faner på et cykelspil', () => {
    expect(faneVises(pulje, CYKEL)).toBe(false);
    expect(faneVises(tabel, CYKEL)).toBe(false);
  });

  it('viser faner uden krav på alle spil', () => {
    for (const g of [FODBOLD_MED_PULJE, FODBOLD_UDEN_PULJE, CYKEL]) {
      expect(faneVises(tip, g)).toBe(true);
    }
  });

  // `kraever` peger på et felts TILSTEDEVÆRELSE, ikke på en boolean. En tom
  // blok er stadig en pulje; et manglende felt er ikke.
  it('læser tilstedeværelse, ikke sandhedsværdi', () => {
    expect(faneVises(pulje, { type: 'football', pulje: {} })).toBe(true);
    expect(faneVises(pulje, { type: 'football', pulje: null })).toBe(false);
  });

  // Et spil, der endnu ikke er indlæst, må ikke få faner tilbudt — så ville
  // fanerækken hoppe, når dokumentet lander.
  it('viser ingen spil-specifik fane uden et spil', () => {
    expect(faneVises(pulje, null)).toBe(false);
    expect(faneVises(tabel, undefined)).toBe(false);
  });
});
