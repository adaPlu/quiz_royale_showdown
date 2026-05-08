import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { apiGet, apiPost, apiPut, apiDelete } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock('@/services/apiClient', () => ({
  api: { get: apiGet, post: apiPost, put: apiPut, delete: apiDelete },
}));

import FriendsPage from '../FriendsPage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <FriendsPage />
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no friends, no pending
  apiGet.mockImplementation((url: string) => {
    if (url === '/friends') return Promise.resolve({ data: [] });
    if (url === '/friends/pending') return Promise.resolve({ data: { pending: [] } });
    return Promise.resolve({ data: [] });
  });
});

describe('FriendsPage', () => {
  it('renders the page title and search input', async () => {
    renderPage();
    expect(screen.getByText('Friends')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by display name/i)).toBeInTheDocument();
  });

  it('shows empty-state message when there are no friends', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no friends yet/i)).toBeInTheDocument(),
    );
  });

  it('renders each friend by display name', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/friends')
        return Promise.resolve({
          data: [
            { friendshipId: 'f1', id: 'u2', displayName: 'Bob' },
            { friendshipId: 'f2', id: 'u3', displayName: 'Carol' },
          ],
        });
      return Promise.resolve({ data: { pending: [] } });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('renders pending request section with Accept button', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/friends') return Promise.resolve({ data: [] });
      if (url === '/friends/pending')
        return Promise.resolve({
          data: {
            pending: [
              {
                friendshipId: 'fr1',
                requester: { id: 'u5', displayName: 'Dave' },
              },
            ],
          },
        });
      return Promise.resolve({ data: [] });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Dave')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
  });

  it('marks search result as Sent after add request', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.startsWith('/users/search'))
        return Promise.resolve({ data: [{ id: 'u99', displayName: 'Eve' }] });
      if (url === '/friends') return Promise.resolve({ data: [] });
      if (url === '/friends/pending') return Promise.resolve({ data: { pending: [] } });
      return Promise.resolve({ data: [] });
    });
    apiPost.mockResolvedValueOnce({});

    renderPage();
    await waitFor(() => screen.getByText(/no friends yet/i));

    const input = screen.getByPlaceholderText(/search by display name/i);
    await userEvent.type(input, 'Eve');

    await waitFor(() => expect(screen.getByText('Eve')).toBeInTheDocument(), { timeout: 2000 });
    const addButton = screen.getByRole('button', { name: /add/i });
    await userEvent.click(addButton);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sent/i })).toBeInTheDocument(),
    );
  });

  it('removes a friend from the list after Remove is clicked', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/friends')
        return Promise.resolve({ data: [{ friendshipId: 'f1', id: 'u2', displayName: 'Bob' }] });
      return Promise.resolve({ data: { pending: [] } });
    });
    apiDelete.mockResolvedValueOnce({});

    renderPage();
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());

    const removeButton = screen.getByRole('button', { name: /remove/i });
    await userEvent.click(removeButton);

    await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument());
  });
});
