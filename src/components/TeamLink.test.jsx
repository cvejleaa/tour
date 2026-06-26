import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamLink from './TeamLink';

describe('TeamLink', () => {
  it('linker til holdets side når der er en kode', () => {
    render(
      <MemoryRouter>
        <TeamLink code="BRA"><span>Brasilien</span></TeamLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/hold/BRA');
    expect(link).toHaveTextContent('Brasilien');
  });

  it('rendrer children uden link når koden mangler', () => {
    render(
      <MemoryRouter>
        <TeamLink code={null}><span>TBD</span></TeamLink>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('TBD')).toBeInTheDocument();
  });
});
