import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '@services/apiClient';
import { useMountedRef } from '@hooks/useMountedRef';
import { type AuthResponse, useAuthStore } from '@stores/authStore';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const mountedRef = useMountedRef();
  const setSession = useAuthStore((state) => state.setSession);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      const response = await api.post<AuthResponse>('/auth/login', {
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });

      if (!mountedRef.current) return;
      setSession(response.data);
      navigate('/home', { replace: true });
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : 'Login failed. Check your credentials.';
      setError('root', { message });
    }
  };

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white">Quiz Royale</h1>
          <p className="text-brand font-semibold text-xl">Showdown</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-game-surface rounded-3xl p-6 border border-game-border shadow-royale space-y-4"
        >
          <h2 className="text-white text-xl font-bold text-center">Sign In</h2>

          <div>
            <label className="block text-xs text-game-muted mb-1">Email</label>
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand transition-colors"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-answer-wrong text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-xs text-game-muted mb-1">Password</label>
            <input
              {...register('password')}
              type="password"
              autoComplete="current-password"
              className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand transition-colors"
              placeholder="********"
            />
            {errors.password && <p className="text-answer-wrong text-xs mt-1">{errors.password.message}</p>}
          </div>

          {errors.root && (
            <p className="text-answer-wrong text-sm text-center bg-red-900/20 border border-red-800/40 rounded-xl px-3 py-2">
              {errors.root.message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-brand text-white font-bold text-lg shadow-royale hover:opacity-90 disabled:opacity-60 transition-all"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-game-muted text-sm">
            No account?{' '}
            <Link to="/register" className="text-brand hover:underline font-semibold">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
