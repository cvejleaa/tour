import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DaySelector from './DaySelector';

const days = ['mandag 1. juni', 'tirsdag 2. juni', 'onsdag 3. juni'];

describe('DaySelector', () => {
  it('viser den valgte dag og kalder onChange ved pile', () => {
    const onChange = vi.fn();
    render(<DaySelector days={days} value="tirsdag 2. juni" onChange={onChange} />);
    expect(screen.getByText('tirsdag 2. juni')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('day-prev'));
    expect(onChange).toHaveBeenLastCalledWith('mandag 1. juni');
    fireEvent.click(screen.getByTestId('day-next'));
    expect(onChange).toHaveBeenLastCalledWith('onsdag 3. juni');
  });

  it('deaktiverer pile ved kanterne', () => {
    const { rerender } = render(<DaySelector days={days} value="mandag 1. juni" onChange={() => {}} />);
    expect(screen.getByTestId('day-prev')).toBeDisabled();
    expect(screen.getByTestId('day-next')).not.toBeDisabled();
    rerender(<DaySelector days={days} value="onsdag 3. juni" onChange={() => {}} />);
    expect(screen.getByTestId('day-next')).toBeDisabled();
  });

  it('rendrer intet uden dage', () => {
    const { container } = render(<DaySelector days={[]} value={null} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
