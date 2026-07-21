import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Tving platform-tilstand, så HelpPage viser Superliga-guiden.
vi.mock('../lib/platform', () => ({ PLATFORM_MODE: true, HOME_PATH: '/spil', APP_NAME: 'Vejleaa Tip' }));

import HelpPage from './HelpPage';

describe('HelpPage (platform)', () => {
  it('viser Superliga-guidens afsnit', () => {
    render(<MemoryRouter><HelpPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /Sådan virker det/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Kom i gang/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tip kampene/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Point følger oddsene/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Chancen/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Combi-runde-bonus/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /pulje-tip/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Elo-tabellen/ })).toBeInTheDocument();
    // Ingen cykel-afsnit i platform-guiden.
    expect(screen.queryByRole('heading', { name: /Tip etaperne/ })).not.toBeInTheDocument();
  });
});
