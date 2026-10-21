import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordField, StatusBadge } from './index';

describe('PasswordField', () => {
  test('keeps the value masked until the user reveals it', async () => {
    const user = userEvent.setup();
    render(<PasswordField aria-label="Password" defaultValue="SecretValue1" />);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(input).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});

describe('StatusBadge', () => {
  test('renders the student-facing label rather than the internal status name', () => {
    render(<StatusBadge status="AWAITING_STUDENT" label="Awaiting your response" />);
    expect(screen.getByText('Awaiting your response')).toBeInTheDocument();
  });
});
