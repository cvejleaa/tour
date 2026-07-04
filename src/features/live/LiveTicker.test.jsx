import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockHook = vi.fn();
vi.mock('./useLiveTicker', () => ({ useLiveTicker: (...a) => mockHook(...a) }));

import LiveTicker from './LiveTicker';

const POSTS = [
  { id: 2, title: 'Bedste tid: 22\'49\'\'', text: 'Ti sekunder hurtigere.', picto: 'liv_finish', publicationAt: '2026-07-04T17:39:00+02:00', pinned: false, highlight: false },
  { id: 1, title: 'Etapen er i gang!', text: '', picto: 'liv_actual_start', publicationAt: '2026-07-04T17:05:00+02:00', pinned: false, highlight: true },
];

describe('LiveTicker', () => {
  it('viser opslag med titel, tekst og etapenummer', () => {
    mockHook.mockReturnValue({ posts: POSTS, updatedAt: '2026-07-04T17:40:00+02:00', failed: false });
    render(<LiveTicker stage={{ number: 1 }} enabled />);
    expect(screen.getByText(/Live fra etape 1/)).toBeInTheDocument();
    expect(screen.getByText(/Bedste tid/)).toBeInTheDocument();
    expect(screen.getByText('Ti sekunder hurtigere.')).toBeInTheDocument();
    expect(screen.getByText(/letour\.fr/)).toBeInTheDocument();
  });

  it('skjuler sig helt ved fejl', () => {
    mockHook.mockReturnValue({ posts: [], updatedAt: null, failed: true });
    const { container } = render(<LiveTicker stage={{ number: 1 }} enabled />);
    expect(container.firstChild).toBeNull();
  });

  it('skjuler sig uden opslag eller uden etape', () => {
    mockHook.mockReturnValue({ posts: [], updatedAt: null, failed: false });
    expect(render(<LiveTicker stage={{ number: 1 }} enabled />).container.firstChild).toBeNull();
    expect(render(<LiveTicker stage={null} enabled />).container.firstChild).toBeNull();
  });
});
