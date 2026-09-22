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
    onFavorite: vi.fn(),
    canFavorite: true,
    onCoaxial: vi.fn(),
    canCoaxial: true,
    onIsolate: vi.fn(),
    canIsolate: true,
    isolated: false,
    onShowAll: vi.fn(),
    canShowAll: true,
    onClose: vi.fn(),
    ...overrides,
  };
  render(<BuilderPanel {...props} />);
  return props;
}

test('runs each tool and says how many parts are picked', () => {
  const props = renderPanel();

  expect(screen.getByText('2/5')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^select all/i }));
  fireEvent.click(screen.getByRole('button', { name: /^deselect all/i }));
  fireEvent.click(screen.getByRole('button', { name: /^invert selection/i }));
  fireEvent.click(screen.getByRole('button', { name: /^multi-select/i }));
  fireEvent.click(screen.getByRole('button', { name: /^group$/i }));
  fireEvent.click(screen.getByRole('button', { name: /^line up coaxial/i }));
  fireEvent.click(screen.getByRole('button', { name: /^move$/i }));
  fireEvent.click(screen.getByRole('button', { name: /^split in half/i }));
  fireEvent.click(screen.getByRole('button', { name: /^isolate/i }));
  fireEvent.click(screen.getByRole('button', { name: /^show all/i }));
  fireEvent.click(screen.getByRole('button', { name: /^save to favorites/i }));

  expect(props.onSelectAll).toHaveBeenCalledOnce();
  expect(props.onDeselectAll).toHaveBeenCalledOnce();
  expect(props.onInvert).toHaveBeenCalledOnce();
  expect(props.onSticky).toHaveBeenCalledOnce();
  expect(props.onGroup).toHaveBeenCalledOnce();
  expect(props.onCoaxial).toHaveBeenCalledOnce();
  expect(props.onMove).toHaveBeenCalledOnce();
  expect(props.onSplit).toHaveBeenCalledOnce();
  expect(props.onIsolate).toHaveBeenCalledOnce();
  expect(props.onShowAll).toHaveBeenCalledOnce();
  expect(props.onFavorite).toHaveBeenCalledOnce();
});

test('holds back what cannot be done yet', () => {
  const props = renderPanel({
    picked: 0,
    canGroup: false,
    canUngroup: false,
    canMove: false,
    canSplit: false,
    canCoaxial: false,
  });

  const ungroup = screen.getByRole('button', { name: /^ungroup/i }) as HTMLButtonElement;
  const deselect = screen.getByRole('button', { name: /^deselect all/i }) as HTMLButtonElement;
  const split = screen.getByRole('button', { name: /^split in half/i }) as HTMLButtonElement;
  const coaxial = screen.getByRole('button', { name: /^line up coaxial/i }) as HTMLButtonElement;
  expect(ungroup.disabled).toBe(true);
  expect(deselect.disabled).toBe(true);
  expect(split.disabled).toBe(true);
  expect(coaxial.disabled).toBe(true);
  expect((screen.getByRole('button', { name: /^group$/i }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(ungroup);
  expect(props.onUngroup).not.toHaveBeenCalled();
});

test('lights up multi-select and isolate when they are on', () => {
  renderPanel({ sticky: true, isolated: true });
  expect(screen.getByRole('button', { name: /^multi-select/i }).className).toContain('bg-sky-100');
  expect(screen.getByRole('button', { name: /^isolate/i }).className).toContain('bg-sky-100');
});
