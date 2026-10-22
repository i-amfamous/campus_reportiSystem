import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, ThemeToggle, useTheme } from './theme';

function ThemeProbe() {
  const { theme } = useTheme();
  return <span>{theme}</span>;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('theme', () => {
  test('starts in light mode and toggles the dark class', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeProbe />
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(screen.getByText('light')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(screen.getByText('dark')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('campus-theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }));

    expect(screen.getByText('light')).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('campus-theme')).toBe('light');
  });

  test('restores the saved theme on mount', () => {
    localStorage.setItem('campus-theme', 'dark');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByText('dark')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('dark');
  });
});
