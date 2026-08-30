// Paritetstest: stillingsbredde.mjs' KOLONNER er en HARDKODET KOPI af
// stillingsrækken i GameStandings.jsx, og et spejl uden vagt er den næste
// "Spillene lige nu"-løgn. Uden denne test kunne en fjerde kolonne landes
// uden at komme med i harnesset, og målingen ville tavst gælde en tabel, der
// ikke findes — netop den fejl, harnesset blev bygget for at undgå.
//
// Målingen er ikke pynt: den afgjorde, at rundens point IKKE måtte være en
// egen kolonne (39-109 px uden for skærmkanten ved 320-390 px), og at det i
// stedet skulle stå som en linje under totalen. Holder spejlet ikke, holder
// begrundelsen for den beslutning heller ikke.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { KOLONNER } from './stillingsbredde.mjs';

const kilde = readFileSync(`${process.cwd()}/src/features/games/GameStandings.jsx`, 'utf8');

/** Row-komponentens krop — listens række, ikke podiet og ikke opdelingstabellen. */
function rowKrop() {
  const start = kilde.indexOf('  const Row = ');
  expect(start, 'fandt ikke Row i GameStandings — er komponenten omdøbt?').toBeGreaterThan(-1);
  const slut = kilde.indexOf('\n  };', start);
  return kilde.slice(start, slut);
}

describe('stillingsbredde.mjs spejler stillingsrækken', () => {
  it('måler lige så mange celler, som rækken faktisk har', () => {
    // Tæller <td> i Row. Ændrer nogen antallet, skal harnesset rettes — og
    // beslutningen om bredde tages om.
    const antal = [...rowKrop().matchAll(/<td\b/g)].length;
    expect(antal, `Row har ${antal} <td>, harnesset måler ${KOLONNER.length}`)
      .toBe(KOLONNER.length);
  });

  it('rundens point står IKKE i en egen celle', () => {
    // Selve beslutningen, bundet fast. RundeCelle skal stå inde i en
    // eksisterende <td> (totalens), ikke i sin egen — ellers er de 39-109 px
    // overløb tilbage, og de kan ikke hentes: listen har ingen .table-wrap.
    const krop = rowKrop();
    const iEgenCelle = /<td[^>]*>\s*(\{[^}]*\}\s*)?<RundeCelle/.test(krop);
    expect(iEgenCelle, 'RundeCelle har fået sin egen <td> — mål bredden igen (scripts/stillingsbredde.mjs)')
      .toBe(false);
    expect(krop).toContain('<RundeCelle');
  });

  it('listen har stadig INGEN .table-wrap — forudsætningen for hele målingen', () => {
    // Harnesset måler uden vandret scroll, fordi tabellen ikke har den. Får
    // den en .table-wrap (opgave #35), er overløb ikke længere afklippet
    // indhold, og målingens konklusion skal genbesøges.
    const tabel = kilde.slice(kilde.indexOf('listRows.length > 0 && ('));
    const foersteTabel = tabel.slice(0, tabel.indexOf('</table>'));
    expect(foersteTabel).not.toContain('table-wrap');
  });
});
