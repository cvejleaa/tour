import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmojiPicker from './EmojiPicker';

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

  it('understøtter et brugerdefineret sæt + egen triggerknap', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} emojis={['🚴', '🐂']} triggerLabel="🚴" label="Vælg avatar" />);
    fireEvent.click(screen.getByRole('button', { name: /Vælg avatar/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Emoji 🐂' }));
    expect(onSelect).toHaveBeenCalledWith('🐂');
  });

  it('understøtter objekt-elementer { value, label, node } (fx tegnet trøje)', () => {
    const onSelect = vi.fn();
    const items = [{ value: 'jersey:polka', label: 'Prik-trøje', node: <svg data-testid="polka" /> }];
    render(<EmojiPicker onSelect={onSelect} emojis={items} label="Vælg avatar" />);
    fireEvent.click(screen.getByRole('button', { name: /Vælg avatar/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Prik-trøje' }));
    expect(onSelect).toHaveBeenCalledWith('jersey:polka');
  });
});
