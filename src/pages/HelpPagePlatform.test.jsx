import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Tving platform-tilstand, så HelpPage viser samleside-hjælpen.
vi.mock('../lib/platform', () => ({ PLATFORM_MODE: true, HOME_PATH: '/spil', APP_NAME: 'Vejleaa Tip' }));

import HelpPage from './HelpPage';

describe('HelpPage (platform/samleside)', () => {
  it('forklarer én bruger på tværs af flere spil', () => {
    render(<MemoryRouter><HelpPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /Velkommen til Vejleaa Tip/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Én bruger, flere spil/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Spillene lige nu/ })).toBeInTheDocument();
    // Omtaler de forskellige spils essens.
    expect(screen.getByText(/Superligaen 2026\/27/)).toBeInTheDocument();
    expect(screen.getByText(/Tour de France 2026/)).toBeInTheDocument();
    // Spil-specifik mekanik (Chancen/combi) hører til inde i spillet, ikke her.
    expect(screen.queryByRole('heading', { name: /Combi-runde-bonus/ })).not.toBeInTheDocument();
    // Peger på den spil-interne hjælp.
    expect(screen.getAllByText(/❓ Hjælp/).length).toBeGreaterThan(0);
  });
});
