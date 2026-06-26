import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HelpPage from './HelpPage';

describe('HelpPage', () => {
  it('viser de centrale hjælpe-afsnit', () => {
    render(<MemoryRouter><HelpPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /Sådan virker det/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tip kampene/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Bonusspørgsmål/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Mini-ligaer/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Mine opgaver/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Skriv sammen/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /E-mail-påmindelser/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Din profil/ })).toBeInTheDocument();
  });
});
