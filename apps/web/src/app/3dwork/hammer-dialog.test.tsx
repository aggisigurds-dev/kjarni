import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { HammerDialog } from './hammer-dialog';

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

test('shows the strike numbers and weighs the selected part in as the hammer', () => {
  render(<HammerDialog open onClose={vi.fn()} selected={{ name: 'Hammer v3', massG: 52.34 }} />);

  expect(screen.getByText('Hammer speed at the valve')).toBeTruthy();
  expect(screen.getAllByText(/m\/s$/).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: /Use Hammer v3/ }));
  const mass = screen.getByLabelText(/^Mass/) as HTMLInputElement;
  expect(mass.value).toBe('52.34');
});

test('remembers the marker between openings', () => {
  const { unmount } = render(<HammerDialog open onClose={vi.fn()} selected={null} />);
  const pressure = screen.getByLabelText(/^Pressure/) as HTMLInputElement;
  fireEvent.change(pressure, { target: { value: '70' } });
  unmount();

  render(<HammerDialog open onClose={vi.fn()} selected={null} />);
  expect((screen.getByLabelText(/^Pressure/) as HTMLInputElement).value).toBe('70');
});
