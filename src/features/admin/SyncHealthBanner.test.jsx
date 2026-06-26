import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockStatus;
vi.mock('./useSyncStatus', () => ({
  useSyncStatus: () => ({ status: mockStatus, loading: false, error: '' }),
}));

import SyncHealthBanner from './SyncHealthBanner';

const tsAgo = (min) => ({ toDate: () => new Date(Date.now() - min * 60000) });

beforeEach(() => { mockStatus = null; });

describe('SyncHealthBanner', () => {
  it('viser "endnu ingen kørsel" når der ingen status er', () => {
    mockStatus = null;
    render(<SyncHealthBanner />);
    expect(screen.getByText(/endnu ingen kørsel/i)).toBeInTheDocument();
  });

  it('viser grøn "kører" når synken er frisk', () => {
    mockStatus = { lastSuccessAt: tsAgo(1), lastError: null };
    render(<SyncHealthBanner />);
    expect(screen.getByText(/Auto-synk kører/i)).toBeInTheDocument();
  });

  it('advarer når synken er forsinket', () => {
    mockStatus = { lastSuccessAt: tsAgo(20), lastError: null };
    render(<SyncHealthBanner />);
    expect(screen.getByText(/Ingen synk i/i)).toBeInTheDocument();
  });

  it('viser fejl når seneste kørsel fejlede', () => {
    mockStatus = { lastSuccessAt: tsAgo(30), lastError: 'FOOTBALL_DATA_TOKEN ikke sat' };
    render(<SyncHealthBanner />);
    expect(screen.getByText(/Auto-synk fejler/i)).toBeInTheDocument();
    expect(screen.getByText(/FOOTBALL_DATA_TOKEN ikke sat/i)).toBeInTheDocument();
  });
});
