/**
 * Tests for Avatar — emoji/initialer + yndlingshold-mærke (cykelhold).
 * Mærket skal nu vise cykelholdets trøje/logo, ikke et nationalt flag.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Avatar from './Avatar';

describe('Avatar', () => {
  it('viser emoji når den er sat', () => {
    render(<Avatar uid="u1" name="Carsten" emoji="🦁" />);
    expect(screen.getByText('🦁')).toBeInTheDocument();
  });

  it('viser initialer uden emoji', () => {
    render(<Avatar uid="u1" name="Carsten Vejleaa" />);
    expect(screen.getByText('CV')).toBeInTheDocument();
  });

  it('uden yndlingshold vises der intet mærke', () => {
    const { container } = render(<Avatar uid="u1" name="Carsten" />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('viser cykelholdets trøje/logo som mærke (ikke flag)', () => {
    const { container } = render(<Avatar uid="u1" name="Carsten" favoriteTeam="Cofidis" />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    // Skal være ASO-hosted trøje/logo — ikke flagcdn-flag
    expect(img.getAttribute('src')).toContain('http');
    expect(img.getAttribute('src')).not.toContain('flagcdn');
    expect(img.getAttribute('alt')).toBe('Cofidis');
    expect(img.getAttribute('title')).toBe('Cofidis');
  });

  it('viser INTET mærke for ukendt/legacy lande-kode (graceful fallback)', () => {
    const { container } = render(<Avatar uid="u1" name="Carsten" favoriteTeam="BRA" />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('tegner en trøje-avatar for en jersey-token (fx prik-trøjen)', () => {
    const { container } = render(<Avatar uid="u1" name="Carsten" emoji="jersey:polka" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Prik-trøjen har røde prikker (circle-elementer)
    expect(svg.querySelectorAll('circle').length).toBeGreaterThan(0);
    // Initialerne vises IKKE når en trøje er valgt
    expect(screen.queryByText('C')).not.toBeInTheDocument();
  });
});
