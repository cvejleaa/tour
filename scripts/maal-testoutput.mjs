#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/maal-testoutput.mjs — måler hvad test-, lint- og build-kørsler
// koster i OUTPUT-tokens (ikke tid).
//
// Baggrund: en agent, der kører `npx vitest run`, betaler for hele outputtet
// som kontekst. Tallene bag anbefalingen "brug --silent" står her, så de kan
// efterprøves — jf. CLAUDE.md: "Et tal uden kode er en påstand."
//
// Brug:
//   node scripts/maal-testoutput.mjs            # kør alle kommandoer og mål
//   node scripts/maal-testoutput.mjs --anslaa FIL...   # anslå kun tokens i filer
//
// Token-anslaget er et ANSLAG, ikke en optælling: der findes ingen lokal
// tokenizer i repoet. Metoden står i anslaaTokens() og er bevidst konservativ
// (den underdriver ikke). Kryds­tjek mod ord-tallet printes med, så et skævt
// anslag kan ses i stedet for at blive troet.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Anslår tokens i en streng.
 *
 * To bidrag, fordi de tokeniseres vidt forskelligt:
 *  - ikke-ASCII tegn (✓ ❯ ⎯ ⚠ × æøå) koster typisk MINDST ét token hver, og
 *    ofte flere, fordi de er 2-3 bytes UTF-8. Vi regner 1,0 og underdriver
 *    dermed bevidst.
 *  - ASCII: log-output er sti-tungt ("src/features/games/football/…"), og
 *    stier splittes i mange subword-tokens. 3,6 tegn/token er derfor tættere
 *    på end tommelfingerreglen 4,0 for løbende engelsk tekst.
 */
function anslaaTokens(tekst) {
  let ascii = 0;
  let ikkeAscii = 0;
  for (const tegn of tekst) {
    if (tegn.codePointAt(0) < 128) ascii++;
    else ikkeAscii++;
  }
  return Math.round(ascii / 3.6 + ikkeAscii);
}

function maal(tekst) {
  const bytes = Buffer.byteLength(tekst, 'utf8');
  const tegn = [...tekst].length;
  const linjer = tekst.split('\n').length - 1;
  const ord = tekst.split(/\s+/).filter(Boolean).length;
  return {
    bytes,
    tegn,
    linjer,
    ord,
    tokens: anslaaTokens(tekst),
    // Krydstjek: sti-tungt log-output ligger typisk på 1,3-1,6 tokens/ord.
    tokensPrOrd: ord ? +(anslaaTokens(tekst) / ord).toFixed(2) : 0,
  };
}

// Kommandoerne, der måles. `navn` er det, tabellen viser.
const KOMMANDOER = [
  ['vitest (standard)',        'npx vitest run'],
  ['vitest --reporter=dot',    'npx vitest run --reporter=dot'],
  ['vitest --silent',          'npx vitest run --silent'],
  ['vitest --silent | tail -5','npx vitest run --silent 2>&1 | tail -5'],
  ['npm run lint',             'npm run lint'],
  ['npm run build',            'npm run build'],
  ['functions',                'npm --prefix functions test'],
  ['functions --silent',       'npm --prefix functions test -- --silent'],
  ['functions-platform',       'npm --prefix functions-platform test'],
  ['functions-platform --silent','npm --prefix functions-platform test -- --silent'],
];

function koer(kommando) {
  const start = Date.now();
  let ud;
  try {
    ud = execSync(`${kommando} 2>&1`, {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: '/bin/bash',
    });
  } catch (fejl) {
    // Rød suite er stadig en gyldig måling — outputtet er dét, vi betaler for.
    ud = `${fejl.stdout || ''}${fejl.stderr || ''}`;
  }
  return { ud, sekunder: +((Date.now() - start) / 1000).toFixed(1) };
}

function skrivTabel(raekker) {
  const hoved = ['kommando', 'sek', 'bytes', 'linjer', '~tokens', 'tok/ord'];
  const data = raekker.map((r) => [
    r.navn,
    String(r.sekunder ?? '-'),
    String(r.bytes),
    String(r.linjer),
    String(r.tokens),
    String(r.tokensPrOrd),
  ]);
  const bredder = hoved.map((h, i) =>
    Math.max(h.length, ...data.map((d) => d[i].length)),
  );
  const linje = (celler) =>
    celler.map((c, i) => c.padEnd(bredder[i])).join('  ').trimEnd();
  console.log(linje(hoved));
  console.log(bredder.map((b) => '-'.repeat(b)).join('  '));
  for (const d of data) console.log(linje(d));
}

const argv = process.argv.slice(2);

if (argv[0] === '--anslaa') {
  const raekker = argv.slice(1).map((sti) => ({
    navn: sti,
    ...maal(readFileSync(sti, 'utf8')),
  }));
  skrivTabel(raekker);
} else {
  const raekker = [];
  for (const [navn, kommando] of KOMMANDOER) {
    process.stderr.write(`kører: ${navn}\n`);
    const { ud, sekunder } = koer(kommando);
    raekker.push({ navn, sekunder, ...maal(ud) });
  }
  skrivTabel(raekker);
}
