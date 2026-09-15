import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { BuilderPanel } from './builder-panel';

afterEach(cleanup);

function renderPanel(overrides: Partial<Parameters<typeof BuilderPanel>[0]> = {}) {
  const props = {
    picked: 2,
    total: 5,
    sticky: false,
    onSticky: vi.fn(),
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onInvert: vi.fn(),
    onGroup: vi.fn(),
    canGroup: true,
    onUngroup: vi.fn(),
    canUngroup: false,
    onMove: vi.fn(),
    canMove: true,
    onSplit: vi.fn(),
    canSplit: true,
    onClose: vi.fn(),
    ...overrides,
  };
  render(<BuilderPanel {...props} />);
  return props;
}

test('runs each selection command and says how many parts are picked', () => {
  const props = renderPanel();

  expect(screen.getByText('2 of 5 picked')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^select all/i }));
  fireEvent.click(screen.getByRole('button', { name: /^deselect all/i }));
  fireEvent.click(screen.getByRole('button', { name: /^invert selection/i }));
  fireEvent.click(screen.getByRole('switch', { name: /sticky selection/i }));
  fireEvent.click(screen.getByRole('button', { name: /^group/i }));
  fireEvent.click(screen.getByRole('button', { name: /^move 2 parts/i }));
  fireEvent.click(screen.getByRole('button', { name: /^split in half/i }));

  expect(props.onSplit).toHaveBeenCalledOnce();
  expect(props.onSelectAll).toHaveBeenCalledOnce();
  expect(props.onDeselectAll).toHaveBeenCalledOnce();
  expect(props.onInvert).toHaveBeenCalledOnce();
  expect(props.onSticky).toHaveBeenCalledOnce();
  expect(props.onGroup).toHaveBeenCalledOnce();
  expect(props.onMove).toHaveBeenCalledOnce();
});

test('holds back what cannot be done yet', () => {
  const props = renderPanel({
    picked: 0,
    canGroup: false,
    canUngroup: false,
    canMove: false,
    canSplit: false,
  });

  const ungroup = screen.getByRole('button', { name: /^ungroup/i }) as HTMLButtonElement;
  const deselect = screen.getByRole('button', { name: /^deselect all/i }) as HTMLButtonElement;
  const split = screen.getByRole('button', { name: /^split in half/i }) as HTMLButtonElement;
  expect(ungroup.disabled).toBe(true);
  expect(deselect.disabled).toBe(true);
  expect(split.disabled).toBe(true);
  expect((screen.getByRole('button', { name: /^group/i }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(ungroup);
  expect(props.onUngroup).not.toHaveBeenCalled();
});

test('shows sticky selection as switched on', () => {
  renderPanel({ sticky: true });
  expect(screen.getByRole('switch', { name: /sticky selection/i }).getAttribute('aria-checked')).toBe(
    'true'
  );
});
