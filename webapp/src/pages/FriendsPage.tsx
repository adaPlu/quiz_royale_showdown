import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/services/apiClient';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FriendUser {
  friendshipId: string;
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface PendingRequest {
  friendshipId: string;
  requester: { id: string; displayName: string; avatarUrl?: string };
  createdAt?: string;
}

interface SearchUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

const fetchFriends = () => api.get<FriendUser[]>('/friends').then((r) => r.data);
const fetchPending = () =>
  api.get<{ pending: PendingRequest[] }>('/friends/pending').then((r) => r.data.pending);
const searchUsers = (q: string) =>
  api.get<SearchUser[]>('/users/search', { params: { q } }).then((r) => r.data);

// ─── Components ──────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#6C3EF5]/30 text-xs font-bold text-[#6C3EF5]">
      {initials}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FriendsPage() {
  const navigate = useNavigate();

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [requestSent, setRequestSent] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load friends + pending on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchFriends(), fetchPending()])
      .then(([f, p]) => {
        if (cancelled) return;
        setFriends(f);
        setPending(p);
      })
      .catch(() => !cancelled && setError('Failed to load friends.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  // Debounced search
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (value.length < 2) { setSearchResults([]); return; }
    searchDebounce.current = setTimeout(() => {
      searchUsers(value)
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 300);
  };

  const sendRequest = async (userId: string) => {
    try {
      await api.post('/friends/request', { addresseeId: userId });
      setRequestSent((prev) => new Set(prev).add(userId));
    } catch {
      setError('Could not send friend request.');
    }
  };

  const acceptRequest = async (friendshipId: string) => {
    try {
      await api.put(`/friends/${friendshipId}/accept`);
      const req = pending.find((p) => p.friendshipId === friendshipId);
      if (req) {
        setFriends((prev) => [
          ...prev,
          { friendshipId, id: req.requester.id, displayName: req.requester.displayName, avatarUrl: req.requester.avatarUrl },
        ]);
      }
      setPending((prev) => prev.filter((p) => p.friendshipId !== friendshipId));
    } catch {
      setError('Could not accept request.');
    }
  };

  const removeFriend = async (friendshipId: string) => {
    try {
      await api.delete(`/friends/${friendshipId}`);
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    } catch {
      setError('Could not remove friend.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E1A] px-4 py-6 text-white">
      <div className="mx-auto max-w-lg">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-white/50 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-black">Friends</h1>
          {loading && (
            <div className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-[#6C3EF5] border-t-transparent" />
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Search */}
        <section className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-white/40">Find Players</p>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by display name…"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-[#6C3EF5] focus:outline-none"
          />
          {searchResults.length > 0 && (
            <ul className="mt-2 space-y-2">
              {searchResults.map((user) => (
                <li key={user.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <Avatar name={user.displayName} />
                  <span className="flex-1 font-medium">{user.displayName}</span>
                  <button
                    type="button"
                    disabled={requestSent.has(user.id)}
                    onClick={() => sendRequest(user.id)}
                    className="rounded-xl bg-[#6C3EF5] px-4 py-1.5 text-xs font-bold disabled:bg-[#6C3EF5]/40 disabled:cursor-default"
                  >
                    {requestSent.has(user.id) ? 'Sent' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pending requests */}
        {pending.length > 0 && (
          <section className="mb-6">
            <p className="mb-2 text-xs uppercase tracking-[0.3em] text-white/40">
              Pending Requests ({pending.length})
            </p>
            <ul className="space-y-2">
              {pending.map((req) => (
                <li key={req.friendshipId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <Avatar name={req.requester.displayName} />
                  <span className="flex-1 font-medium">{req.requester.displayName}</span>
                  <button
                    type="button"
                    onClick={() => acceptRequest(req.friendshipId)}
                    className="rounded-xl bg-[#6C3EF5] px-4 py-1.5 text-xs font-bold hover:bg-[#5a32d4] transition-colors"
                  >
                    Accept
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Friends list */}
        <section>
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-white/40">
            My Friends ({friends.length})
          </p>
          {!loading && friends.length === 0 && (
            <p className="py-8 text-center text-sm text-white/30">
              No friends yet — search above to add some!
            </p>
          )}
          <ul className="space-y-2">
            {friends.map((friend) => (
              <li key={friend.friendshipId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <Avatar name={friend.displayName} />
                <span className="flex-1 font-medium">{friend.displayName}</span>
                <button
                  type="button"
                  onClick={() => removeFriend(friend.friendshipId)}
                  className="rounded-xl border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>

      </div>
    </div>
  );
}
