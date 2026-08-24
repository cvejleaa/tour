#!/usr/bin/env node
// Måler den FASTE kontekst, en Claude Code-session bærer med sig.
//
// Baggrund: CLAUDE.md og agenternes description-felter ligger i systemprompten
// og sendes med i HVER tur. Agent-brødtekst og agent-hukommelse lastes kun,
// når rollen invokeres — men hukommelsen vokser uden loft, og QC-rollen køres
// på ENHVER ændring, så dens hukommelse er reelt en fast omkostning pr. rolle-kørsel.
//
// Kør:  node scripts/maal-fast-kontekst.mjs
//       node scripts/maal-fast-kontekst.mjs --json
//       node scripts/maal-fast-kontekst.mjs --exact   (kræver ANTHROPIC_API_KEY)
//
// Uden --exact er TOKEN-tallene skøn; TEGN-tallene er målt. Med --exact
// hentes de rigtige tal fra /v1/messages/count_tokens, så skønnet kan
// efterprøves i stedet for at blive gentaget.
//
// Token-skøn: dansk tokeniserer dårligere end engelsk pga. æøå og lange
// sammensatte ord. tegn/4 er det gængse engelske skøn; tegn/3.2 er et
// realistisk dansk skøn. Begge vises, så man kan se spændet.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROD = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TEGN_PR_TOKEN_EN = 4;
const TEGN_PR_TOKEN_DA = 3.2;

// Pris pr. 1M input-tokens (Claude API, listepris).
const PRIS = { opus: 5.0, sonnet: 3.0, haiku: 1.0 };
const CACHE_READ_FAKTOR = 0.1; // cache-læsning koster ~0,1x base-input

const tokens = (t) => ({
  en: Math.round(t / TEGN_PR_TOKEN_EN),
  da: Math.round(t / TEGN_PR_TOKEN_DA),
});

function laes(sti) {
  const t = readFileSync(join(ROD, sti), 'utf8');
  return { sti, tegn: t.length, bytes: Buffer.byteLength(t, 'utf8'), tekst: t };
}

function mdFiler(mappe) {
  const abs = join(ROD, mappe);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => laes(join(mappe, f)));
}

// description-feltet i frontmatter ligger i systemprompten og sendes hver tur.
// Resten af filen lastes kun ved invokation.
function splitFrontmatter(fil) {
  const m = fil.tekst.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { description: 0, brødtekst: fil.tegn };
  const d = m[1].match(/^description:.*$/m);
  return {
    description: d ? d[0].length : 0,
    brødtekst: fil.tegn - m[0].length,
  };
}

const claudeMd = laes('CLAUDE.md');
const agenter = mdFiler('.claude/agents');
const kommandoer = mdFiler('.claude/commands');
const hukommelse = mdFiler('.claude/agent-memory');

// ---- Altid injiceret: CLAUDE.md + alle description-felter ----
const altid = [{ navn: 'CLAUDE.md', tegn: claudeMd.tegn }];
for (const a of [...agenter, ...kommandoer]) {
  const { description } = splitFrontmatter(a);
  altid.push({ navn: `${relative(ROD, join(ROD, a.sti))} (description)`, tegn: description });
}
const altidSum = altid.reduce((s, x) => s + x.tegn, 0);

// ---- Kun ved invokation: agent-brødtekst + rollens egen hukommelse ----
const vedInvokation = agenter.map((a) => {
  const { brødtekst } = splitFrontmatter(a);
  const navn = a.sti.split('/').pop().replace('.md', '');
  const mem = hukommelse.find((h) => h.sti.endsWith(`/${navn}.md`));
  return { rolle: navn, brødtekst, hukommelse: mem ? mem.tegn : 0, ialt: brødtekst + (mem ? mem.tegn : 0) };
});

const resultat = {
  altidInjiceret: { poster: altid, tegn: altidSum, tokens: tokens(altidSum) },
  vedInvokation,
  hukommelseIalt: hukommelse.reduce((s, h) => s + h.tegn, 0),
};

// Med --exact: hent de rigtige tokental fra API'et i stedet for at gætte.
if (process.argv.includes('--exact')) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error('--exact kræver ANTHROPIC_API_KEY. Uden den er tallene skøn.');
    process.exit(1);
  }
  const tael = async (tekst) => {
    const r = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        messages: [{ role: 'user', content: tekst }],
      }),
    });
    if (!r.ok) throw new Error(`count_tokens ${r.status}: ${await r.text()}`);
    return (await r.json()).input_tokens;
  };
  const maalt = await tael(claudeMd.tekst);
  const skoenEn = tokens(claudeMd.tegn).en;
  const skoenDa = tokens(claudeMd.tegn).da;
  console.log('\n=== MÅLT MED TOKENIZEREN (CLAUDE.md) ===');
  console.log(`  målt:        ${maalt} tokens`);
  console.log(`  skøn tegn/4: ${skoenEn} (afvigelse ${(((skoenEn - maalt) / maalt) * 100).toFixed(1)}%)`);
  console.log(`  skøn tegn/3.2: ${skoenDa} (afvigelse ${(((skoenDa - maalt) / maalt) * 100).toFixed(1)}%)`);
  console.log(`  faktisk tegn/token: ${(claudeMd.tegn / maalt).toFixed(2)}\n`);
  process.exit(0);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(resultat, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);

  console.log('\n=== ALTID INJICERET (hver eneste tur) ===');
  for (const p of altid) {
    if (p.tegn === 0) continue;
    console.log(`  ${pad(p.navn, 52)} ${num(p.tegn, 7)} tegn  ~${num(tokens(p.tegn).da, 5)} tok`);
  }
  console.log(`  ${pad('SUM', 52)} ${num(altidSum, 7)} tegn  ~${num(tokens(altidSum).da, 5)} tok`);
  console.log(`  (tegn/4 = ${tokens(altidSum).en} tok · tegn/3.2 = ${tokens(altidSum).da} tok)`);

  console.log('\n=== KUN VED INVOKATION (pr. rolle-kørsel) ===');
  console.log(`  ${pad('rolle', 28)} ${num('brødtekst', 10)} ${num('hukommelse', 11)} ${num('i alt', 8)}  ~tokens`);
  for (const r of [...vedInvokation].sort((a, b) => b.ialt - a.ialt)) {
    console.log(
      `  ${pad(r.rolle, 28)} ${num(r.brødtekst, 10)} ${num(r.hukommelse, 11)} ${num(r.ialt, 8)}  ~${tokens(r.ialt).da}`,
    );
  }

  console.log('\n=== PRIS ===');
  const t = tokens(altidSum).da;
  const koldOpus = (t / 1e6) * PRIS.opus;
  const cachetOpus = koldOpus * CACHE_READ_FAKTOR;
  console.log(`  Altid-blokken, opus, ucachet:  $${koldOpus.toFixed(4)} pr. tur`);
  console.log(`  Altid-blokken, opus, cachet:   $${cachetOpus.toFixed(4)} pr. tur (~0,1x)`);
  console.log('  NB: altid-blokken er prefix-stabil og cacher godt. Den reelle');
  console.log('      omkostning er kontekstvindue-plads, ikke dollars.');

  const qc = vedInvokation.find((r) => r.rolle === 'quality-control-manager');
  if (qc) {
    const qct = tokens(qc.ialt).da;
    console.log(
      `\n  Quality Control pr. kørsel: ~${qct} tok = $${((qct / 1e6) * PRIS.sonnet).toFixed(4)} (sonnet, ucachet)`,
    );
    console.log('      Den køres på ENHVER ændring, og hukommelsen vokser uden loft.');
  }
  console.log();
}
