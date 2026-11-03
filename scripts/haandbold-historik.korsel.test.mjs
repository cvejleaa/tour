// Beviset for SELVE scriptet (haandbold-historik.mjs) med --filer — ikke kun
// for udtraekKampe: at finalesiden findes i mappen under sin filnøgle
// (TURNERINGER[].transklusioner), gives med, og at en manglende fil giver
// 'andenSide' i udskriften. Scriptet køres i en rigtig node-proces mod en
// temp-mappe med en syntetisk EM 2026-side (62 kampe, finalen transkluderet
// i samme niveau-2-sektion som bronzekampen — som på den rigtige side).
// Uden --skriv skriver scriptet intet; --filer sender intet kald.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const her = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(her, 'haandbold-historik.mjs');
vi.setConfig({ testTimeout: 30000 });

const FINALE = "2026 European Men's Handball Championship final";
const kamp = (i) => `{{handballbox\n|date=${(i % 28) + 1} January 2026\n|time=18:00\n|team1={{hb-rt|DEN}}\n|score=30–${20 + (i % 9)}\n|team2={{hb|GER}}\n|HT=15–10\n}}\n`;
const EM2026 = `{{Infobox International Handball Competition\n| matches = 62\n}}\n== Preliminary round ==\nAll times are local (UTC+1).\n`
  + Array.from({ length: 60 }, (_, i) => kamp(i)).join('')
  + `== Knockout stage ==\n=== Third place game ===\n${kamp(61)}=== Final ===\n{{#section:${FINALE}|Final}}\n\n== Rankings ==\n`;
const FINALESIDE = '==Match==\n<section begin="Final" />{{handballbox\n|date=1 February 2026\n|time=18:00\n|team1={{hb-rt|DEN}}\n|score=34–27\n|team2={{hb|GER}}\n|HT=18–16\n}}<section end="Final" />\n';

let mappe;
beforeEach(() => {
  mappe = mkdtempSync(join(tmpdir(), 'hb-historik-'));
  writeFileSync(join(mappe, 'em2026.wikitext'), EM2026);
});
afterEach(() => rmSync(mappe, { recursive: true, force: true }));

const koer = () => spawnSync(process.execPath, [SCRIPT, '--filer', mappe, '--turneringer', 'em2026'], { encoding: 'utf8', env: { ...process.env, NODE_USE_ENV_PROXY: '' } });

describe('scripts/haandbold-historik.mjs --filer med en transkluderet side', () => {
  it('finalesiden i mappen (em2026-finale.wikitext) indsættes: 62 spillede, intet afvist', () => {
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    const r = koer();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('em2026: 62 spillede');
    expect(r.stdout).toContain('siden siger 62 kampe');
    expect(r.stdout).toContain(`↳ afsnittet «Final» indsat fra «${FINALE}» (em2026-finale.wikitext)`);
    expect(r.stdout).not.toContain('AFVIST');
    expect(r.stdout).toContain('I alt 62 kampe fra 1 turneringer.');
    expect(r.stdout).toContain('Tør-kørsel — intet skrevet.');
  });

  it('uden finalesiden: 61 spillede, og finalen står som AFVIST (anden side) — aldrig tavst', () => {
    const r = koer();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('em2026: 61 spillede');
    expect(r.stdout).toContain(`⚠️  AFVIST (anden side) Knockout stage › Final: kampen står ikke på siden, men transkluderes fra «${FINALE}»`);
    expect(r.stdout).not.toContain('↳ afsnittet');
    expect(r.stdout).toContain('I alt 61 kampe fra 1 turneringer · 1 AFVIST (se ovenfor).');
  });

  it('to filer for finalesiden: scriptet stopper og skriver intet', () => {
    writeFileSync(join(mappe, 'em2026-finale.wikitext'), FINALESIDE);
    writeFileSync(join(mappe, 'em2026-finale.txt'), FINALESIDE);
    const r = koer();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/em2026-finale har 2 filer i mappen \((em2026-finale\.wikitext, em2026-finale\.txt|em2026-finale\.txt, em2026-finale\.wikitext)\)/);
    expect(r.stderr).toContain('Intet er skrevet.');
  });
});
