// Vagt: adgangskoderne må kun importeres fra e2e/, og konstanter.mjs (som
// Vitest-tests og src/test/scenarie/ importerer) må ikke bære dem.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as konstanter from './konstanter.mjs';
import { ADGANGSKODER, adgangskode } from './adgangskoder.mjs';

function filerUnder(dir, ud = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) filerUnder(p, ud);
    else if (/\.(m?js|jsx)$/.test(e)) ud.push(p);
  }
  return ud;
}

describe('adgangskoder.mjs', () => {
  it('konstanter.mjs bærer ingen adgangskoder — hverken som felt eller som streng', () => {
    for (const v of Object.values(konstanter)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) expect(v).not.toHaveProperty('password');
    }
    const kilde = readFileSync(join(process.cwd(), 'e2e/fixtures/konstanter.mjs'), 'utf8');
    for (const pw of Object.values(ADGANGSKODER)) expect(kilde).not.toContain(pw);
  });

  it('importeres kun fra e2e/ — aldrig fra src/', () => {
    const importoerer = filerUnder(join(process.cwd(), 'src'))
      .filter((f) => /adgangskoder\.mjs/.test(readFileSync(f, 'utf8')));
    expect(importoerer).toEqual([]);
  });

  it('kender hver seedet konto og kaster for en ukendt', () => {
    for (const b of [konstanter.SPILLER, konstanter.EJER, konstanter.MODSPILLER, konstanter.FREMMED, konstanter.FORLADT]) {
      expect(adgangskode(b.uid)).toMatch(/^e2e-hemmelig-\d$/);
    }
    expect(() => adgangskode('ukendt')).toThrow(/ukendt/);
  });
});
