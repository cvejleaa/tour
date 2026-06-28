import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmojiPicker, { CYCLING_EMOJIS } from './EmojiPicker';

describe('EmojiPicker', () => {
  it('viser ikke gitteret før man klikker', () => {
    render(<EmojiPicker onSelect={() => {}} />);
    expect(screen.queryByTestId('emoji-grid')).not.toBeInTheDocument();
  });

  it('åbner gitteret ved klik på knappen', () => {
    render(<EmojiPicker onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Indsæt emoji/i }));
    expect(screen.getByTestId('emoji-grid')).toBeInTheDocument();
  });

  it('kalder onSelect med valgt emoji og lukker gitteret', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Indsæt emoji/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Emoji 🚴' }));
    expect(onSelect).toHaveBeenCalledWith('🚴');
    expect(screen.queryByTestId('emoji-grid')).not.toBeInTheDocument();
  });

  it('viser et brugerdefineret sæt (cykling-avatarer) med egen triggerknap', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} emojis={CYCLING_EMOJIS} triggerLabel="🚴" label="Vælg avatar" />);
    fireEvent.click(screen.getByRole('button', { name: /Vælg avatar/i }));
    // Den gule trøje (🟡) er en del af cykling-sættet
    fireEvent.click(screen.getByRole('menuitem', { name: 'Emoji 🟡' }));
    expect(onSelect).toHaveBeenCalledWith('🟡');
  });

  it('CYCLING_EMOJIS har ingen dubletter', () => {
    expect(new Set(CYCLING_EMOJIS).size).toBe(CYCLING_EMOJIS.length);
  });
});
