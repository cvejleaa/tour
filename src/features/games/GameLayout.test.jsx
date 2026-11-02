// ---------------------------------------------------------------------------
// SÆSON-CHIPPEN i spillets hoved («Sæson 2026-27 · Åben»). En turnering med
// fasekalender har ingen sæson (QC-klient 2, del 3): chippen skal væk dér —
// årstallet står i navnet — og stå uændret i en liga. Gaten er EVNEN
// (harFaseKalender), ikke sporten.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GameLayout from './GameLayout';
import { HAANDBOLD_SPIL } from '../../test/faseKalender';

const tegn = (game) => render(
  <MemoryRouter><GameLayout game={game} me={null}><p>indhold</p></GameLayout></MemoryRouter>,
).container.textContent;

describe('GameLayout — sæson-chippen', () => {
  it('Superligaen: «Sæson 2026-27 · Åben» som før', () => {
    const t = tegn({ id: 'superliga2627', type: 'football', name: 'Superligaen 2026/27', season: '2026-27', status: 'open' });
    expect(t).toContain('Sæson 2026-27 · Åben');
  });

  it('en liga uden season: ingen chip — aldrig «Sæson undefined»', () => {
    const t = tegn({ id: 'x', type: 'football', name: 'Et spil', status: 'open' });
    expect(t).not.toMatch(/Sæson/);
    expect(t).toContain('Åben');
  });

  it('en turnering med fasekalender: ingen «Sæson» — kun status', () => {
    const t = tegn({ ...HAANDBOLD_SPIL, season: '2027', status: 'open' });
    expect(t).toContain('Åben');
    expect(t).not.toMatch(/sæson/i);
    expect(t).not.toContain('2027 · ');
  });
});
