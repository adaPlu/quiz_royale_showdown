import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { api } from '@services/apiClient';
import { useAuthStore } from '@stores/authStore';

const schema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username must be at most 24 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
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
      }>('/auth/register', {
        displayName: data.username,
        email: data.email,
        password: data.password,
      });
      setTokens({ accessToken: response.data.accessToken });
      setUser({ ...response.data.user, username: data.username });
      navigate('/home', { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Registration failed. Please try again.';
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
          <h2 className="text-center text-xl font-bold text-white">Create Account</h2>

          <div>
            <label className="mb-1 block text-xs text-game-muted">Display Name</label>
            <input
              {...register('username')}
              type="text"
              autoComplete="username"
              className="w-full rounded-xl border border-game-border bg-game-card px-4 py-3 text-white placeholder-game-muted transition-colors focus:border-brand focus:outline-none"
              placeholder="CoolPlayer99"
            />
            {errors.username && <p className="mt-1 text-xs text-answer-wrong">{errors.username.message}</p>}
          </div>

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
              autoComplete="new-password"
              className="w-full rounded-xl border border-game-border bg-game-card px-4 py-3 text-white placeholder-game-muted transition-colors focus:border-brand focus:outline-none"
              placeholder="Password"
            />
            {errors.password && <p className="mt-1 text-xs text-answer-wrong">{errors.password.message}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-game-muted">Confirm Password</label>
            <input
              {...register('confirmPassword')}
              type="password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-game-border bg-game-card px-4 py-3 text-white placeholder-game-muted transition-colors focus:border-brand focus:outline-none"
              placeholder="Confirm password"
            />
            {errors.confirmPassword && <p className="mt-1 text-xs text-answer-wrong">{errors.confirmPassword.message}</p>}
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
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-game-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand hover:underline">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
