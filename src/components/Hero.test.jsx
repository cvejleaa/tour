// Tests for Hero-komponenten – titel, undertitel og chips.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Hero from './Hero';

describe('Hero – titel', () => {
  it('viser titel tekst', () => {
    render(<Hero title="VM 2026 Tip" />);
    expect(screen.getByText('VM 2026 Tip')).toBeInTheDocument();
  });

  it('viser 🚴 cykel emoji i titlen', () => {
    render(<Hero title="Tour de France Tip" />);
    expect(screen.getByText('🚴')).toBeInTheDocument();
  });

  it('viser h1 element', () => {
    render(<Hero title="Testtitel" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Testtitel');
  });

  it('hero wrapper har klassen "hero"', () => {
    const { container } = render(<Hero title="Test" />);
    expect(container.querySelector('.hero')).toBeInTheDocument();
  });
});

describe('Hero – undertitel', () => {
  it('viser undertitel når den er sat', () => {
    render(<Hero title="VM" subtitle="Afgiv dine tips inden kampstart" />);
    expect(screen.getByText('Afgiv dine tips inden kampstart')).toBeInTheDocument();
  });

  it('viser IKKE undertitel når den ikke er sat', () => {
    render(<Hero title="VM" />);
    // Ingen paragraf for undertitel
    expect(screen.queryByText(/Afgiv/)).not.toBeInTheDocument();
  });

  it('undertitel vises som paragraf-element', () => {
    const { container } = render(<Hero title="VM" subtitle="Test undertitel" />);
    expect(container.querySelector('.hero__subtitle')).toBeInTheDocument();
    expect(container.querySelector('.hero__subtitle').textContent).toBe('Test undertitel');
  });
});

describe('Hero – chips', () => {
  it('viser chips når de er sat', () => {
    render(<Hero title="VM" chips={['48 hold', '104 kampe', 'Dansk tid']} />);
    expect(screen.getByText('48 hold')).toBeInTheDocument();
    expect(screen.getByText('104 kampe')).toBeInTheDocument();
    expect(screen.getByText('Dansk tid')).toBeInTheDocument();
  });

  it('viser IKKE chip-container ved tomt chips-array', () => {
    const { container } = render(<Hero title="VM" chips={[]} />);
    expect(container.querySelector('.hero__badges')).not.toBeInTheDocument();
  });

  it('viser IKKE chip-container når chips ikke er sat (default = [])', () => {
    const { container } = render(<Hero title="VM" />);
    expect(container.querySelector('.hero__badges')).not.toBeInTheDocument();
  });

  it('chips har klassen "hero__chip"', () => {
    const { container } = render(<Hero title="VM" chips={['test']} />);
    const chips = container.querySelectorAll('.hero__chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toBe('test');
  });

  it('viser 3 chips korrekt', () => {
    const { container } = render(<Hero title="VM" chips={['A', 'B', 'C']} />);
    const chips = container.querySelectorAll('.hero__chip');
    expect(chips.length).toBe(3);
  });

  it('viser én chip korrekt', () => {
    render(<Hero title="VM" chips={['Kun ét']} />);
    expect(screen.getByText('Kun ét')).toBeInTheDocument();
  });
});

describe('Hero – komplet rendering', () => {
  it('renderer korrekt med alle props', () => {
    render(
      <Hero
        title="VM 2026 Tip"
        subtitle="Afgiv dine tips inden kampstart – point beregnes automatisk."
        chips={['48 hold', '104 kampe', 'Dansk tid']}
      />,
    );
    expect(screen.getByText('VM 2026 Tip')).toBeInTheDocument();
    expect(screen.getByText(/Afgiv dine tips/)).toBeInTheDocument();
    expect(screen.getByText('48 hold')).toBeInTheDocument();
  });

  it('renderer uden props uden at krashe', () => {
    expect(() => render(<Hero title="" />)).not.toThrow();
  });
});
