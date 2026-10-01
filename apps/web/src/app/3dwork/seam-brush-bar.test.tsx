import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { SeamBrushBar } from './seam-brush-bar';

afterEach(cleanup);

function renderBar(overrides: Partial<Parameters<typeof SeamBrushBar>[0]> = {}) {
  const props = {
    name: 'Receiver',
    mode: 'shave' as const,
    onMode: vi.fn(),
    radiusMm: 2,
    onRadius: vi.fn(),
    stepMm: 0.05,
    onStep: vi.fn(),
    turning: false,
    onTurning: vi.fn(),
    strokes: 3,
    onUndo: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<SeamBrushBar {...props} />);
  return props;
}

test('sets the brush and hands every choice back', () => {
  const props = renderBar();

  expect(screen.getByText('Saumbursti · Receiver')).toBeTruthy();
  expect(screen.getByText('3 strokur')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '+ Fylla' }));
  expect(props.onMode).toHaveBeenCalledWith('fill');
  fireEvent.click(screen.getByRole('button', { name: 'Bursti 4 mm' }));
  expect(props.onRadius).toHaveBeenCalledWith(4);
  fireEvent.click(screen.getByRole('button', { name: 'Gróft' }));
  expect(props.onStep).toHaveBeenCalledWith(0.15);
  fireEvent.click(screen.getByRole('button', { name: /snúa/i }));
  expect(props.onTurning).toHaveBeenCalledWith(true);

  fireEvent.click(screen.getByRole('button', { name: /afturkalla/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Vista' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hætta við' }));
  expect(props.onUndo).toHaveBeenCalledTimes(1);
  expect(props.onSave).toHaveBeenCalledTimes(1);
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

test('with no stroke made there is nothing to take back or keep, only to close', () => {
  const props = renderBar({ strokes: 0 });

  expect(screen.getByText('0 strokur')).toBeTruthy();
  expect((screen.getByRole('button', { name: /afturkalla/i }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Vista' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Loka' }));
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

test('counts a single stroke in the singular', () => {
  renderBar({ strokes: 1 });
  expect(screen.getByText('1 stroka')).toBeTruthy();
});
