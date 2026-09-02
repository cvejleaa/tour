// Vagt: dokument-id'et skal ALTID vinde over et felt med samme navn.
//
// `{ id: d.id, ...d.data() }` lader et `id`-felt i dokumentet overskrive
// det ægte id — og det var muligt at skrive fra browseren på en spil-liga
// (Security-fund, PR #202). Mønstret stod 70 steder i kode, klient og
// server. Rækkefølgen er nu `{ ...d.data(), id: d.id }` overalt, og denne
// test holder den dér: et nyt sted med den gamle rækkefølge bliver rødt.
//
// Samme form som paritetstestene (mailMarkdown): en regel, der kun kan
// efterprøves ved at læse filerne, læser filerne.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROD = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAPPER = ['src', 'functions', 'functions-platform', 'scripts'];
const ENDELSER = ['.js', '.jsx', '.mjs'];
// id/uid som nøgle sat FØR et spread i samme objekt — uanset hvad der står
// imellem (`ref: d.ref`), og uanset om spreadet er `d.data()` eller en
// mellemvariabel (`...b`). Første udgave krævede `...SAMME_VAR.data()` lige
// efter nøglen og var blind for begge former (Test Manager- og Security-fund).
const GAMMEL = /\{\s*u?id:\s*[A-Za-z_]+\.id\s*,[^}]*\.\.\./;

function filer(mappe, ud = []) {
  for (const navn of readdirSync(mappe)) {
    if (navn === 'node_modules' || navn === 'dist' || navn.startsWith('.')) continue;
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) filer(sti, ud);
    else if (ENDELSER.some((e) => navn.endsWith(e)) && !/\.test\.[a-z]+$/.test(navn)) ud.push(sti);
  }
  return ud;
}

describe('dokument-id vinder over data-felter', () => {
  it('ingen fil spreder dokumentet OVEN PÅ id\'et', () => {
    const fund = [];
    for (const mappe of MAPPER) {
      for (const sti of filer(join(ROD, mappe))) {
        const linjer = readFileSync(sti, 'utf8').split('\n');
        linjer.forEach((l, i) => { if (GAMMEL.test(l)) fund.push(`${sti.slice(ROD.length + 1)}:${i + 1}`); });
      }
    }
    expect(fund).toEqual([]);
  });

  it('vagten genkender den gamle rækkefølge — og kun den', () => {
    // Selvtest: en vagt, der intet matcher, er ingen vagt.
    expect(GAMMEL.test('({ id: d.id, ...d.data() })')).toBe(true);
    expect(GAMMEL.test('({ uid: snap.id, ...snap.data() })')).toBe(true);
    expect(GAMMEL.test('({ id: d.id, ref: d.ref, ...d.data() })')).toBe(true);   // felt imellem
    expect(GAMMEL.test('({ id: d.id, ...b })')).toBe(true);                       // mellemvariabel
    expect(GAMMEL.test('({ ...d.data(), id: d.id })')).toBe(false);
    expect(GAMMEL.test('({ ...b, id: d.id })')).toBe(false);
    expect(GAMMEL.test('({ id: d.id, ref: d.ref })')).toBe(false);               // intet spread
  });
});
