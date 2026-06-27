// Tests for TeamBadge – logo-miniature + pænt holdnavn med pæn fallback.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TeamBadge from './TeamBadge';

describe('TeamBadge', () => {
  it('viser holdnavn og logo når metadata findes (opslag på navn)', () => {
    const { container } = render(<TeamBadge name="Cofidis" />);
    expect(screen.getByText('Cofidis')).toBeInTheDocument();
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toContain('http');
  });

  it('slår op på holdkode og bruger det officielle navn', () => {
    render(<TeamBadge name="UEX" />);
    expect(screen.getByText('UAE Team Emirates XRG')).toBeInTheDocument();
  });

  it('mangler ikke blandet-kasse navne', () => {
    render(<TeamBadge name="Team Visma | Lease a Bike" />);
    expect(screen.getByText('Team Visma | Lease a Bike')).toBeInTheDocument();
  });

  it('falder tilbage til kun navnet uden metadata (intet logo)', () => {
    const { container } = render(<TeamBadge name="Ukendt Hold" />);
    expect(screen.getByText('Ukendt Hold')).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('viser bindestreg ved tomt navn', () => {
    render(<TeamBadge name="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('img er lazy', () => {
    const { container } = render(<TeamBadge name="Cofidis" />);
    expect(container.querySelector('img').getAttribute('loading')).toBe('lazy');
  });
});
