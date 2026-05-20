import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockSetUser = vi.fn();
const mockSetTokens = vi.fn();
vi.mock('@stores/authStore', () => ({
  useAuthStore: (selector: (s: { setUser: typeof mockSetUser; setTokens: typeof mockSetTokens }) => unknown) =>
    selector({ setUser: mockSetUser, setTokens: mockSetTokens }),
}));

vi.mock('@services/apiClient', () => ({
  api: { post: vi.fn() },
}));

import LoginPage from '../LoginPage';
import { api } from '@services/apiClient';

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email and password fields', () => {
    renderPage();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows validation errors when submitted empty', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
  });

  it('calls api.post with credentials on valid submit', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { user: { id: 'u1', displayName: 'Alice', email: 'alice@example.com' }, accessToken: 'tok' },
    });
    renderPage();
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'alice@example.com', password: 'password123',
    }));
  });

  it('shows error message on failed login', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Invalid credentials'));
    renderPage();
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'bad@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it('navigates to /home on successful login', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { user: { id: 'u1', displayName: 'Alice', email: 'alice@example.com' }, accessToken: 'tok' },
    });
    renderPage();
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true }));
  });
});
