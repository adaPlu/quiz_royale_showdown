import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@services/apiClient';
import { useAuthStore } from '@stores/authStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserSearchResult {
  id: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
}

interface Friend {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface FriendsApiResponse {
  friends: Friend[];
}

// Track per-user send state for the search results
type SendState = 'idle' | 'loading' | 'sent' | 'already';

// ---------------------------------------------------------------------------
// FriendsPage
// ---------------------------------------------------------------------------

export default function FriendsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // --- Section A: Search ---
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sendStates, setSendStates] = useState<Record<string, SendState>>({});

  // --- Section C: Friends List ---
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  // Debounced search via useEffect + setTimeout
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);

    debounceRef.current = setTimeout(() => {
      let cancelled = false;

      api.get<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => {
          if (!cancelled) {
            setSearchResults(Array.isArray(res.data) ? res.data : []);
          }
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });

      return () => { cancelled = true; };
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Fetch friends on mount
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setFriendsLoading(true);
    setFriendsError(null);

    api.get<FriendsApiResponse>('/friends')
      .then((res) => {
        if (!cancelled) setFriends(res.data.friends ?? []);
      })
      .catch(() => {
        if (!cancelled) setFriendsError('Could not load friends list.');
      })
      .finally(() => {
        if (!cancelled) setFriendsLoading(false);
      });

    return () => { cancelled = true; };
  }, [user]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSendRequest = async (addresseeId: string) => {
    setSendStates((prev) => ({ ...prev, [addresseeId]: 'loading' }));
    try {
      await api.post('/friends/request', { addresseeId });
      setSendStates((prev) => ({ ...prev, [addresseeId]: 'sent' }));
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setSendStates((prev) => ({
        ...prev,
        [addresseeId]: status === 409 ? 'already' : 'idle',
      }));
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    setRemovingIds((prev) => new Set(prev).add(friendId));
    try {
      await api.delete(`/friends/${friendId}`);
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
    } catch {
      // Leave in list if removal fails
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(friendId);
        return next;
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderAddButton = (userId: string) => {
    const state = sendStates[userId] ?? 'idle';
    if (state === 'sent') {
      return (
        <span className="text-answer-correct text-xs font-semibold">Request sent</span>
      );
    }
    if (state === 'already') {
      return (
        <span className="text-game-muted text-xs font-semibold">Already sent</span>
      );
    }
    return (
      <button
        type="button"
        disabled={state === 'loading'}
        onClick={() => void handleSendRequest(userId)}
        className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60 transition"
      >
        {state === 'loading' ? 'Sending...' : 'Add Friend'}
      </button>
    );
  };

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-game-bg p-4 max-w-lg mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-game-muted hover:text-white text-sm transition"
        >
          Back
        </button>
        <h1 className="text-white text-2xl font-black">Friends</h1>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section A — Search & Add                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="mb-8">
        <h2 className="text-white font-bold text-lg mb-3">Search Players</h2>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a display name (min 2 chars)..."
          className="w-full bg-game-surface border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand text-sm"
        />

        <div className="mt-3 space-y-2">
          {searchLoading && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!searchLoading && query.trim().length >= 2 && searchResults.length === 0 && (
            <p className="text-game-muted text-sm text-center py-4">No players found.</p>
          )}

          {!searchLoading && searchResults.map((u) => {
            const name = u.displayName ?? u.username ?? u.id;
            return (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 bg-game-surface border border-game-border rounded-xl px-4 py-3"
              >
                <span className="text-white text-sm font-medium truncate">{name}</span>
                {renderAddButton(u.id)}
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section B — Pending Requests (TODO)                                 */}
      {/* ------------------------------------------------------------------ */}
      {/* TODO: Add pending incoming friend requests once a dedicated          */}
      {/* GET /api/v1/friends/pending endpoint is available on the backend.   */}

      {/* ------------------------------------------------------------------ */}
      {/* Section C — Friends List                                            */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="text-white font-bold text-lg mb-3">My Friends</h2>

        {friendsLoading && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!friendsLoading && friendsError && (
          <p className="text-answer-wrong text-sm text-center py-4">{friendsError}</p>
        )}

        {!friendsLoading && !friendsError && friends.length === 0 && (
          <p className="text-game-muted text-sm text-center py-4">
            No friends yet. Search for players above to add them.
          </p>
        )}

        {!friendsLoading && !friendsError && (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between gap-3 bg-game-surface border border-game-border rounded-xl px-4 py-3"
              >
                <span className="text-white text-sm font-medium truncate">{friend.displayName}</span>
                <button
                  type="button"
                  disabled={removingIds.has(friend.id)}
                  onClick={() => void handleRemoveFriend(friend.id)}
                  className="px-3 py-1.5 rounded-lg border border-game-border text-game-muted text-xs font-semibold hover:border-answer-wrong/50 hover:text-answer-wrong disabled:opacity-50 transition"
                >
                  {removingIds.has(friend.id) ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
