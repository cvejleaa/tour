// Tests for ScoreInput-komponenten.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScoreInput from './ScoreInput';

describe('ScoreInput', () => {
  it('renderer to input-felter og en gem-knap', () => {
    render(<ScoreInput onSave={() => {}} />);
    expect(screen.getByTestId('score-home')).toBeInTheDocument();
    expect(screen.getByTestId('score-away')).toBeInTheDocument();
    expect(screen.getByTestId('score-save')).toBeInTheDocument();
  });

  it('kalder onSave med korrekte numeriske værdier ved klik', () => {
    const onSave = vi.fn();
    render(<ScoreInput onSave={onSave} />);
    fireEvent.change(screen.getByTestId('score-home'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('score-away'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('score-save'));
    expect(onSave).toHaveBeenCalledWith({ home: 2, away: 1 });
  });

  it('deaktiverer gem-knap hvis felterne er tomme', () => {
    render(<ScoreInput onSave={() => {}} />);
    expect(screen.getByTestId('score-save')).toBeDisabled();
  });

  it('viser ikke gem-knap når disabled=true', () => {
    render(<ScoreInput onSave={() => {}} disabled home={1} away={0} />);
    expect(screen.queryByTestId('score-save')).not.toBeInTheDocument();
  });

  it('afviser negative tal (input validering)', () => {
    const onSave = vi.fn();
    render(<ScoreInput onSave={onSave} />);
    // Negative tal starter med '-', som ikke er et ciffer
    const homeInput = screen.getByTestId('score-home');
    fireEvent.change(homeInput, { target: { value: '-1' } });
    // Input bør forblive tomt (ugyldig karakter filtreres)
    expect(homeInput.value).toBe('');
  });

  it('kalder onSave med 0-0 score korrekt', () => {
    const onSave = vi.fn();
    render(<ScoreInput onSave={onSave} />);
    fireEvent.change(screen.getByTestId('score-home'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('score-away'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('score-save'));
    expect(onSave).toHaveBeenCalledWith({ home: 0, away: 0 });
  });

  it('viser initialt inputte værdier', () => {
    render(<ScoreInput home={3} away={2} onSave={() => {}} />);
    expect(screen.getByTestId('score-home').value).toBe('3');
    expect(screen.getByTestId('score-away').value).toBe('2');
  });

  it('afviser bogstaver i hjemme-input', () => {
    render(<ScoreInput onSave={() => {}} />);
    const homeInput = screen.getByTestId('score-home');
    fireEvent.change(homeInput, { target: { value: 'abc' } });
    expect(homeInput.value).toBe('');
  });

  it('afviser bogstaver i ude-input', () => {
    render(<ScoreInput onSave={() => {}} />);
    const awayInput = screen.getByTestId('score-away');
    fireEvent.change(awayInput, { target: { value: 'xyz' } });
    expect(awayInput.value).toBe('');
  });

  it('gem-knap er deaktiveret hvis kun hjemme-input er udfyldt', () => {
    render(<ScoreInput onSave={() => {}} />);
    fireEvent.change(screen.getByTestId('score-home'), { target: { value: '2' } });
    expect(screen.getByTestId('score-save')).toBeDisabled();
  });

  it('gem-knap er deaktiveret hvis kun ude-input er udfyldt', () => {
    render(<ScoreInput onSave={() => {}} />);
    fireEvent.change(screen.getByTestId('score-away'), { target: { value: '1' } });
    expect(screen.getByTestId('score-save')).toBeDisabled();
  });

  it('gem-knap aktiveres når begge felter er udfyldt', () => {
    render(<ScoreInput onSave={() => {}} />);
    fireEvent.change(screen.getByTestId('score-home'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('score-away'), { target: { value: '0' } });
    expect(screen.getByTestId('score-save')).not.toBeDisabled();
  });

  it('kalder IKKE onSave hvis felter er tomme', () => {
    const onSave = vi.fn();
    render(<ScoreInput onSave={onSave} />);
    // Forsøg at klikke uden input (knappen er disabled)
    const btn = screen.getByTestId('score-save');
    expect(btn).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('håndterer store score-tal korrekt (fx 10-0)', () => {
    const onSave = vi.fn();
    render(<ScoreInput onSave={onSave} />);
    fireEvent.change(screen.getByTestId('score-home'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('score-away'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('score-save'));
    expect(onSave).toHaveBeenCalledWith({ home: 10, away: 0 });
  });

  it('synkroniserer eksternt ændrede initialværdier', () => {
    const { rerender } = render(<ScoreInput home={1} away={0} onSave={() => {}} />);
    expect(screen.getByTestId('score-home').value).toBe('1');
    rerender(<ScoreInput home={3} away={2} onSave={() => {}} />);
    expect(screen.getByTestId('score-home').value).toBe('3');
    expect(screen.getByTestId('score-away').value).toBe('2');
  });

  it('input-felter har aria-labels', () => {
    render(<ScoreInput onSave={() => {}} />);
    expect(screen.getByLabelText('Hjemmemål')).toBeInTheDocument();
    expect(screen.getByLabelText('Udemål')).toBeInTheDocument();
  });

  it('afviser decimaltal (fx "1.5")', () => {
    render(<ScoreInput onSave={() => {}} />);
    const homeInput = screen.getByTestId('score-home');
    fireEvent.change(homeInput, { target: { value: '1.5' } });
    // "." er ikke et ciffer, så input bør afvises (forblive tomt)
    expect(homeInput.value).toBe('');
  });
});
