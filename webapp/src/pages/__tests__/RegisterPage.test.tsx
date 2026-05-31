import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ────────────────────────────────────────────────────────

const { mockNavigate, mockSetUser, mockSetTokens, mockApiPost } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSetUser: vi.fn(),
  mockSetTokens: vi.fn(),
  mockApiPost: vi.fn(),
}));

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@stores/authStore', () => ({
  useAuthStore: (
    selector: (s: { setUser: typeof mockSetUser; setTokens: typeof mockSetTokens }) => unknown,
  ) => selector({ setUser: mockSetUser, setTokens: mockSetTokens }),
}));

vi.mock('@services/apiClient', () => ({
  api: { post: mockApiPost },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import RegisterPage from '../RegisterPage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

async function fillValidForm({
  username = 'TestPlayer',
  email = 'test@example.com',
  password = 'Password123',
  confirmPassword = 'Password123',
}: {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
} = {}) {
  await userEvent.type(screen.getByLabelText(/display name/i), username);
  await userEvent.type(screen.getByLabelText(/^email$/i), email);
  // Use getByPlaceholderText to differentiate the two password fields
  const passwordInputs = screen.getAllByPlaceholderText(/password/i);
  // First input is "Password", second is "Confirm password"
  await userEvent.type(passwordInputs[0], password);
  await userEvent.type(passwordInputs[1], confirmPassword);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RegisterPage', () => {
  it('renders all form fields', () => {
    renderPage();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows validation error when password confirmation does not match', async () => {
    renderPage();
    await fillValidForm({ password: 'Password123', confirmPassword: 'DifferentPass1' });
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
  });

  it('shows validation error for short password', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/display name/i), 'Player');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'p@example.com');
    const passwordInputs = screen.getAllByPlaceholderText(/password/i);
    await userEvent.type(passwordInputs[0], 'short');
    await userEvent.type(passwordInputs[1], 'short');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('calls register API with correct payload on valid form submission', async () => {
    mockApiPost.mockResolvedValue({
      data: {
        user: { id: 'u1', displayName: 'TestPlayer', email: 'test@example.com' },
        accessToken: 'access-tok',
      },
    });
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('/auth/register', {
        displayName: 'TestPlayer',
        email: 'test@example.com',
        password: 'Password123',
      }),
    );
  });

  it('navigates to /home on successful registration', async () => {
    mockApiPost.mockResolvedValue({
      data: {
        user: { id: 'u1', displayName: 'TestPlayer', email: 'test@example.com' },
        accessToken: 'access-tok',
      },
    });
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true }),
    );
  });

  it('calls setUser and setTokens with data from API response', async () => {
    const fakeUser = { id: 'u2', displayName: 'NewUser', email: 'new@example.com' };
    mockApiPost.mockResolvedValue({
      data: { user: fakeUser, accessToken: 'new-tok' },
    });
    renderPage();
    await fillValidForm({ username: 'NewUser', email: 'new@example.com' });
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(mockSetTokens).toHaveBeenCalledWith({ accessToken: 'new-tok' }));
    await waitFor(() => expect(mockSetUser).toHaveBeenCalledWith(fakeUser));
  });

  it('shows server error message on failed registration', async () => {
    mockApiPost.mockRejectedValue(new Error('Email already in use'));
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/email already in use/i)).toBeInTheDocument();
  });

  it('shows generic fallback error when API throws a non-Error', async () => {
    mockApiPost.mockRejectedValue('unknown error');
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(
      await screen.findByText(/registration failed/i),
    ).toBeInTheDocument();
  });
});
