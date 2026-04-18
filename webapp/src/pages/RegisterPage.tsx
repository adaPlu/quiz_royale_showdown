import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@services/apiClient';
import { useAuthStore } from '@stores/authStore';

const schema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, underscores only'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);

  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      const resp = await api.post<{ user: Parameters<typeof setUser>[0]; accessToken: string; refreshToken: string }>('/auth/register', {
        username: data.username,
        email: data.email,
        password: data.password,
      });
      setAccessToken(resp.data.accessToken);
      setUser(resp.data.user);
      navigate('/home', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Registration failed. Please try again.';
      setError('root', { message: msg });
    }
  };

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white">Quiz Royale</h1>
          <p className="text-brand font-semibold text-xl">Showdown</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-game-surface rounded-3xl p-6 border border-game-border shadow-royale space-y-4">
          <h2 className="text-white text-xl font-bold text-center">Create Account</h2>

          <div>
            <label className="block text-xs text-game-muted mb-1">Username</label>
            <input
              {...register('username')}
              type="text"
              autoComplete="username"
              className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand transition-colors"
              placeholder="CoolPlayer99"
            />
            {errors.username && <p className="text-answer-wrong text-xs mt-1">{errors.username.message}</p>}
          </div>

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
              autoComplete="new-password"
              className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand transition-colors"
              placeholder="••••••••"
            />
            {errors.password && <p className="text-answer-wrong text-xs mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-xs text-game-muted mb-1">Confirm Password</label>
            <input
              {...register('confirmPassword')}
              type="password"
              autoComplete="new-password"
              className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand transition-colors"
              placeholder="••••••••"
            />
            {errors.confirmPassword && <p className="text-answer-wrong text-xs mt-1">{errors.confirmPassword.message}</p>}
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
            {isSubmitting ? 'Creating account…' : 'Create Account'}
          </button>

          <p className="text-center text-game-muted text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-brand hover:underline font-semibold">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
