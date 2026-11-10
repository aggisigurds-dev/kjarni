import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { AddStockDialog, DEFAULT_STOCK, stockSpec } from './add-stock-dialog';

afterEach(cleanup);

test('adds the pipe that was typed in', () => {
  const onAdd = vi.fn();
  render(<AddStockDialog onAdd={onAdd} onClose={vi.fn()} />);

  // It opens on 150 mm of ⌀25 pipe with a 2.5 mm wall.
  expect(screen.getByText(/inner ⌀ 20 mm/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/length mm/i), { target: { value: '90' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));

  expect(onAdd).toHaveBeenCalledWith({ kind: 'pipe', length: 90, diameter: 25, wall: 2.5 });
});

test('a rod has no wall, and a thread sets the diameter of a bolt', () => {
  const onAdd = vi.fn();
  render(<AddStockDialog onAdd={onAdd} onClose={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Rod' }));
  expect(screen.queryByLabelText(/wall mm/i)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(onAdd).toHaveBeenLastCalledWith({ kind: 'rod', length: 150, diameter: 25 });

  fireEvent.click(screen.getByRole('button', { name: 'Bolt' }));
  fireEvent.change(screen.getByLabelText(/thread/i), { target: { value: 'm8' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(onAdd).toHaveBeenLastCalledWith({
    kind: 'bolt',
    length: 150,
    diameter: 8,
    threadPitch: 1.25,
    threaded: true,
    threadStandardId: 'm8',
    headDiameter: 12.8,
    headHeight: 5.2,
  });
});

test('will not add a pipe whose wall leaves no hole', () => {
  expect(stockSpec({ ...DEFAULT_STOCK, wall: 12.5 })).toBeNull();
  expect(stockSpec({ ...DEFAULT_STOCK, length: 0 })).toBeNull();

  const onAdd = vi.fn();
  render(<AddStockDialog onAdd={onAdd} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/wall mm/i), { target: { value: '13' } });

  expect(screen.getByText(/leaves no hole/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(onAdd).not.toHaveBeenCalled();
});

test('closes on the backdrop, not on the card', () => {
  const onClose = vi.fn();
  render(<AddStockDialog onAdd={vi.fn()} onClose={onClose} />);

  fireEvent.click(screen.getByRole('dialog'));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
  expect(onClose).toHaveBeenCalledTimes(1);
});
