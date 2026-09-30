import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { SeamBrushBar, type SeamStrength, type SeamTool } from './seam-brush-bar';

afterEach(cleanup);

function renderBar(overrides: Partial<Parameters<typeof SeamBrushBar>[0]> = {}) {
  const props = {
    name: 'Receiver',
    tool: 'shave' as SeamTool,
    onTool: vi.fn(),
    radiusMm: 2,
    onRadius: vi.fn(),
    strength: 1 as SeamStrength,
    onStrength: vi.fn(),
    hasSource: false,
    pickingSource: false,
    onPickSource: vi.fn(),
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
  expect(props.onTool).toHaveBeenCalledWith('fill');
  fireEvent.click(screen.getByRole('button', { name: 'Klóna' }));
  expect(props.onTool).toHaveBeenCalledWith('clone');
  fireEvent.click(screen.getByRole('button', { name: 'Bursti 4 mm' }));
  expect(props.onRadius).toHaveBeenCalledWith(4);
  fireEvent.click(screen.getByRole('button', { name: 'Gróft' }));
  expect(props.onStrength).toHaveBeenCalledWith(2);
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

test('cloning asks for a source, and a tap on the source button picks one', () => {
  const props = renderBar({ tool: 'clone' });
  expect(screen.getByText(/uppruninn fylgir strokunni/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^uppruni$/i }));
  expect(props.onPickSource).toHaveBeenCalledWith(true);
});

test('shows the source as picked, and as being picked', () => {
  renderBar({ tool: 'clone', hasSource: true });
  expect(screen.getByRole('button', { name: /uppruni ✓/i })).toBeTruthy();
  cleanup();
  renderBar({ tool: 'clone', pickingSource: true });
  expect(screen.getByRole('button', { name: /smelltu á upprunann/i }).getAttribute('aria-pressed')).toBe('true');
});

test('has no source button unless cloning', () => {
  renderBar();
  expect(screen.queryByRole('button', { name: /uppruni/i })).toBeNull();
});

test('counts a single stroke in the singular', () => {
  renderBar({ strokes: 1 });
  expect(screen.getByText('1 stroka')).toBeTruthy();
});
