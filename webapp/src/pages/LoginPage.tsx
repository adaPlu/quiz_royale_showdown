import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { api } from '@services/apiClient';
import { useAuthStore } from '@stores/authStore';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const setTokens = useAuthStore((state) => state.setTokens);

  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      const response = await api.post<{
        user: Parameters<typeof setUser>[0];
        accessToken: string;
        refreshToken: string;
      }>('/auth/login', data);
      setTokens({ accessToken: response.data.accessToken, refreshToken: response.data.refreshToken });
      setUser(response.data.user);
      navigate('/home', { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login failed. Check your credentials.';
      setError('root', { message });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-game-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black text-white">Quiz Royale</h1>
          <p className="text-xl font-semibold text-brand">Showdown</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-3xl border border-game-border bg-game-surface p-6 shadow-royale">
          <h2 className="text-center text-xl font-bold text-white">Sign In</h2>

          <div>
            <label className="mb-1 block text-xs text-game-muted">Email</label>
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              className="w-full rounded-xl border border-game-border bg-game-card px-4 py-3 text-white placeholder-game-muted transition-colors focus:border-brand focus:outline-none"
              placeholder="you@example.com"
            />
            {errors.email && <p className="mt-1 text-xs text-answer-wrong">{errors.email.message}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-game-muted">Password</label>
            <input
              {...register('password')}
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-game-border bg-game-card px-4 py-3 text-white placeholder-game-muted transition-colors focus:border-brand focus:outline-none"
              placeholder="Password"
            />
            {errors.password && <p className="mt-1 text-xs text-answer-wrong">{errors.password.message}</p>}
          </div>

          {errors.root && (
            <p className="rounded-xl border border-red-800/40 bg-red-900/20 px-3 py-2 text-center text-sm text-answer-wrong">
              {errors.root.message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-brand py-3 text-lg font-bold text-white shadow-royale transition-all hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-game-muted">
            No account?{' '}
            <Link to="/register" className="font-semibold text-brand hover:underline">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
