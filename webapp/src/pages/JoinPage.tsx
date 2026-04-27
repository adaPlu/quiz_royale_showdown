import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/services/apiClient';

interface JoinResponse {
  roomId: string;
  status?: string;
  phase?: string;
}

export default function JoinPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteCode) {
      setError('Invalid or expired invite link.');
      return;
    }

    let cancelled = false;

    api.get<JoinResponse>(`/rooms/join/${inviteCode}`)
      .then((res) => {
        if (cancelled) return;
        const { roomId, status, phase } = res.data;
        const inProgress =
          status === 'in_progress' ||
          (phase !== undefined && phase !== 'WAITING');
        if (inProgress) {
          navigate(`/game/${roomId}`, { replace: true });
        } else {
          navigate(`/lobby/${roomId}`, { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError('Invalid or expired invite link.');
      });

    return () => { cancelled = true; };
  }, [inviteCode, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-game-bg flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-answer-wrong text-lg font-semibold text-center">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/home', { replace: true })}
          className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
