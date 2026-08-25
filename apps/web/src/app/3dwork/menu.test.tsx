import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { Menu, MenuBar, MenuItem } from './menu';

afterEach(cleanup);

test('opens the Add panel on document.body so the 3D canvas cannot cover it', () => {
  render(
    <MenuBar>
      <Menu label="Add">
        <MenuItem>Box</MenuItem>
      </Menu>
    </MenuBar>
  );

  fireEvent.click(screen.getByRole('button', { name: /add/i }));

  const panel = screen.getByRole('menu');
  expect(document.body.contains(panel)).toBe(true);
  expect(panel.parentElement).toBe(document.body);
  expect(panel.className).toContain('fixed');
  expect(panel.className).toContain('z-[200]');
  expect(panel.className).toContain('bg-white');
  expect(screen.getByText('Box')).toBeTruthy();
});
