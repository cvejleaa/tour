import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OnboardingChecklist from './OnboardingChecklist';

function renderIt(uid = 'u1') {
  return render(<MemoryRouter><OnboardingChecklist uid={uid} /></MemoryRouter>);
}

describe('OnboardingChecklist', () => {
  beforeEach(() => localStorage.clear());

  it('viser velkomst og de fire trin', () => {
    renderIt();
    expect(screen.getByText(/Velkommen/)).toBeInTheDocument();
    expect(screen.getByText(/Tip kampene/)).toBeInTheDocument();
    expect(screen.getByText(/Svar på bonus/)).toBeInTheDocument();
    expect(screen.getByText(/Opret eller join en liga/)).toBeInTheDocument();
  });

  it('skjuler og husker valget i localStorage', () => {
    renderIt('u1');
    fireEvent.click(screen.getByText(/Forstået, skjul/));
    expect(screen.queryByText(/Velkommen/)).not.toBeInTheDocument();
    expect(localStorage.getItem('vm:onboarded:u1')).toBe('1');
  });

  it('viser ikke noget hvis allerede skjult', () => {
    localStorage.setItem('vm:onboarded:u2', '1');
    renderIt('u2');
    expect(screen.queryByText(/Velkommen/)).not.toBeInTheDocument();
  });
});
